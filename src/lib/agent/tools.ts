import { tool, jsonSchema } from "ai";
import {
  fetchFileContent,
  fetchDirectoryListing,
  fetchRecursiveTree,
  searchCode,
  fetchRepoInfo,
  getBranchSha,
  createBranch,
  putFile,
  putFiles,
  deleteFile,
  createPullRequest,
  parseRepoSlug,
} from "@/lib/github/client";
import { searchWeb, formatSearchResults } from "@/lib/chat/web-search";
import { searchCodebase, formatHitsForModel } from "@/lib/indexing/search";
import { createContext7Tools } from "@/lib/context7/tools";
import { createSerenaTools } from "@/lib/serena/tools";

/** Most files one read_files call will fetch; the rest come back as skipped. */
const MAX_BATCH_READ_FILES = 12;
/**
 * Shared character ceiling for a batch read, matching read_file's single-file
 * default. A batch must not be able to flood the context with an order of
 * magnitude more text than a normal read — some models in the catalogue have
 * small windows, and a blown context fails the whole turn rather than one call.
 */
const BATCH_READ_TOTAL_BUDGET = 60_000;
/** Per-file default, sized so a typical source file arrives whole. */
const DEFAULT_BATCH_READ_PER_FILE = 15_000;

/**
 * Agent context — injected at construction time, not at tool-call time.
 *
 * The model only ever sees argument schemas (path, query, etc). The repo,
 * user identity, and access tokens are bound here so the model can never
 * point a write at a different repo or escalate to another user.
 */
export type AgentContext = {
  /** "owner/repo" — fixed for the entire turn */
  repoSlug: string;
  /** Celiuz AI user id — scopes semantic index lookups to this user's data. */
  userId: string;
  /** GitHub access token (GitHub App installation token). Optional for public read-only repo access. */
  githubToken?: string;
  /** True when this repo has a ready semantic index — enables search_codebase. */
  codebaseIndexed: boolean;
  /** Tavily key; null disables the web_search tool */
  tavilyKey: string | null;
  /** Context7 key; null disables Context7 documentation tools */
  context7Key: string | null;
  /** Serena MCP URL; null disables Serena semantic code tools */
  serenaUrl: string | null;
  /** Optional bearer token for a protected Serena MCP bridge */
  serenaAuthToken: string | null;
  /** Enable Serena write/execute tools. Default should stay false. */
  serenaAllowWriteTools: boolean;
  /** Branch name to write to. Created on first write call. */
  workBranch: string;
  /** Tracks branches we've created within this run (idempotent). */
  branchesCreated: Set<string>;
};

/* ─────────────────────────────────────────────────────────────────────────
 * Schema helpers (we use jsonSchema instead of zod to avoid a new dep)
 * ────────────────────────────────────────────────────────────────────── */

function schema<T>(s: object) {
  return jsonSchema<T>(s as never);
}

/* ─────────────────────────────────────────────────────────────────────────
 * Tool definitions
 *
 * Each one returns a (small) plain-object result that's safe to stringify
 * back into the model's context. We deliberately cap sizes so a single
 * tool call can't blow up the context window.
 * ────────────────────────────────────────────────────────────────────── */

export function createAgentTools(ctx: AgentContext) {
  const parsed = parseRepoSlug(ctx.repoSlug);
  if (!parsed) {
    throw new Error(`Invalid repo slug: ${ctx.repoSlug}`);
  }
  const { owner, name } = parsed;

  /** Lazily look up + cache the default branch so we know what to fork from. */
  let defaultBranchCache: string | null = null;
  async function getDefaultBranch(): Promise<string> {
    if (defaultBranchCache) return defaultBranchCache;
    const info = await fetchRepoInfo(owner, name, ctx.githubToken);
    defaultBranchCache = info.defaultBranch;
    return info.defaultBranch;
  }

  /**
   * Make sure the working state is ready for a write.
   *
   * Three cases:
   *
   *  1. **Repo is empty (no commits)** — `getBranchSha` returns null. We
   *     skip branch creation; the first `putFile` call below will commit
   *     to the default branch directly to bootstrap the repo. (Empty
   *     repos can't have feature branches anyway.)
   *
   *  2. **Repo has commits but our work branch doesn't exist yet** — we
   *     create the work branch off the default branch and write to it.
   *
   *  3. **Repo has commits and we already created the work branch
   *     earlier this turn** — fast path, just return.
   */
  async function ensureWorkBranch(writeToken: string): Promise<{
    branch: string;
    base: string;
    isEmptyRepo: boolean;
  }> {
    const base = await getDefaultBranch();

    if (ctx.branchesCreated.has(ctx.workBranch)) {
      return { branch: ctx.workBranch, base, isEmptyRepo: false };
    }

    const baseSha = await getBranchSha(owner, name, base, writeToken);

    if (baseSha === null) {
      // Empty repo — write directly to the default branch on first
      // commit. We mark the work branch as "already created" with a
      // sentinel so subsequent writes go to the same branch.
      ctx.branchesCreated.add(ctx.workBranch);
      // Also redirect future writes to `base` (the default branch),
      // since we can't create branches on an empty repo.
      ctx.workBranch = base;
      return { branch: base, base, isEmptyRepo: true };
    }

    await createBranch(owner, name, ctx.workBranch, baseSha, writeToken);
    ctx.branchesCreated.add(ctx.workBranch);
    return { branch: ctx.workBranch, base, isEmptyRepo: false };
  }

  const readTools = {
    /* ── READ tools ─────────────────────────────────────────────────── */

    list_files: tool({
      description:
        "List entries in the connected repository. Default depth=1 lists " +
        "just the immediate children of the given path. Use depth=2 or 3 " +
        "to see nested files in one call instead of recursing manually. " +
        "Heavy folders (node_modules, .next, build, etc.) are auto-skipped.",
      inputSchema: schema<{ path: string; depth?: number }>({
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              'Directory path relative to repo root, e.g. "src/components". Use "" for root.',
          },
          depth: {
            type: "number",
            description:
              "Recursion depth (1-3). Default 1 = immediate children only.",
            minimum: 1,
            maximum: 3,
          },
        },
        required: ["path"],
        additionalProperties: false,
      }),
      execute: async ({
        path,
        depth = 1,
      }: {
        path: string;
        depth?: number;
      }) => {
        const branch = await getDefaultBranch();
        try {
          if (depth <= 1) {
            const entries = await fetchDirectoryListing(
              owner,
              name,
              path,
              branch,
              ctx.githubToken,
            );
            return {
              path: path || "/",
              depth: 1,
              count: entries.length,
              entries: entries.map((e) => ({
                path: e.path,
                type: e.type,
                ...(e.size !== undefined ? { size: e.size } : {}),
              })),
            };
          }
          const result = await fetchRecursiveTree(
            owner,
            name,
            branch,
            ctx.githubToken,
            { maxDepth: depth, maxEntries: 300, subPath: path },
          );
          return {
            path: path || "/",
            depth,
            count: result.entries.length,
            truncated: result.truncated,
            entries: result.entries,
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("404") || msg.includes("409")) {
            return {
              path: path || "/",
              count: 0,
              entries: [],
              note: "Repository is empty (no commits yet). Use write_file to create the first file — it will be committed to the default branch as the bootstrap commit.",
            };
          }
          throw err;
        }
      },
    }),

    read_file: tool({
      description:
        "Read the contents of a single text file from the connected repository. " +
        "Returns up to 60,000 characters by default. Use list_files first to discover paths. " +
        "For large files, use offset and limit to page through the file; if truncated is true, call again with offset=next_offset. " +
        "When you already know you need 2+ files, call read_files once instead — each separate call costs a full model round trip.",
      inputSchema: schema<{ path: string; offset?: number; limit?: number }>({
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              'File path relative to repo root, e.g. "src/app/page.tsx".',
          },
          offset: {
            type: "integer",
            description:
              "Character offset to start reading from. Use next_offset from a truncated result to continue.",
            minimum: 0,
          },
          limit: {
            type: "integer",
            description: "Maximum characters to return. Defaults to 60000.",
            minimum: 1,
            maximum: 60000,
          },
        },
        required: ["path"],
        additionalProperties: false,
      }),
      execute: async ({
        path,
        offset = 0,
        limit = 60_000,
      }: {
        path: string;
        offset?: number;
        limit?: number;
      }) => {
        const branch = await getDefaultBranch();
        const file = await fetchFileContent(
          owner,
          name,
          path,
          branch,
          ctx.githubToken,
          { offset, limit },
        );
        return {
          path,
          offset: file.offset,
          limit: file.limit,
          truncated: file.truncated,
          next_offset: file.nextOffset,
          length: file.content.length,
          total_length: file.totalLength,
          content: file.content,
        };
      },
    }),

    /**
     * Batch read — the counterpart to write_files.
     *
     * Reading N files as N separate read_file calls costs N model round trips,
     * and the round trip is the expensive part: measured on a review of a
     * 4-file repo, the whole turn took 234s of which ~216s was the model
     * thinking across 8 sequential turns (~27s each) while the file fetches
     * themselves totalled well under a second. Four of those turns existed
     * only to ask for the next file.
     *
     * write_files already exists for exactly this reason and the agent prompt
     * says so ("each call adds latency"). Reading never got the same
     * treatment, so this closes that gap.
     */
    read_files: tool({
      description:
        "Read several files from the connected repository in ONE call. " +
        "STRONGLY PREFERRED over repeated read_file calls whenever you need 2+ files — " +
        "each separate read costs a full model round trip, so batching is dramatically faster. " +
        "Use list_files first to discover paths. Files are fetched in parallel and share a " +
        "character budget allocated by need, so small files never waste room and a file is only " +
        "cut when the batch genuinely cannot fit. Anything cut comes back with truncated set and " +
        "is named in truncated_note; re-read only those with read_file at offset=next_offset.",
      inputSchema: schema<{ paths: string[]; limit_per_file?: number }>({
        type: "object",
        properties: {
          paths: {
            type: "array",
            description:
              'File paths relative to repo root, e.g. ["README.md", "src/app/page.tsx"].',
            items: { type: "string" },
            minItems: 1,
            maxItems: MAX_BATCH_READ_FILES,
          },
          limit_per_file: {
            type: "integer",
            description: `Maximum characters per file. Defaults to ${DEFAULT_BATCH_READ_PER_FILE}. The combined total is capped at ${BATCH_READ_TOTAL_BUDGET}.`,
            minimum: 1,
            maximum: BATCH_READ_TOTAL_BUDGET,
          },
        },
        required: ["paths"],
        additionalProperties: false,
      }),
      execute: async ({
        paths,
        limit_per_file = DEFAULT_BATCH_READ_PER_FILE,
      }: {
        paths: string[];
        limit_per_file?: number;
      }) => {
        const branch = await getDefaultBranch();

        // Duplicates in one call are pure waste — the model sometimes repeats a
        // path it already listed. Order is preserved so the reply lines up with
        // what was asked for.
        const unique = [...new Set(paths)].slice(0, MAX_BATCH_READ_FILES);

        // Fetch first, allocate after.
        //
        // fetchFileContent downloads the whole blob and slices locally, so
        // asking for the full budget here costs nothing extra on the wire —
        // and knowing the real sizes is precisely what lets the budget be
        // shared by need rather than split blindly.
        //
        // In parallel: sequential fetches would reintroduce, at the network
        // layer, the serialisation this tool exists to remove.
        const fetched = await Promise.all(
          unique.map(async (path) => {
            try {
              const file = await fetchFileContent(owner, name, path, branch, ctx.githubToken, {
                offset: 0,
                limit: BATCH_READ_TOTAL_BUDGET,
              });
              return { path, file, error: null as string | null };
            } catch (err) {
              // One bad path must not fail the batch, or the model learns that
              // batching is risky and goes back to reading one at a time.
              return {
                path,
                file: null,
                error: err instanceof Error ? err.message : String(err),
              };
            }
          }),
        );

        /*
         * Share the budget by need, smallest first.
         *
         * An even split looked fair and was not. Measured on a real review:
         * README 2,921 · index.html 9,767 · style.css 17,517 · app.js 18,796.
         * Four files, 15,000 each — so README wasted 12,079 of its share while
         * the two largest were cut, and the model had to spend two more round
         * trips re-reading exactly those two. Their combined size is 49,001,
         * comfortably inside the 60,000 budget: nothing needed truncating at
         * all.
         *
         * Smallest-first means every file takes only what it needs and leaves
         * the remainder to widen the share of those still waiting. A file is
         * only ever cut when the batch genuinely cannot fit.
         */
        const ceiling = Math.min(limit_per_file, BATCH_READ_TOTAL_BUDGET);
        const readable = fetched.filter(
          (entry): entry is { path: string; file: NonNullable<typeof entry.file>; error: null } =>
            entry.file !== null,
        );
        const allowance = new Map<string, number>();
        let remaining = BATCH_READ_TOTAL_BUDGET;
        [...readable]
          .sort((a, b) => a.file.content.length - b.file.content.length)
          .forEach((entry, index, sorted) => {
            const fairShare = Math.floor(remaining / (sorted.length - index));
            const take = Math.min(entry.file.content.length, fairShare, ceiling);
            allowance.set(entry.path, take);
            remaining -= take;
          });

        const files = fetched.map(({ path, file, error }) => {
          if (!file) return { path, error, content: null };
          const content = file.content.slice(0, allowance.get(path) ?? 0);
          const truncated = content.length < file.totalLength;
          return {
            path,
            truncated,
            // Where read_file should resume if the model wants the rest.
            next_offset: truncated ? content.length : undefined,
            length: content.length,
            total_length: file.totalLength,
            content,
          };
        });

        const skipped = paths.length - unique.length;
        const cut = files.filter((f) => f.truncated).map((f) => f.path);
        return {
          branch,
          requested: paths.length,
          returned: files.length,
          ...(skipped > 0
            ? {
                skipped,
                note: `${skipped} path(s) were duplicates or beyond the ${MAX_BATCH_READ_FILES}-file limit. Call read_files again for the rest.`,
              }
            : {}),
          ...(cut.length > 0
            ? {
                truncated_note: `Did not fit the shared budget and were cut: ${cut.join(", ")}. Use read_file with offset=next_offset for the rest of those, and only those — every other file here is complete.`,
              }
            : {}),
          budget_remaining: remaining,
          files,
        };
      },
    }),

    search_code: tool({
      description:
        "Search the connected repository for code matching a query. " +
        "Returns up to 10 file paths with short snippets. Useful when you " +
        "don't know exactly which file to read.",
      inputSchema: schema<{ query: string }>({
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Search query. Plain keywords like 'useState' or 'login button'.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      }),
      execute: async ({ query }: { query: string }) => {
        const results = await searchCode(owner, name, query, ctx.githubToken);
        return { count: results.length, results };
      },
    }),

    ...(ctx.codebaseIndexed
      ? {
          search_codebase: tool({
            description:
              "Semantic search over this repository's indexed code. Use for CONCEPTUAL " +
              "questions ('where is billing handled', 'what calls spendCredits', 'how does " +
              "auth flow work') when you don't know exact symbol names — it is faster and " +
              "cheaper than crawling directories. Returns file pointers (path + line range " +
              "+ snippet); follow up with read_file for full context. Prefer search_code " +
              "(lexical) when you know the exact symbol name.",
            inputSchema: schema<{ query: string; limit?: number }>({
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description:
                    "Natural-language description of what you're looking for.",
                },
                limit: {
                  type: "number",
                  description: "Max results (1-20). Default 8.",
                  minimum: 1,
                  maximum: 20,
                },
              },
              required: ["query"],
              additionalProperties: false,
            }),
            execute: async ({
              query,
              limit,
            }: {
              query: string;
              limit?: number;
            }) => {
              const hits = await searchCodebase({
                userId: ctx.userId,
                repoFullName: ctx.repoSlug,
                query,
                limit,
              });
              return {
                count: hits.length,
                markdown: formatHitsForModel(ctx.repoSlug, hits),
              };
            },
          }),
        }
      : {}),

    web_search: tool({
      description:
        "Search the public web for current information outside the connected repository and library documentation. " +
        "Use this for current events, announcements, ecosystem comparisons, package release status, and community information. " +
        "For library or framework APIs, setup, migrations, and version-specific behavior, use the Context7 tools first.",
      inputSchema: schema<{ query: string }>({
        type: "object",
        properties: {
          query: { type: "string", description: "Search query." },
        },
        required: ["query"],
        additionalProperties: false,
      }),
      execute: async ({ query }: { query: string }) => {
        if (!ctx.tavilyKey) {
          return {
            error:
              "Web search is unavailable (TAVILY_API_KEY is not configured).",
          };
        }
        const r = await searchWeb(query, ctx.tavilyKey, {
          maxResults: 5,
          includeAnswer: true,
        });
        return { markdown: formatSearchResults(r) };
      },
    }),

    ...createContext7Tools({ context7Key: ctx.context7Key }),
    ...(ctx.serenaUrl
      ? createSerenaTools({
          serverUrl: ctx.serenaUrl,
          authToken: ctx.serenaAuthToken,
          allowWriteTools: ctx.serenaAllowWriteTools,
        })
      : {}),
  };

  if (!ctx.githubToken) {
    return readTools;
  }

  const writeToken = ctx.githubToken;

  return {
    ...readTools,

    /* ── WRITE tools (operate on workBranch, never main) ───────────── */

    write_files: tool({
      description:
        "Create or overwrite multiple files in one commit on a feature branch in the connected " +
        "repository. STRONGLY PREFERRED over repeated write_file calls when creating or rewriting 2+ files. " +
        "The branch is created automatically off the default branch the first time you write. " +
        "Always read existing files first before overwriting them.",
      inputSchema: schema<{
        files: Array<{ path: string; content: string }>;
        commit_message: string;
      }>({
        type: "object",
        properties: {
          files: {
            type: "array",
            description: "List of files to create or overwrite in a single commit.",
            minItems: 1,
            maxItems: 50,
            items: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "File path relative to repo root.",
                },
                content: {
                  type: "string",
                  description: "Full new contents of the file.",
                },
              },
              required: ["path", "content"],
              additionalProperties: false,
            },
          },
          commit_message: {
            type: "string",
            description: "Short commit message, conventional-commit style.",
          },
        },
        required: ["files", "commit_message"],
        additionalProperties: false,
      }),
      execute: async ({
        files,
        commit_message,
      }: {
        files: Array<{ path: string; content: string }>;
        commit_message: string;
      }) => {
        try {
          const { branch, isEmptyRepo } = await ensureWorkBranch(writeToken);
          const result = await putFiles(
            owner,
            name,
            files,
            branch,
            commit_message,
            writeToken,
          );
          return {
            success: true,
            stage: "write_files",
            branch,
            commit_sha: result.commitSha,
            files_written: result.filesWritten,
            paths: files.map((f) => f.path),
            method: result.fallback,
            lines_added: files.reduce(
              (total, file) => total + (file.content.length === 0 ? 0 : file.content.split(/\r?\n/).length),
              0,
            ),
            lines_deleted: 0,
            ...(isEmptyRepo
              ? {
                  note: "Repo was empty — committed directly to the default branch as the bootstrap commit. No pull request is needed; the work is already on the main branch.",
                }
              : {}),
          };
        } catch (err) {
          return {
            success: false,
            stage: "write_files",
            error: err instanceof Error ? err.message : String(err),
            paths: files.map((f) => f.path),
          };
        }
      },
    }),

    write_file: tool({
      description:
        "Create or overwrite a file on a feature branch in the connected " +
        "repository. The branch is created automatically off the default " +
        "branch the first time you write. NEVER writes to main directly. " +
        "Always read_file first to avoid clobbering unintended content.",
      inputSchema: schema<{
        path: string;
        content: string;
        commit_message: string;
      }>({
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path relative to repo root.",
          },
          content: {
            type: "string",
            description: "Full new contents of the file (UTF-8).",
          },
          commit_message: {
            type: "string",
            description: "Short commit message, conventional-commit style.",
          },
        },
        required: ["path", "content", "commit_message"],
        additionalProperties: false,
      }),
      execute: async ({
        path,
        content,
        commit_message,
      }: {
        path: string;
        content: string;
        commit_message: string;
      }) => {
        try {
          const { branch, isEmptyRepo } = await ensureWorkBranch(writeToken);
          const result = await putFile(
            owner,
            name,
            path,
            content,
            branch,
            commit_message,
            writeToken,
          );
          return {
            success: true,
            stage: "write_file",
            path,
            branch,
            commit_sha: result.commitSha,
            bytes_written: content.length,
            lines_added: content.length === 0 ? 0 : content.split(/\r?\n/).length,
            lines_deleted: 0,
            ...(isEmptyRepo
              ? {
                  note: "Repo was empty — committed directly to the default branch as the bootstrap commit. No pull request is needed; the work is already on the main branch.",
                }
              : {}),
          };
        } catch (err) {
          return {
            success: false,
            stage: "write_file",
            error: err instanceof Error ? err.message : String(err),
            path,
          };
        }
      },
    }),

    edit_file: tool({
      description:
        "Apply a small targeted edit to an existing file by replacing one " +
        "exact occurrence of a string with new text. PREFER this over " +
        "write_file for surgical changes (renaming a variable, fixing one " +
        "function, adding an import) — it preserves the rest of the file " +
        "verbatim and is much cheaper in tokens than rewriting the whole " +
        "file. The find string must match exactly (whitespace included) " +
        "and must appear exactly once in the file. If it appears multiple " +
        "times, expand find to include enough surrounding context to make " +
        "it unique. Returns an error if find is missing or ambiguous.",
      inputSchema: schema<{
        path: string;
        find: string;
        replace: string;
        commit_message: string;
      }>({
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path relative to repo root.",
          },
          find: {
            type: "string",
            description:
              "Exact substring to find. Must be unique within the file.",
          },
          replace: {
            type: "string",
            description: "Replacement text.",
          },
          commit_message: {
            type: "string",
            description: "Short commit message, conventional-commit style.",
          },
        },
        required: ["path", "find", "replace", "commit_message"],
        additionalProperties: false,
      }),
      execute: async ({
        path,
        find,
        replace,
        commit_message,
      }: {
        path: string;
        find: string;
        replace: string;
        commit_message: string;
      }) => {
        try {
          // Read from the work branch if it exists (so edits after a
          // write_file in the same turn see the latest content), otherwise
          // fall back to the default branch.
          const baseRef = ctx.branchesCreated.has(ctx.workBranch)
            ? ctx.workBranch
            : await getDefaultBranch();
          let original: { content: string; truncated: boolean };
          try {
            original = await fetchFileContent(
              owner,
              name,
              path,
              baseRef,
              writeToken,
            );
          } catch (err) {
            return {
              success: false,
              stage: "edit_file",
              error:
                `Could not read ${path}: ` +
                (err instanceof Error ? err.message : String(err)) +
                ". Use list_files to confirm the path, or write_file to create a new file.",
            };
          }
          if (original.truncated) {
            return {
              success: false,
              stage: "edit_file",
              error: `${path} is too large to safely edit (>60,000 chars). read_file can page through it with offset/limit, but edit_file requires the complete file to avoid corrupting unseen content. Use write_file with the full new content if you really need to change it.`,
            };
          }

          const occurrences = original.content.split(find).length - 1;
          if (occurrences === 0) {
            return {
              success: false,
              stage: "edit_file",
              error:
                `'find' string not found in ${path}. Read the file first and ` +
                `copy the exact substring (whitespace included) you want to replace.`,
            };
          }
          if (occurrences > 1) {
            return {
              success: false,
              stage: "edit_file",
              error:
                `'find' string matches ${occurrences} places in ${path}. Expand it ` +
                `with surrounding context until it matches exactly once.`,
            };
          }

          const newContent = original.content.replace(find, replace);
          const countLines = (value: string) =>
            value.length === 0 ? 0 : value.split(/\r?\n/).length;
          const linesDeleted = countLines(find);
          const linesAdded = countLines(replace);
          const { branch, isEmptyRepo } = await ensureWorkBranch(writeToken);
          const result = await putFile(
            owner,
            name,
            path,
            newContent,
            branch,
            commit_message,
            writeToken,
          );

          return {
            success: true,
            stage: "edit_file",
            path,
            branch,
            commit_sha: result.commitSha,
            bytes_changed: Math.abs(newContent.length - original.content.length),
            lines_added: linesAdded,
            lines_deleted: linesDeleted,
            old_length: original.content.length,
            new_length: newContent.length,
            ...(isEmptyRepo
              ? {
                  note: "Repo was empty — committed directly to the default branch as the bootstrap commit. No pull request is needed.",
                }
              : {}),
          };
        } catch (err) {
          return {
            success: false,
            stage: "edit_file",
            error: err instanceof Error ? err.message : String(err),
            path,
          };
        }
      },
    }),

    delete_file: tool({
      description:
        "Delete a single existing file from the connected repository on the agent's feature branch. " +
        "The branch is created automatically off the default branch the first time you write or delete. " +
        "Only deletes regular files; directories are rejected. Missing files are treated as already deleted.",
      inputSchema: schema<{
        path: string;
        commit_message: string;
      }>({
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path relative to repo root.",
          },
          commit_message: {
            type: "string",
            description: "Short commit message, conventional-commit style.",
          },
        },
        required: ["path", "commit_message"],
        additionalProperties: false,
      }),
      execute: async ({
        path,
        commit_message,
      }: {
        path: string;
        commit_message: string;
      }) => {
        try {
          // Preflight check: read ref branch if already created, otherwise default branch
          const baseRef = ctx.branchesCreated.has(ctx.workBranch)
            ? ctx.workBranch
            : await getDefaultBranch();

          try {
            const original = await fetchFileContent(
              owner,
              name,
              path,
              baseRef,
              writeToken,
              { offset: 0, limit: 1 },
            );
            if (original.truncated && original.content === "") {
              // Unlikely to happen with limit 1, but keep type-safe check
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("404") || msg.includes("409")) {
              return {
                success: true,
                stage: "delete_file",
                path,
                deleted: false,
                commit_sha: null,
                note: "File did not exist; no deletion commit was created.",
              };
            }
            if (msg.includes("not a regular file")) {
              return {
                success: false,
                stage: "delete_file",
                path,
                error: `Cannot delete ${path}: it is not a regular file. delete_file only deletes files, not directories.`,
              };
            }
            throw err;
          }

          const { branch, isEmptyRepo } = await ensureWorkBranch(writeToken);
          const result = await deleteFile(
            owner,
            name,
            path,
            branch,
            commit_message,
            writeToken,
          );

          return {
            success: true,
            stage: "delete_file",
            path,
            branch,
            deleted: result.deleted,
            commit_sha: result.commitSha,
            ...(result.reason === "missing"
              ? {
                  note: "File did not exist on the work branch; no deletion commit was created.",
                }
              : {}),
            ...(isEmptyRepo
              ? {
                  note: "Repo was empty — there was no file to delete.",
                }
              : {}),
          };
        } catch (err) {
          return {
            success: false,
            stage: "delete_file",
            error: err instanceof Error ? err.message : String(err),
            path,
          };
        }
      },
    }),

    create_pull_request: tool({
      description:
        "Open a pull request from the agent's working branch into the " +
        "default branch. Call this AFTER all desired write_file/write_files/edit_file/delete_file " +
        "calls are done. Returns the PR URL and number.",
      inputSchema: schema<{ title: string; body: string }>({
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "PR title — concise, under 70 characters.",
          },
          body: {
            type: "string",
            description:
              "Markdown PR description summarizing the changes and rationale.",
          },
        },
        required: ["title", "body"],
        additionalProperties: false,
      }),
      execute: async ({ title, body }: { title: string; body: string }) => {
        try {
          if (!ctx.branchesCreated.has(ctx.workBranch)) {
            return {
              success: false,
              stage: "create_pull_request",
              error:
                "No changes to PR — call write_file at least once before opening a pull request.",
            };
          }
          const base = await getDefaultBranch();
          if (ctx.workBranch === base) {
            return {
              success: true,
              stage: "create_pull_request",
              note: `Changes were committed directly to '${base}' (the repo was empty when this turn started). No pull request is needed — '${title}' is already live on the default branch.`,
              base,
              branch: base,
            };
          }
          const pr = await createPullRequest(
            owner,
            name,
            ctx.workBranch,
            base,
            title,
            body,
            writeToken,
          );
          return {
            success: true,
            stage: "create_pull_request",
            url: pr.url,
            number: pr.number,
            branch: ctx.workBranch,
            base,
          };
        } catch (err) {
          return {
            success: false,
            stage: "create_pull_request",
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    }),

    report_state: tool({
      description:
        "Report the SEMANTIC context of the current task. Call this once at the " +
        "end of a turn so the UI can show relevant next-step actions. Send ONLY " +
        "semantic info — do NOT report success/failure/exitCode/tool status; the " +
        "orchestrator derives those from actual tool results. Be honest and concise.",
      inputSchema: schema<{
        taskType: string;
        objective: string;
        summary: string;
        suggestedActions?: string[];
      }>({
        type: "object",
        properties: {
          taskType: {
            type: "string",
            description:
              "Category of work: 'audit', 'ui', 'debugging', 'git', 'deploy', " +
              "'feature', 'refactor', 'test', 'docs', or a short custom label. " +
              "Describes WHAT kind of task, not whether it succeeded.",
          },
          objective: {
            type: "string",
            description: "The user's actual goal for this task (one sentence).",
          },
          summary: {
            type: "string",
            description: "What you did / found this turn (1-2 sentences, factual).",
          },
          suggestedActions: {
            type: "array",
            description:
              "The 1-3 concrete next steps you offered the user in your reply, " +
              "as short actionable Indonesian labels (e.g. 'Implementasikan trend time-series', " +
              "'Koreksi bagian audit yang terlewat'). Mirror what you actually offered — " +
              "these become the tappable follow-up buttons.",
            items: { type: "string" },
            maxItems: 3,
          },
        },
        required: ["taskType", "objective", "summary"],
        additionalProperties: false,
      }),
      execute: async ({
        taskType,
        objective,
        summary,
        suggestedActions,
      }: {
        taskType: string;
        objective: string;
        summary: string;
        suggestedActions?: string[];
      }) => {
        // LLM provides only semantic context. The orchestrator (chat route
        // onFinish) reads this tool result, merges execution-derived status
        // (success/fail/finishReason/nextCapabilities) from the other tool
        // results, and emits the final AgentCompletionState as message
        // metadata. This tool just acknowledges receipt.
        return {
          success: true,
          stage: "report_state",
          taskType,
          objective,
          summary,
          suggestedActions,
        };
      },
    }),
  };
}

export type AgentTools = ReturnType<typeof createAgentTools>;
export const AGENT_TOOL_NAMES = [
  "list_files",
  "read_file",
  "search_code",
  "search_codebase",
  "web_search",
  "context7_search_library",
  "context7_get_docs",
  "serena_list_tools",
  "serena_call_tool",
  "write_files",
  "write_file",
  "edit_file",
  "create_pull_request",
  "report_state",
] as const;
export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

/** Generate a unique work-branch name for an agent run. */
export function generateWorkBranchName(): string {
  const date = new Date().toISOString().slice(0, 10);
  const id = Math.random().toString(36).slice(2, 8);
  return `celiuz/${date}-${id}`;
}

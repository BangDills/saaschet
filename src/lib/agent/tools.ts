import { tool, jsonSchema } from "ai";
import {
  fetchFileContent,
  fetchDirectoryListing,
  searchCode,
  fetchRepoInfo,
  getBranchSha,
  createBranch,
  putFile,
  createPullRequest,
  parseRepoSlug,
} from "@/lib/github/client";
import { searchWeb, formatSearchResults } from "@/lib/chat/web-search";

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
  /** GitHub access token from profiles.github_token */
  githubToken: string;
  /** Tavily key; null disables the web_search tool */
  tavilyKey: string | null;
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
  async function ensureWorkBranch(): Promise<{
    branch: string;
    base: string;
    isEmptyRepo: boolean;
  }> {
    const base = await getDefaultBranch();

    if (ctx.branchesCreated.has(ctx.workBranch)) {
      return { branch: ctx.workBranch, base, isEmptyRepo: false };
    }

    const baseSha = await getBranchSha(owner, name, base, ctx.githubToken);

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

    await createBranch(owner, name, ctx.workBranch, baseSha, ctx.githubToken);
    ctx.branchesCreated.add(ctx.workBranch);
    return { branch: ctx.workBranch, base, isEmptyRepo: false };
  }

  return {
    /* ── READ tools ─────────────────────────────────────────────────── */

    list_files: tool({
      description:
        "List entries in a directory of the connected repository. " +
        "Use this to explore the codebase before reading or editing files. " +
        "Pass an empty path to list the repo root.",
      inputSchema: schema<{ path: string }>({
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              'Directory path relative to repo root, e.g. "src/components" or "" for root.',
          },
        },
        required: ["path"],
        additionalProperties: false,
      }),
      execute: async ({ path }: { path: string }) => {
        const branch = await getDefaultBranch();
        try {
          const entries = await fetchDirectoryListing(
            owner,
            name,
            path,
            branch,
            ctx.githubToken,
          );
          return {
            path: path || "/",
            count: entries.length,
            entries: entries.map((e) => ({
              path: e.path,
              type: e.type,
              ...(e.size !== undefined ? { size: e.size } : {}),
            })),
          };
        } catch (err) {
          // Empty repos return 404 here.
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
        "Returns up to ~60KB of text. Use list_files first to discover paths.",
      inputSchema: schema<{ path: string }>({
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              'File path relative to repo root, e.g. "src/app/page.tsx".',
          },
        },
        required: ["path"],
        additionalProperties: false,
      }),
      execute: async ({ path }: { path: string }) => {
        const branch = await getDefaultBranch();
        const file = await fetchFileContent(
          owner,
          name,
          path,
          branch,
          ctx.githubToken,
        );
        return {
          path,
          truncated: file.truncated,
          length: file.content.length,
          content: file.content,
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

    web_search: tool({
      description:
        "Search the public web for up-to-date information not in the repo. " +
        "Use this for documentation lookups, current events, package versions, etc.",
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

    /* ── WRITE tools (operate on workBranch, never main) ───────────── */

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
        const { branch, isEmptyRepo } = await ensureWorkBranch();
        const result = await putFile(
          owner,
          name,
          path,
          content,
          branch,
          commit_message,
          ctx.githubToken,
        );
        return {
          path,
          branch,
          commit_sha: result.commitSha,
          bytes_written: content.length,
          ...(isEmptyRepo
            ? {
                note: "Repo was empty — committed directly to the default branch as the bootstrap commit. No pull request is needed; the work is already on the main branch.",
              }
            : {}),
        };
      },
    }),

    create_pull_request: tool({
      description:
        "Open a pull request from the agent's working branch into the " +
        "default branch. Call this AFTER all desired write_file calls " +
        "are done. Returns the PR URL and number.",
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
        if (!ctx.branchesCreated.has(ctx.workBranch)) {
          return {
            error:
              "No changes to PR — call write_file at least once before opening a pull request.",
          };
        }
        const base = await getDefaultBranch();
        if (ctx.workBranch === base) {
          return {
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
          ctx.githubToken,
        );
        return {
          url: pr.url,
          number: pr.number,
          branch: ctx.workBranch,
          base,
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
  "web_search",
  "write_file",
  "create_pull_request",
] as const;
export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

/** Generate a unique work-branch name for an agent run. */
export function generateWorkBranchName(): string {
  const date = new Date().toISOString().slice(0, 10);
  const id = Math.random().toString(36).slice(2, 8);
  return `horizon-ai/${date}-${id}`;
}

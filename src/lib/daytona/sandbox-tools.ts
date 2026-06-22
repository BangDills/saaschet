import { tool, jsonSchema } from "ai";
import type { Sandbox } from "@daytona/sdk";

/**
 * Context for sandbox tools — the sandbox instance is created in the
 * chat route and shared across the agent's multi-step loop.
 */
export type SandboxContext = {
  sandbox: Sandbox;
  /** "owner/repo" for git clone */
  repoSlug: string;
  /** GitHub token for private repo cloning */
  githubToken: string;
  /** Whether the repo has been cloned into the sandbox already */
  repoCloned: boolean;
};

function schema<T>(s: object) {
  return jsonSchema<T>(s as never);
}

const MAX_OUTPUT = 8_000;

function truncate(s: string, max = MAX_OUTPUT): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n\n… [truncated, ${s.length - max} chars omitted]`;
}

/**
 * Creates agent tools that execute inside a Daytona sandbox.
 */
export function createSandboxTools(ctx: SandboxContext) {
  return {
    run_command: tool({
      description:
        "Execute a shell command inside the sandbox environment. " +
        "Use this to run build commands (npm install, npm test), " +
        "check output, list files, or any other terminal operation. " +
        "The repo is cloned at workspace/repo.",
      inputSchema: schema<{
        command: string;
        cwd?: string;
        timeout?: number;
      }>({
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Shell command to execute (e.g. 'npm test', 'ls -la').",
          },
          cwd: {
            type: "string",
            description:
              "Working directory relative to sandbox root. " +
              "Default: workspace/repo (the cloned repo).",
          },
          timeout: {
            type: "number",
            description: "Timeout in seconds. Default: 30.",
          },
        },
        required: ["command"],
        additionalProperties: false,
      }),
      execute: async ({
        command,
        cwd,
        timeout,
      }: {
        command: string;
        cwd?: string;
        timeout?: number;
      }) => {
        if (!ctx.repoCloned) {
          await cloneRepo(ctx);
        }
        try {
          const response = await ctx.sandbox.process.executeCommand(
            command,
            cwd || "workspace/repo",
            undefined,
            timeout || 30,
          );
          return {
            exitCode: response.exitCode,
            output: truncate(response.result || ""),
          };
        } catch (err) {
          return {
            exitCode: 1,
            output: `Error: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    }),

    execute_code: tool({
      description:
        "Execute a code snippet directly in the sandbox. " +
        "Supports TypeScript. Good for quick scripts or testing logic.",
      inputSchema: schema<{
        code: string;
        timeout?: number;
      }>({
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "The code to execute.",
          },
          timeout: {
            type: "number",
            description: "Timeout in seconds. Default: 15.",
          },
        },
        required: ["code"],
        additionalProperties: false,
      }),
      execute: async ({
        code,
        timeout,
      }: {
        code: string;
        timeout?: number;
      }) => {
        try {
          const response = await ctx.sandbox.process.codeRun(
            code,
            undefined,
            timeout || 15,
          );
          return {
            exitCode: response.exitCode,
            output: truncate(response.result || ""),
          };
        } catch (err) {
          return {
            exitCode: 1,
            output: `Error: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    }),

    sandbox_read_file: tool({
      description:
        "Read the contents of a file from the sandbox filesystem. " +
        "Path is relative to the repo root (workspace/repo/).",
      inputSchema: schema<{ path: string }>({
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path relative to repo root.",
          },
        },
        required: ["path"],
        additionalProperties: false,
      }),
      execute: async ({ path }: { path: string }) => {
        if (!ctx.repoCloned) {
          await cloneRepo(ctx);
        }
        try {
          const response = await ctx.sandbox.process.executeCommand(
            `cat "workspace/repo/${path}"`,
          );
          if (response.exitCode !== 0) {
            return { error: `File not found or unreadable: ${path}` };
          }
          return { content: truncate(response.result || "") };
        } catch (err) {
          return {
            error: `Failed to read ${path}: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    }),

    sandbox_write_file: tool({
      description:
        "Write content to a file in the sandbox filesystem. " +
        "Creates the file if it doesn't exist. " +
        "Path is relative to the repo root (workspace/repo/). " +
        "For writing MULTIPLE files at once, prefer sandbox_write_files instead.",
      inputSchema: schema<{ path: string; content: string }>({
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path relative to repo root.",
          },
          content: {
            type: "string",
            description: "File content to write.",
          },
        },
        required: ["path", "content"],
        additionalProperties: false,
      }),
      execute: async ({ path, content }: { path: string; content: string }) => {
        if (!ctx.repoCloned) {
          await cloneRepo(ctx);
        }
        try {
          const fullPath = `workspace/repo/${path}`;
          const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
          if (dir) {
            await ctx.sandbox.process.executeCommand(`mkdir -p "${dir}"`);
          }
          // Use base64 to safely transfer content with special chars
          const b64 = Buffer.from(content).toString("base64");
          await ctx.sandbox.process.executeCommand(
            `echo "${b64}" | base64 -d > "${fullPath}"`,
          );
          return { success: true, path };
        } catch (err) {
          return {
            success: false,
            error: `Failed to write ${path}: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    }),

    sandbox_write_files: tool({
      description:
        "Write MULTIPLE files in a SINGLE tool call. " +
        "Much faster than calling sandbox_write_file repeatedly. " +
        "Use this whenever you need to create 2+ files (e.g. scaffolding a project). " +
        "Each file has a path (relative to repo root) and content.",
      inputSchema: schema<{
        files: { path: string; content: string }[];
      }>({
        type: "object",
        properties: {
          files: {
            type: "array",
            description: "Array of files to write.",
            items: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "File path relative to repo root.",
                },
                content: {
                  type: "string",
                  description: "File content to write.",
                },
              },
              required: ["path", "content"],
            },
          },
        },
        required: ["files"],
        additionalProperties: false,
      }),
      execute: async ({
        files,
      }: {
        files: { path: string; content: string }[];
      }) => {
        if (!ctx.repoCloned) {
          await cloneRepo(ctx);
        }

        const results: { path: string; success: boolean; error?: string }[] = [];

        // Write all files in parallel for maximum speed
        await Promise.all(
          files.map(async ({ path, content }) => {
            try {
              const fullPath = `workspace/repo/${path}`;
              const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
              if (dir) {
                await ctx.sandbox.process.executeCommand(`mkdir -p "${dir}"`);
              }
              const b64 = Buffer.from(content).toString("base64");
              await ctx.sandbox.process.executeCommand(
                `echo "${b64}" | base64 -d > "${fullPath}"`,
              );
              results.push({ path, success: true });
            } catch (err) {
              results.push({
                path,
                success: false,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }),
        );

        const ok = results.filter((r) => r.success).length;
        const fail = results.filter((r) => !r.success).length;
        return {
          summary: `${ok} written, ${fail} failed`,
          files: results,
        };
      },
    }),

    sandbox_list_files: tool({
      description:
        "List files and directories in the sandbox filesystem. " +
        "Path is relative to the repo root.",
      inputSchema: schema<{ path?: string }>({
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Directory path relative to repo root. Default: '.' (root).",
          },
        },
        additionalProperties: false,
      }),
      execute: async ({ path }: { path?: string }) => {
        if (!ctx.repoCloned) {
          await cloneRepo(ctx);
        }
        try {
          const dir = path
            ? `workspace/repo/${path}`
            : "workspace/repo";
          const response = await ctx.sandbox.process.executeCommand(
            `find "${dir}" -maxdepth 2 -not -path '*/node_modules/*' -not -path '*/.git/*' | head -100`,
          );
          return { files: response.result || "" };
        } catch (err) {
          return {
            error: `Failed to list: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    }),
  };
}

/**
 * Clone the user's repo into the sandbox on first use.
 */
async function cloneRepo(ctx: SandboxContext): Promise<void> {
  const [owner, repo] = ctx.repoSlug.split("/");
  const cloneUrl = `https://x-access-token:${ctx.githubToken}@github.com/${owner}/${repo}.git`;

  try {
    await ctx.sandbox.process.executeCommand(
      "mkdir -p workspace",
      undefined,
      undefined,
      10,
    );
    const cloneResponse = await ctx.sandbox.process.executeCommand(
      `git clone --depth 50 "${cloneUrl}" workspace/repo`,
      undefined,
      undefined,
      60,
    );

    if (cloneResponse.exitCode !== 0) {
      const errorMsg = cloneResponse.result || "Unknown git clone error";
      const lowerMsg = errorMsg.toLowerCase();
      if (
        lowerMsg.includes("authentication failed") ||
        lowerMsg.includes("unauthorized") ||
        lowerMsg.includes("bad credentials") ||
        lowerMsg.includes("could not read username")
      ) {
        const tokenPrefix = ctx.githubToken ? ctx.githubToken.substring(0, 8) : "none";
        const tokenLength = ctx.githubToken ? ctx.githubToken.length : 0;
        throw new Error(
          `GitHub authentication failed (Token: ${tokenPrefix}... length: ${tokenLength}). Your access token may have expired or is invalid. Please go to 'Profile Settings' and reconnect your GitHub account to refresh the token.`
        );
      }
      throw new Error(errorMsg);
    }

    ctx.repoCloned = true;
    console.log(`[sandbox] Cloned ${ctx.repoSlug} into sandbox`);
  } catch (err) {
    console.error(`[sandbox] Clone failed:`, err);
    throw new Error(
      `Failed to clone ${ctx.repoSlug}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

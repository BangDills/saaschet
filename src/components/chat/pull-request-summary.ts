import { type ToolCallPart, getToolName } from "./tool-call";

/**
 * Opening a pull request is the payoff of an agent turn, but the link used to
 * be buried in the reply's prose. This extracts the PR — plus the file counts
 * from the same turn's write tools — so the UI can surface it as a card.
 */
export type PullRequestSummary = {
  url: string;
  number: number;
  title: string;
  branch?: string;
  base?: string;
  /** Distinct paths created/updated in this turn. */
  filesChanged: number;
  filesDeleted: number;
};

const WRITE_TOOLS = new Set(["write_file", "edit_file"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function collectPaths(parts: ToolCallPart[]): {
  changed: Set<string>;
  deleted: Set<string>;
} {
  const changed = new Set<string>();
  const deleted = new Set<string>();

  for (const part of parts) {
    const toolName = getToolName(part);
    const input = asRecord(part.input);
    if (!input) continue;

    if (WRITE_TOOLS.has(toolName) && typeof input.path === "string") {
      changed.add(input.path);
    } else if (toolName === "delete_file" && typeof input.path === "string") {
      deleted.add(input.path);
    } else if (toolName === "write_files" && Array.isArray(input.files)) {
      for (const entry of input.files) {
        const file = asRecord(entry);
        if (file && typeof file.path === "string") changed.add(file.path);
      }
    }
  }

  // A path deleted after being written counts once, as a deletion.
  for (const path of deleted) changed.delete(path);
  return { changed, deleted };
}

/**
 * Find the pull request opened in this message, if any. Returns null when the
 * turn opened none, when the call failed, or when the tool reported committing
 * straight to the default branch (no PR exists to link to).
 */
export function extractPullRequest(parts: ToolCallPart[]): PullRequestSummary | null {
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (getToolName(part) !== "create_pull_request") continue;

    const output = asRecord(part.output);
    if (!output || output.success !== true) continue;
    if (typeof output.url !== "string" || typeof output.number !== "number") continue;

    const input = asRecord(part.input);
    const { changed, deleted } = collectPaths(parts);

    return {
      url: output.url,
      number: output.number,
      title:
        typeof input?.title === "string" && input.title.trim()
          ? input.title.trim()
          : `Pull request #${output.number}`,
      branch: typeof output.branch === "string" ? output.branch : undefined,
      base: typeof output.base === "string" ? output.base : undefined,
      filesChanged: changed.size,
      filesDeleted: deleted.size,
    };
  }
  return null;
}

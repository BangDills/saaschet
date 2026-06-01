import type { GitHubRepoBundle } from "./client";

/** Cap the README at this many chars when injecting into the system prompt. */
const README_CAP = 8000;

/**
 * Render a GitHub repo bundle as a Markdown block ready to be appended to
 * the assistant's system prompt. The model is told to cite this section
 * as the canonical context for the connected repository.
 */
export function formatRepoForContext(bundle: GitHubRepoBundle): string {
  const { info, readme, manifest, files } = bundle;

  const lines: string[] = [];
  lines.push(`# Connected GitHub repository: ${info.fullName}`);
  if (info.description) lines.push(`\n> ${info.description}`);

  const meta: string[] = [];
  meta.push(`★ ${info.stars}`);
  if (info.primaryLanguage) meta.push(info.primaryLanguage);
  if (info.topics.length) meta.push(info.topics.slice(0, 6).join(", "));
  if (info.isPrivate) meta.push("private");
  lines.push(`\n_${meta.join(" · ")}_`);

  if (manifest) {
    lines.push(`\n## ${manifest.name}\n\n\`\`\`\n${manifest.content}\n\`\`\``);
  }

  if (files.length) {
    lines.push(`\n## Top-level files`);
    lines.push(
      files
        .map((f) => `- ${f.type === "dir" ? "📁" : "📄"} ${f.path}`)
        .join("\n"),
    );
  }

  if (readme) {
    const truncated =
      readme.length > README_CAP
        ? readme.slice(0, README_CAP) + "\n\n…[README truncated]…"
        : readme;
    lines.push(`\n## README.md\n\n${truncated}`);
  }

  lines.push(
    `\n---\n` +
      `When the user asks about "this repo", "the project", or related ` +
      `questions, treat the section above as authoritative context. ` +
      `If you reference specific files, cite them as paths from the tree.`,
  );

  return lines.join("\n");
}

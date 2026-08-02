/**
 * Pure formatting for the structured profile — no imports on purpose.
 *
 * Split out from structured-memory.ts so the selfcheck can load it: that file
 * pulls in the Supabase admin client via the "@/" alias, which tsx does not
 * resolve. Same reason follow-ups.ts keeps its imports relative.
 */

/**
 * Profile keys that assert WHICH project or repo is being worked on.
 *
 * This is the one class of fact the profile must never carry. Unlike the
 * vector memories, which are retrieved top-5 against the current message, the
 * profile is injected key-for-key into EVERY prompt with no relevance gate at
 * all — so a stale project name is not occasional noise, it contradicts the
 * turn's ground truth on every single turn.
 *
 * And it contradicts something the route already knows for certain: repoSlug.
 * Observed in production, a user who switches repos daily carried
 * `github_repository: "BangDills/affiliate-content-lab"` while working on a
 * different repo, and the assistant kept prefacing answers with disclaimers
 * about the wrong project, trying to reconcile the two. Another profile
 * disagreed with itself: current_project_name "Affiliate Content Lab"
 * alongside current_project_repo "kiroroai/landingpage".
 *
 * The extractor prompt is fixed too, but that only shapes future writes.
 * Existing profiles already hold these keys, so the block has to happen here,
 * at the point of use.
 *
 * Deliberately narrow. Keys like css_framework or project_niche are
 * project-flavoured as well, but being mildly out of date is not the same as
 * contradicting a fact the system is certain about, and over-filtering would
 * throw away the profile's actual value.
 *
 * Known limit: this can only judge KEYS. Nothing here stops a model from
 * burying a repo name inside some unrelated value — that is what the corrected
 * extractor prompt is for. Two layers, because neither is sufficient alone.
 */
const VOLATILE_KEY_PATTERNS: RegExp[] = [
  /current_project/i,
  /current_module/i,
  /current_task/i,
  /current_error/i,
  /^project_name$/i,
  // Caught by a real profile: `project_description` read "Project
  // affiliate-content-lab: Next.js + Supabase…", carrying the repo name inside
  // the VALUE where a key filter cannot see it.
  /project_description/i,
  /project_repo/i,
  /repositor/i,
  /^repo$/i,
  /^repo_/i,
  /default_branch/i,
  /^branch$/i,
];

/** True when a key names the project/repo of the moment rather than the user. */
export function isVolatileProfileKey(key: string): boolean {
  return VOLATILE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Format the structured memory object into a readable markdown bulleted list for system prompt injection.
 */
export function formatStructuredMemory(memory: Record<string, unknown>): string {
  const keys = Object.keys(memory).filter((key) => !isVolatileProfileKey(key));
  if (keys.length === 0) return "";

  const lines = keys
    .map((key) => {
      const val = memory[key];
      const stringifiedVal = typeof val === "object" ? JSON.stringify(val) : String(val);
      return `- ${key}: ${stringifiedVal}`;
    })
    .join("\n");

  return `\n\n## User Profile & Structured Preferences\n${lines}`;
}

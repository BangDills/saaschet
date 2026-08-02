import { formatStructuredMemory, isVolatileProfileKey } from "./structured-memory-format";

/**
 * The structured profile is injected key-for-key into EVERY prompt with no
 * relevance gate, unlike the vector memories which are retrieved top-5 against
 * the current message. That makes one class of key actively harmful: anything
 * naming the project or repo of the moment, because the user switches
 * constantly and the route already knows the truth from repoSlug.
 *
 * The profiles below are real, taken from production.
 */

let checks = 0;
function check(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  checks++;
}

/* ── The reported bug ─────────────────────────────────────────────────────── */

// This user switches repos daily. While they worked on other repositories this
// key kept telling the assistant otherwise, and it kept prefacing answers with
// disclaimers about the wrong project.
{
  const real = {
    project_stack: ["Next.js", "Supabase", "Tailwind CSS", "TypeScript"],
    github_username: "BangDills",
    github_repository: "BangDills/affiliate-content-lab",
    preferred_language: "Indonesian",
    project_description: "Project affiliate-content-lab: Next.js + Supabase + Tailwind",
  };
  const out = formatStructuredMemory(real);
  check(!out.includes("affiliate-content-lab"), "the stale repo never reaches the prompt");
  check(!out.includes("github_repository"), "the repo key is dropped");
  check(out.includes("preferred_language: Indonesian"), "real preferences survive");
  check(out.includes("github_username: BangDills"), "identity survives — it is not volatile");
  check(out.includes("project_stack"), "stack is kept: stale-ish, but not a contradiction");
}

// A real profile that disagreed with itself. Both halves must go.
{
  const contradictory = {
    current_project_name: "Affiliate Content Lab",
    current_project_repo: "kiroroai/landingpage",
    default_branch: "feat/mvp-initial",
    css_framework: "Tailwind CSS",
    preferred_language: "Indonesian",
  };
  const out = formatStructuredMemory(contradictory);
  check(!out.includes("Affiliate Content Lab"), "current_project_name dropped");
  check(!out.includes("kiroroai/landingpage"), "current_project_repo dropped");
  check(!out.includes("feat/mvp-initial"), "default_branch dropped — branches move too");
  check(out.includes("css_framework: Tailwind CSS"), "durable preference kept");
}

/* ── Key classification ───────────────────────────────────────────────────── */

for (const key of [
  "current_project_name",
  "current_project",
  "current_project_repo",
  "current_project_type",
  "current_module",
  "current_task",
  "current_error",
  "project_name",
  "project_repo",
  "github_repository",
  "repository",
  "repo",
  "repo_url",
  "default_branch",
  "branch",
]) {
  check(isVolatileProfileKey(key), `"${key}" is volatile`);
}

for (const key of [
  "preferred_language",
  "preferred_languages",
  "package_manager",
  "css_framework",
  "styling_approach",
  "ui_library",
  "full_name",
  "github_username",
  "timezone",
  "deployment_target",
  "project_stack",
  "project_niche",
]) {
  check(!isVolatileProfileKey(key), `"${key}" is kept`);
}

// github_username must not be caught by the repo patterns — it identifies the
// person, not the project.
check(!isVolatileProfileKey("github_username"), "username is not a repository key");

/* ── Shape ────────────────────────────────────────────────────────────────── */

check(formatStructuredMemory({}) === "", "empty profile produces nothing");

// A profile made ENTIRELY of volatile keys must produce no section at all,
// rather than an empty heading dangling in the prompt.
check(
  formatStructuredMemory({ current_project_name: "x", github_repository: "y" }) === "",
  "all-volatile profile produces no heading",
);

// Values are still rendered the way the prompt expects.
{
  const out = formatStructuredMemory({
    preferred_languages: ["TypeScript", "Go"],
    full_name: "Dills",
  });
  check(out.startsWith("\n\n## User Profile & Structured Preferences\n"), "heading intact");
  check(out.includes('- preferred_languages: ["TypeScript","Go"]'), "arrays are JSON-stringified");
  check(out.includes("- full_name: Dills"), "strings pass through");
}

console.log(`PASS: ${checks} structured profile checks`);

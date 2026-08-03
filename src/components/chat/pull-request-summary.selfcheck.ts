/**
 * Selfcheck for extractPullRequest. Run with:
 *   npx tsx src/components/chat/pull-request-summary.selfcheck.ts
 */
import { extractPullRequest } from "./pull-request-summary";
import type { ToolCallPart } from "./tool-call";

let failures = 0;
let checks = 0;

function assert(name: string, condition: boolean) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${name}`);
  }
}

function part(
  toolName: string,
  input: unknown,
  output?: unknown,
  state: ToolCallPart["state"] = "output-available",
): ToolCallPart {
  return {
    type: `tool-${toolName}`,
    toolCallId: `${toolName}-${Math.abs(toolName.length * 7)}`,
    state,
    input,
    output,
  } as ToolCallPart;
}

const prOk = part(
  "create_pull_request",
  { title: "Tambah fitur booking", body: "..." },
  {
    success: true,
    stage: "create_pull_request",
    url: "https://github.com/u/r/pull/12",
    number: 12,
    branch: "celiuz/booking",
    base: "main",
  },
);

// ── No PR in the turn ──────────────────────────────────────────────────────
assert("empty parts → null", extractPullRequest([]) === null);
assert(
  "turn without create_pull_request → null",
  extractPullRequest([part("read_file", { path: "a.ts" }, { success: true })]) === null,
);
assert(
  "failed PR call → null",
  extractPullRequest([
    part("create_pull_request", { title: "x" }, { success: false, error: "no changes" }),
  ]) === null,
);
assert(
  "committed straight to default branch (no url/number) → null",
  extractPullRequest([
    part(
      "create_pull_request",
      { title: "x" },
      { success: true, note: "committed to main", base: "main", branch: "main" },
    ),
  ]) === null,
);
// Half a result is not a result. The existing case above omits url AND number,
// so the guard's `||` could be relaxed to `&&` and still pass — and then a
// payload carrying only one of the two rendered a PR card linking to
// "undefined" or numbered NaN.
assert(
  "url without number → null",
  extractPullRequest([
    part(
      "create_pull_request",
      { title: "x" },
      { success: true, url: "https://github.com/u/r/pull/12" },
    ),
  ]) === null,
);
assert(
  "number without url → null",
  extractPullRequest([
    part("create_pull_request", { title: "x" }, { success: true, number: 12 }),
  ]) === null,
);
assert(
  "still-running PR call → null",
  extractPullRequest([
    part("create_pull_request", { title: "x" }, undefined, "input-available"),
  ]) === null,
);

// ── Happy path + metadata ──────────────────────────────────────────────────
const basic = extractPullRequest([prOk]);
assert("PR found", basic !== null);
assert("number", basic?.number === 12);
assert("url", basic?.url === "https://github.com/u/r/pull/12");
assert("title from input", basic?.title === "Tambah fitur booking");
assert("branch", basic?.branch === "celiuz/booking");
assert("base", basic?.base === "main");
assert("no writes → 0 changed", basic?.filesChanged === 0);

const missingTitle = extractPullRequest([
  part("create_pull_request", {}, { success: true, url: "u", number: 7 }),
]);
assert("fallback title uses number", missingTitle?.title === "Pull request #7");

// ── File counting ──────────────────────────────────────────────────────────
const withWrites = extractPullRequest([
  part("write_file", { path: "src/a.ts" }, { success: true }),
  part("write_files", { files: [{ path: "src/b.ts" }, { path: "src/c.ts" }] }, { success: true }),
  part("edit_file", { path: "src/a.ts" }, { success: true }), // same file twice
  part("delete_file", { path: "src/old.ts" }, { success: true }),
  prOk,
]);
assert("distinct changed paths counted once", withWrites?.filesChanged === 3);
assert("deletions counted separately", withWrites?.filesDeleted === 1);

const writtenThenDeleted = extractPullRequest([
  part("write_file", { path: "tmp.ts" }, { success: true }),
  part("delete_file", { path: "tmp.ts" }, { success: true }),
  prOk,
]);
assert(
  "path written then deleted counts only as a deletion",
  writtenThenDeleted?.filesChanged === 0 && writtenThenDeleted?.filesDeleted === 1,
);

// ── Multiple PRs: the last successful one wins ─────────────────────────────
const twoPrs = extractPullRequest([
  part("create_pull_request", { title: "First" }, { success: true, url: "u1", number: 1 }),
  part("create_pull_request", { title: "Second" }, { success: true, url: "u2", number: 2 }),
]);
assert("latest PR wins", twoPrs?.number === 2 && twoPrs?.title === "Second");

const failedAfterSuccess = extractPullRequest([
  part("create_pull_request", { title: "Good" }, { success: true, url: "u1", number: 1 }),
  part("create_pull_request", { title: "Bad" }, { success: false, error: "dup" }),
]);
assert("failed retry does not hide the successful PR", failedAfterSuccess?.number === 1);

// ── Malformed input is survivable ──────────────────────────────────────────
assert(
  "null input/output does not throw",
  extractPullRequest([part("create_pull_request", null, null)]) === null,
);
const oddFiles = extractPullRequest([
  part("write_files", { files: [null, { nope: 1 }, { path: "ok.ts" }] }, { success: true }),
  prOk,
]);
assert("write_files skips malformed entries", oddFiles?.filesChanged === 1);

if (failures > 0) {
  console.error(`pull-request-summary selfcheck: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`pull-request-summary selfcheck: ${checks} checks passed`);

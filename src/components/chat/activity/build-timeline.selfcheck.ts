import { buildTimeline } from "./build-timeline";
import { interpretCommand, classifyOutcome } from "./semantic-events";
import { computeSummaryStats } from "./summary-stats";
import type { ToolCallPart } from "../tool-call";

let checks = 0;
function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  checks++;
}

function mkPart(
  toolName: string,
  state: ToolCallPart["state"] = "output-available",
  opts: Partial<ToolCallPart> = {},
): ToolCallPart {
  return {
    type: `tool-${toolName}`,
    toolCallId: `tc-${Math.random().toString(36).slice(2)}`,
    toolName,
    state,
    ...opts,
  };
}

// 1. Empty input
const empty = buildTimeline([]);
assert(empty.groups.length === 0, "empty: no groups");
assert(empty.totalActions === 0, "empty: 0 actions");

// 2. Single read_file → analyzing, completed
const singleRead = buildTimeline([
  mkPart("read_file", "output-available", {
    input: { path: "src/app.ts" },
    output: { success: true, content: "..." },
  }),
]);
assert(singleRead.groups.length === 1, "single read: 1 group");
assert(singleRead.groups[0].id === "analyzing", "single read: analyzing");
assert(singleRead.groups[0].count === 1, "single read: count 1");
assert(singleRead.groups[0].status === "completed", "single read: completed");
assert(singleRead.groups[0].items[0].title === "Reviewing app.ts", "single read: action title");

// 2b. Batch read_files → one analyzing entry, not one per file. The whole
// point of the tool is that N files cost one round trip, so the timeline must
// not make it look like N separate steps.
const batchRead = buildTimeline([
  mkPart("read_files", "output-available", {
    input: { paths: ["README.md", "src/app.ts", "src/style.css"] },
    output: { success: true, returned: 3, files: [] },
  }),
]);
assert(batchRead.groups.length === 1, "batch read: 1 group");
assert(batchRead.groups[0].id === "analyzing", "batch read: analyzing");
assert(batchRead.groups[0].count === 1, "batch read: one step, not three");
assert(batchRead.groups[0].items[0].title === "Reviewing 3 files", "batch read: action title");

// 2c. Summary counts FILES for file categories, not tool calls. A batch read
// of three files plus one single read is 2 calls but 4 files, and the summary
// line must say 4 — it previously said 2, contradicting the detail view.
{
  const timeline = buildTimeline([
    mkPart("read_files", "output-available", {
      input: { paths: ["a.ts", "b.ts", "c.ts"] },
      output: { success: true },
    }),
    mkPart("read_file", "output-available", {
      input: { path: "d.ts" },
      output: { success: true },
    }),
  ]);
  const stats = computeSummaryStats(timeline.groups, 1000);
  assert(stats.lines.includes("4 files analyzed"), "summary counts files, not calls");

  // write_files had the same undercount before read_files existed.
  const writes = buildTimeline([
    mkPart("write_files", "output-available", {
      input: { files: [{ path: "a.ts" }, { path: "b.ts" }] },
      output: { success: true },
    }),
  ]);
  const writeStats = computeSummaryStats(writes.groups, 1000);
  assert(writeStats.lines.includes("2 files created"), "batch write counts files too");

  // Non-file categories keep counting calls.
  const plans = buildTimeline([
    mkPart("report_state", "output-available", { input: {}, output: { success: true } }),
  ]);
  assert(
    computeSummaryStats(plans.groups, 1000).lines.includes("1 execution plan"),
    "non-file categories still count calls",
  );

  // Singular vs plural still agrees with the number shown.
  const one = buildTimeline([
    mkPart("read_files", "output-available", {
      input: { paths: ["only.ts"] },
      output: { success: true },
    }),
  ]);
  assert(
    computeSummaryStats(one.groups, 1000).lines.includes("1 file analyzed"),
    "one file reads as singular",
  );
}

// 3. Mixed: passing test + failing lint → validating with needs-attention
const mixed = buildTimeline([
  mkPart("read_file", "output-available", {
    input: { path: "a.ts" },
    output: { success: true },
  }),
  mkPart("run_command", "output-available", {
    input: { command: "npm test" },
    output: { success: true, exitCode: 0, stdout: "", stderr: "" },
  }),
  mkPart("run_command", "output-error", {
    input: { command: "npm run lint" },
    output: { success: false, exitCode: 2, error: "lint failed" },
    errorText: "lint failed",
  }),
]);
const validatingGroup = mixed.groups.find((g) => g.id === "validating");
assert(validatingGroup, "mixed: validating group exists");
assert(validatingGroup!.status === "needs-attention", "mixed: needs-attention status");
assert(validatingGroup!.needsAttentionCount === 1, "mixed: 1 needs attention");
assert(mixed.needsAttention === 1, "mixed: timeline needsAttention 1");

// 3b. isItemDone, pinned at both of its clauses. Every fixture above carries an
// output, so the flag looked covered while neither half was actually tested:
// flipping its `===` and relaxing its `&&` to `||` both passed the suite.
const doneByState = buildTimeline([
  mkPart("read_file", "output-available", { input: { path: "a.ts" } }),
]);
assert(
  doneByState.groups[0].items[0].isDone === true,
  "output-available is done on the strength of the state, even with no output payload",
);
const errorWithoutOutput = buildTimeline([
  mkPart("read_file", "output-error", {
    input: { path: "a.ts" },
    errorText: "boom",
  }),
]);
assert(
  errorWithoutOutput.groups[0].items[0].isDone === false,
  "a non-running part that produced no output is NOT done",
);

// 4. grep exit code 1 (no matches) is NOT a failure — user outcome, not exit code
const grepNoMatch = buildTimeline([
  mkPart("run_command", "output-available", {
    input: { command: "grep -rn 'TODO' src" },
    output: { success: false, exitCode: 1, stdout: "", stderr: "" },
  }),
]);
const searchGroup = grepNoMatch.groups.find((g) => g.id === "searching");
assert(searchGroup, "grep: searching group (not executing)");
assert(searchGroup!.items[0].status === "completed", "grep exit 1: completed, not failed");
assert(searchGroup!.items[0].title === "Searching project files", "grep: human title");
assert(grepNoMatch.needsAttention === 0, "grep: nothing needs attention");

// 5. Sandbox unavailable → unavailable, not needs-attention
assert(
  classifyOutcome({
    toolName: "run_command",
    input: { command: "npm test" },
    output: { success: false, error: "Sandbox failed to initialize: quota" },
    state: "output-available",
  }) === "unavailable",
  "sandbox init error: unavailable",
);

// 6. Auth error → needs-attention
assert(
  classifyOutcome({
    toolName: "write_file",
    input: { path: "a.ts" },
    output: { success: false, error: "401 Bad credentials" },
    state: "output-available",
  }) === "needs-attention",
  "auth error: needs-attention",
);

// 7. write_file then edit_file same path → creating then updating
const fileOps = buildTimeline([
  mkPart("write_file", "output-available", {
    input: { path: "lib/new.ts", content: "..." },
    output: { success: true, commit_sha: "abc", lines_added: 5, lines_deleted: 0 },
  }),
  mkPart("edit_file", "output-available", {
    input: { path: "lib/new.ts", find: "a", replace: "b" },
    output: { success: true, commit_sha: "def", lines_added: 1, lines_deleted: 1 },
  }),
]);
assert(fileOps.groups.find((g) => g.id === "creating"), "fileops: creating exists");
assert(fileOps.groups.find((g) => g.id === "updating"), "fileops: updating exists");

// 8. Command interpretation never leaks the raw command into title/description
const raw = "some-unknown-binary --flag path/to/file";
const meaning = interpretCommand(raw);
assert(!meaning.title.includes(raw), "unknown cmd: title has no raw command");
assert(!meaning.description.includes(raw), "unknown cmd: description has no raw command");

// 9. Compound command resolves to the consequential segment
const compound = interpretCommand("cd workspace/repo && npm test");
assert(compound.category === "validating", "compound: cd && npm test → validating");
assert(compound.title === "Running tests", "compound: human title");

// 10. Semantic commands: git status / cat package.json / sed / ls
assert(interpretCommand("git status").title === "Checking Git status", "git status title");
assert(
  interpretCommand("cat package.json").title === "Reviewing dependencies",
  "cat package.json → Reviewing dependencies",
);
assert(
  interpretCommand("sed -i 's/a/b/' src/x.ts").category === "updating",
  "sed → updating",
);
assert(
  interpretCommand("ls -la src").title === "Inspecting repository structure",
  "ls → Inspecting repository structure",
);

// 11. Workflow presets: audit taskType relabels groups
const review = buildTimeline(
  [
    mkPart("read_file", "output-available", {
      input: { path: "a.ts" },
      output: { success: true },
    }),
    mkPart("report_state", "output-available", {
      input: {},
      output: { success: true },
    }),
  ],
  { taskType: "audit" },
);
assert(review.workflow === "review", "audit → review workflow");
assert(
  review.groups.find((g) => g.id === "analyzing")!.label === "Analyzing source files",
  "review: analyzing relabeled",
);
assert(
  review.groups.find((g) => g.id === "planning")!.label === "Generating recommendations",
  "review: planning relabeled",
);

// 12. Read-only heuristic (no taskType) → review workflow; writes → not review
const readOnly = buildTimeline([
  mkPart("read_file", "output-available", { input: { path: "a.ts" }, output: { success: true } }),
]);
assert(readOnly.workflow === "review", "read-only heuristic → review");
const withWrites = buildTimeline([
  mkPart("read_file", "output-available", { input: { path: "a.ts" }, output: { success: true } }),
  mkPart("write_file", "output-available", { input: { path: "b.ts" }, output: { success: true } }),
]);
assert(withWrites.workflow === "general", "writes without taskType → general");

// 13. Bugfix workflow labels
const bugfix = buildTimeline(
  [
    mkPart("search_code", "output-available", { input: { query: "crash" }, output: { count: 0, results: [] } }),
    mkPart("read_file", "output-available", { input: { path: "a.ts" }, output: { success: true } }),
  ],
  { taskType: "debugging" },
);
assert(bugfix.workflow === "bugfix", "debugging → bugfix workflow");
assert(
  bugfix.groups.find((g) => g.id === "searching")!.label === "Searching related code",
  "bugfix: searching relabeled",
);
assert(
  bugfix.groups.find((g) => g.id === "analyzing")!.label === "Understanding the issue",
  "bugfix: analyzing relabeled",
);

// 14. Duration extraction from sandbox tool metadata
const timed = buildTimeline([
  mkPart("run_command", "output-available", {
    input: { command: "npm test" },
    output: { success: true, exitCode: 0, metadata: { durationMs: 4200, timestamp: 1 } },
  }),
]);
assert(timed.groups[0].items[0].durationMs === 4200, "duration extracted from output metadata");

// 15. Running states propagate
const running = buildTimeline([
  mkPart("run_command", "input-available", { input: { command: "npm test" } }),
]);
assert(running.anyRunning, "running: anyRunning true");
assert(running.groups[0].status === "running", "running: group status running");
assert(running.groups[0].items[0].status === "running", "running: item status running");

// 16. Unknown tool → planning fallback, no crash
const unknown = buildTimeline([
  mkPart("mystery_tool", "output-available", { input: {}, output: { success: true } }),
]);
assert(unknown.groups.length > 0, "unknown: at least one group");
assert(unknown.groups[0].id === "planning", "unknown: planning category");

// 17. create_pull_request → applying
const pr = buildTimeline([
  mkPart("create_pull_request", "output-available", {
    input: { title: "Fix bug" },
    output: { success: true, url: "https://github.com/..." },
  }),
]);
assert(pr.groups.find((g) => g.id === "applying"), "pr: applying group");

console.log(`PASS: ${checks} build-timeline selfcheck assertions (semantic events)`);

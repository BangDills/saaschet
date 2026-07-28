import { buildTimeline } from "./build-timeline";
import { interpretCommand, classifyOutcome } from "./semantic-events";
import type { ToolCallPart } from "../tool-call";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
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

console.log("PASS: 17/17 build-timeline selfcheck cases (semantic events)");

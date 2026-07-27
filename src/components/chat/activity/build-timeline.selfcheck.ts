import { buildTimeline } from "./build-timeline";
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

// 2. Single read_file → analyzing
const singleRead = buildTimeline([
  mkPart("read_file", "output-available", {
    input: { path: "src/app.ts" },
    output: { success: true, content: "..." },
  }),
]);
assert(singleRead.groups.length === 1, "single read: 1 group");
assert(singleRead.groups[0].id === "analyzing", "single read: analyzing");
assert(singleRead.groups[0].count === 1, "single read: count 1");
assert(singleRead.groups[0].status === "success", "single read: success");

// 3. Mixed read + run_command (one failed) → analyzing + executing
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
    output: { success: false, exitCode: 1, error: "lint failed" },
    errorText: "lint failed",
  }),
]);
assert(mixed.groups.length >= 2, "mixed: ≥2 groups");
const executingGroup = mixed.groups.find((g) => g.id === "executing");
const validatingGroup = mixed.groups.find((g) => g.id === "validating");
// npm test → validating, npm run lint → validating
assert(validatingGroup, "mixed: validating group exists");
assert(validatingGroup!.status === "partial" || executingGroup?.status === "partial", "mixed: partial");

// 4. write_file then edit_file same path → creating then updating
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
const creatingGroup = fileOps.groups.find((g) => g.id === "creating");
const updatingGroup = fileOps.groups.find((g) => g.id === "updating");
assert(creatingGroup, "fileops: creating exists");
assert(updatingGroup, "fileops: updating exists");
assert(creatingGroup!.items[0].fileOp === "created", "fileops: write classified created");
assert(updatingGroup!.items[0].fileOp === "updated", "fileops: edit classified updated");

// 5. 20 file reads
const many = buildTimeline(
  Array.from({ length: 20 }, (_, i) =>
    mkPart("read_file", "output-available", {
      input: { path: `file${i}.ts` },
      output: { success: true, content: "x" },
    }),
  ),
);
const analyzingGroup = many.groups.find((g) => g.id === "analyzing");
assert(analyzingGroup, "many: analyzing group exists");
assert(analyzingGroup!.count === 20, "many: count 20");

// 6. Unknown toolName → planning
const unknown = buildTimeline([
  mkPart("mystery_tool", "output-available", {
    input: {},
    output: { success: true },
  }),
]);
assert(unknown.groups.length > 0, "unknown: at least one group");
assert(unknown.groups[0].id === "planning", "unknown: planning category");

// 7. delete_file → deleting
const del = buildTimeline([
  mkPart("delete_file", "output-available", {
    input: { path: "old.ts" },
    output: { success: true, deleted: true },
  }),
]);
const deletingGroup = del.groups.find((g) => g.id === "deleting");
assert(deletingGroup, "delete: deleting group exists");

// 8. git status → analyzing (informational command)
const gitStatus = buildTimeline([
  mkPart("run_command", "output-available", {
    input: { command: "git status" },
    output: { success: true, stdout: "On branch main" },
  }),
]);
const gitGroup = gitStatus.groups.find((g) => g.id === "analyzing");
assert(gitGroup, "git status: analyzing group");

// 9. npm test → validating
const npmTest = buildTimeline([
  mkPart("run_command", "output-available", {
    input: { command: "npm test" },
    output: { success: true, stdout: "PASS", exitCode: 0 },
  }),
]);
const validatingGrp = npmTest.groups.find((g) => g.id === "validating");
assert(validatingGrp, "npm test: validating group");

// 10. ActivityItem has title + description
const titles = buildTimeline([
  mkPart("read_file", "output-available", {
    input: { path: "x.ts" },
    output: { success: true },
  }),
]);
assert(titles.groups[0].items[0].title === "Analyzing files", "item has title");
assert(titles.groups[0].items[0].description.length > 0, "item has description");

// 11. create_pull_request → applying
const pr = buildTimeline([
  mkPart("create_pull_request", "output-available", {
    input: { title: "Fix bug" },
    output: { success: true, url: "https://github.com/..." },
  }),
]);
const applyingGroup = pr.groups.find((g) => g.id === "applying");
assert(applyingGroup, "pr: applying group");

console.log("PASS: 11/11 build-timeline selfcheck cases (intent-based)");

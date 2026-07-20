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

// 2. Single read_file success
const singleRead = buildTimeline([
  mkPart("read_file", "output-available", {
    input: { path: "src/app.ts" },
    output: { success: true, content: "..." },
  }),
]);
assert(singleRead.groups.length === 1, "single read: 1 group");
assert(singleRead.groups[0].id === "read", "single read: read category");
assert(singleRead.groups[0].count === 1, "single read: count 1");
assert(singleRead.groups[0].status === "success", "single read: success");

// 3. Mixed read + run_command (one failed)
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
assert(mixed.groups.length === 2, "mixed: 2 groups");
const cmdGroup = mixed.groups.find((g) => g.id === "commands");
assert(cmdGroup, "mixed: commands group exists");
assert(cmdGroup!.status === "partial", "mixed: commands partial");
assert(cmdGroup!.failedCount === 1, "mixed: 1 failed command");

// 4. write_file then edit_file same path → created then updated
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
const createdGroup = fileOps.groups.find((g) => g.id === "created");
const updatedGroup = fileOps.groups.find((g) => g.id === "updated");
assert(createdGroup, "fileops: created group exists");
assert(updatedGroup, "fileops: updated group exists");
assert(createdGroup!.items[0].fileOp === "created", "fileops: write classified created");
assert(updatedGroup!.items[0].fileOp === "updated", "fileops: edit classified updated");

// 5. 20 read_file → group count 20
const many = buildTimeline(
  Array.from({ length: 20 }, (_, i) =>
    mkPart("read_file", "output-available", {
      input: { path: `file${i}.ts` },
      output: { success: true, content: "x" },
    }),
  ),
);
const readGroup = many.groups.find((g) => g.id === "read");
assert(readGroup, "many: read group exists");
assert(readGroup!.count === 20, "many: count 20");

// 6. Legacy output (no success field)
const legacy = buildTimeline([
  mkPart("read_file", "output-available", {
    input: { path: "old.ts" },
    output: { content: "legacy" }, // no success field
  }),
]);
assert(legacy.groups.length === 1, "legacy: 1 group");
assert(legacy.groups[0].status === "success", "legacy: success from state");

// 7. Unknown toolName → other
const unknown = buildTimeline([
  mkPart("mystery_tool", "output-available", {
    input: {},
    output: { success: true },
  }),
]);
assert(unknown.groups[0].id === "other", "unknown: other category");

// 8. delete_file → deleted
const del = buildTimeline([
  mkPart("delete_file", "output-available", {
    input: { path: "old.ts" },
    output: { success: true, deleted: true },
  }),
]);
assert(del.groups[0].id === "deleted", "delete: deleted category");

console.log("PASS: 8/8 build-timeline selfcheck cases");

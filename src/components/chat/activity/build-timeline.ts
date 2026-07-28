import {
  type ToolCallPart,
  getToolName,
  extractFilePath,
  summarizeInput,
  summarizeOutput,
  getLineStats,
} from "../tool-call";
import { classifyFileOp, CATEGORY_ORDER } from "./classify";
import {
  deriveSemanticEvent,
  classifyOutcome,
  extractDurationMs,
} from "./semantic-events";
import { resolveWorkflow, workflowGroupLabel } from "./workflow";
import type {
  ActivityCategory,
  ActivityItem,
  ActivityGroupData,
  ActivityTimelineData,
} from "./activity-types";

const RUNNING_STATES = new Set(["input-streaming", "input-available", "executing", "approval-requested"]);

function isItemDone(part: ToolCallPart): boolean {
  return part.state === "output-available" || (!RUNNING_STATES.has(part.state) && part.output !== undefined);
}

/**
 * Build the semantic timeline from raw tool-call parts. Each part becomes a
 * structured activity (category/title/description/status/duration) via the
 * semantic-event layer; the UI renders those, never terminal output.
 */
export function buildTimeline(
  parts: ToolCallPart[],
  opts?: { taskType?: string | null },
): ActivityTimelineData {
  const seenPaths = new Set<string>();
  const grouped = new Map<ActivityCategory, ActivityItem[]>();

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    let item: ActivityItem;

    try {
      const toolName = getToolName(part);
      const event = deriveSemanticEvent(toolName, part.input);
      const filePath = extractFilePath(toolName, part.input);
      const fileOp = classifyFileOp(toolName, part.output, seenPaths, filePath);
      const isRunning = RUNNING_STATES.has(part.state);
      const status = isRunning
        ? "running"
        : classifyOutcome({
            toolName,
            input: part.input,
            output: part.output,
            state: part.state,
            errorText: part.errorText,
          });
      const isDone = !isRunning && isItemDone(part);

      item = {
        key: part.toolCallId || `tc-${i}`,
        toolName,
        category:
          fileOp === "created"
            ? "creating"
            : fileOp === "updated"
              ? "updating"
              : fileOp === "deleted"
                ? "deleting"
                : event.category,
        fileOp,
        filePath: filePath ?? undefined,
        title: event.title,
        description: event.description,
        technicalDetails: event.technicalDetails,
        status,
        durationMs: extractDurationMs(part.output),
        state: part.state,
        isRunning,
        isDone,
        input: part.input,
        output: part.output,
        errorText: part.errorText,
        inputPreview: summarizeInput(toolName, part.input),
        outputSummary: isDone ? summarizeOutput(toolName, part.output) : "",
        lineStats: isDone ? getLineStats(part.output) ?? undefined : undefined,
      };
    } catch {
      item = {
        key: part.toolCallId || `tc-${i}`,
        toolName: "unknown",
        category: "planning",
        title: "Working on the task",
        description: "Processing",
        status: "completed",
        state: part.state,
        isRunning: false,
        isDone: false,
        input: part.input,
        output: part.output,
        errorText: part.errorText,
        inputPreview: "",
        outputSummary: "",
      };
    }

    const list = grouped.get(item.category) ?? [];
    list.push(item);
    grouped.set(item.category, list);
  }

  const workflow = resolveWorkflow(opts?.taskType, new Set(grouped.keys()));

  const groups: ActivityGroupData[] = [];
  let totalActions = 0;
  let anyRunning = false;
  let needsAttention = 0;

  for (const cat of CATEGORY_ORDER) {
    const items = grouped.get(cat);
    if (!items || items.length === 0) continue;

    const count = items.length;
    totalActions += count;
    const needsAttentionCount = items.filter((it) => it.status === "needs-attention").length;
    const runningCount = items.filter((it) => it.status === "running").length;
    needsAttention += needsAttentionCount;
    if (runningCount > 0) anyRunning = true;

    const status: ActivityGroupData["status"] =
      runningCount > 0 ? "running" : needsAttentionCount > 0 ? "needs-attention" : "completed";

    groups.push({
      id: cat,
      label: workflowGroupLabel(workflow, cat),
      iconKey: cat,
      items,
      count,
      status,
      needsAttentionCount,
      runningCount,
    });
  }

  return { groups, workflow, totalActions, anyRunning, needsAttention };
}

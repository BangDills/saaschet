import {
  type ToolCallPart,
  getToolName,
  extractFilePath,
  summarizeInput,
  summarizeOutput,
  getLineStats,
} from "../tool-call";
import { classifyToolName, classifyFileOp, CATEGORY_LABELS, CATEGORY_ORDER } from "./classify";
import { deriveCopy } from "./derive-reason";
import type {
  ActivityCategory,
  ActivityItem,
  ActivityGroupData,
  ActivityTimelineData,
  FileOp,
} from "./activity-types";

const RUNNING_STATES = new Set(["input-streaming", "input-available", "executing", "approval-requested"]);

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object";
}

function isItemError(part: ToolCallPart): boolean {
  if (part.state === "output-error") return true;
  if (part.errorText) return true;
  const o = part.output;
  if (isObj(o) && o.success === false) return true;
  if (isObj(o) && "error" in o && typeof o.error === "string" && o.error) return true;
  return false;
}

function isItemDone(part: ToolCallPart): boolean {
  return part.state === "output-available" || (!RUNNING_STATES.has(part.state) && !isItemError(part) && part.output !== undefined);
}

function isItemRunning(part: ToolCallPart): boolean {
  return RUNNING_STATES.has(part.state);
}

export function buildTimeline(parts: ToolCallPart[]): ActivityTimelineData {
  const seenPaths = new Set<string>();
  const grouped = new Map<ActivityCategory, ActivityItem[]>();

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    let item: ActivityItem;

    try {
      const toolName = getToolName(part);
      const category = classifyToolName(toolName, part.input);
      const filePath = extractFilePath(toolName, part.input);
      const fileOp = classifyFileOp(toolName, part.output, seenPaths, filePath);
      const copy = deriveCopy(toolName, part.input, category);
      const isRunning = isItemRunning(part);
      const isError = isItemError(part);
      const isDone = isItemDone(part);

      item = {
        key: part.toolCallId || `tc-${i}`,
        toolName,
        category: fileOp === "created" ? "creating" : fileOp === "updated" ? "updating" : fileOp === "deleted" ? "deleting" : category,
        fileOp,
        filePath: filePath ?? undefined,
        title: copy.title,
        description: copy.description,
        technicalDetails: copy.technicalDetails,
        state: part.state,
        isRunning,
        isError,
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
        title: "Executing tasks",
        description: "Working",
        state: part.state,
        isRunning: false,
        isError: true,
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

  const groups: ActivityGroupData[] = [];
  let totalActions = 0;
  let anyRunning = false;

  for (const cat of CATEGORY_ORDER) {
    const items = grouped.get(cat);
    if (!items || items.length === 0) continue;

    const count = items.length;
    totalActions += count;
    const failedCount = items.filter((it) => it.isError).length;
    const runningCount = items.filter((it) => it.isRunning).length;
    if (runningCount > 0) anyRunning = true;

    let status: ActivityGroupData["status"];
    if (runningCount > 0 && failedCount === 0) status = "running";
    else if (failedCount === 0) status = "success";
    else if (failedCount === count) status = "failed";
    else status = "partial";

    groups.push({
      id: cat,
      label: CATEGORY_LABELS[cat],
      iconKey: cat,
      items,
      count,
      status,
      failedCount,
      runningCount,
    });
  }

  return { groups, totalActions, anyRunning };
}

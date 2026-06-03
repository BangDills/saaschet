import { NextResponse } from "next/server";
import {
  defaultModels,
  vendorOrder,
  isNonChatModel,
  isAgentCapable,
} from "@/lib/chat/models";
import type { ModelInfo } from "@/lib/chat/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Cache the model list for an hour at the edge.
export const revalidate = 3600;

const DO_BASE_URL =
  process.env.DO_INFERENCE_BASE_URL ?? "https://inference.do-ai.run/v1";

type DOModelEntry = {
  id: string;
  object?: string;
  owned_by?: string;
};

type DOModelListResponse = {
  data?: DOModelEntry[];
};

/**
 * Best-effort vendor label from the model id.
 */
function vendorFromId(id: string): string {
  const lower = id.toLowerCase();
  if (lower.includes("claude") || lower.startsWith("anthropic"))
    return "Anthropic";
  if (lower.includes("gpt") || lower.startsWith("openai") || lower.startsWith("o1") || lower.startsWith("o3"))
    return "OpenAI";
  if (lower.includes("deepseek")) return "DeepSeek";
  if (lower.includes("gemma") || lower.includes("gemini")) return "Google";
  if (lower.includes("llama") || lower.includes("maverick")) return "Meta";
  if (lower.includes("qwen")) return "Qwen";
  if (lower.includes("kimi")) return "Kimi";
  if (lower.includes("nemotron") || lower.includes("nvidia")) return "Nvidia";
  if (lower.includes("minimax") || lower.includes("abab")) return "MiniMax";
  if (lower.includes("mistral") || lower.includes("codestral") || lower.includes("mixtral"))
    return "Mistral";
  if (lower.includes("glm")) return "GLM";
  if (lower.includes("arcee") || lower.includes("trinity")) return "Arcee";
  if (lower.includes("phi")) return "Microsoft";
  if (lower.includes("jamba")) return "AI21";
  if (lower.includes("command") || lower.includes("cohere")) return "Cohere";
  if (lower.includes("falcon")) return "TII";
  return "Other";
}

function prettyLabel(id: string): string {
  return id
    .replace(/^anthropic-/, "")
    .replace(/^openai-/, "")
    .replace(/^alibaba-/, "")
    .replace(/-instruct$/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Sort: known vendors first (by vendorOrder), then alphabetical. */
function sortByVendor(a: ModelInfo, b: ModelInfo): number {
  const ai = vendorOrder.indexOf(a.vendor as (typeof vendorOrder)[number]);
  const bi = vendorOrder.indexOf(b.vendor as (typeof vendorOrder)[number]);
  const aIdx = ai === -1 ? vendorOrder.length : ai;
  const bIdx = bi === -1 ? vendorOrder.length : bi;
  if (aIdx !== bIdx) return aIdx - bIdx;
  return a.label.localeCompare(b.label);
}

export async function GET() {
  const apiKey = process.env.DO_INFERENCE_API_KEY;

  // No key configured → return curated list.
  if (!apiKey) {
    return NextResponse.json({
      models: [...defaultModels].sort(sortByVendor),
      source: "fallback",
    });
  }

  try {
    const res = await fetch(`${DO_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return NextResponse.json({
        models: [...defaultModels].sort(sortByVendor),
        source: "fallback",
        warning: `Upstream returned ${res.status}`,
      });
    }

    const json = (await res.json()) as DOModelListResponse;
    const items = json.data ?? [];

    // Filter out non-chat models, map to our shape, tag agent-capable.
    const live: ModelInfo[] = items
      .filter((m) => !isNonChatModel(m.id))
      .map((m) => {
        const vendor = vendorFromId(m.id);
        return {
          id: m.id,
          label: prettyLabel(m.id),
          vendor,
          agentCapable: isAgentCapable(m.id),
        } satisfies ModelInfo;
      });

    if (live.length === 0) {
      return NextResponse.json({
        models: [...defaultModels].sort(sortByVendor),
        source: "fallback",
        warning: "Live list was empty",
      });
    }

    return NextResponse.json({
      models: live.sort(sortByVendor),
      source: "live",
    });
  } catch {
    return NextResponse.json({
      models: [...defaultModels].sort(sortByVendor),
      source: "fallback",
      warning: "Failed to reach inference.do-ai.run",
    });
  }
}

import { NextResponse } from "next/server";
import {
  defaultModels,
  vendorOrder,
  isAgentCapable,
  isMultimodal,
  allFreeModels,
  codexModels,
} from "@/lib/chat/models";
import type { ModelInfo } from "@/lib/chat/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Cache the model list for an hour at the edge.
export const revalidate = 3600;

const ALIBABA_BASE_URL =
  process.env.ALIBABA_BASE_URL ?? "https://ws-7i0g4fvbloleocpm.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1";

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
  const apiKey = process.env.ALIBABA_API_KEY || process.env.DO_INFERENCE_API_KEY;

  // Only these Alibaba model IDs are shown in the selector.
  const ALLOWED_ALIBABA_MODELS = new Set([
    "glm-5.2",
    "qwen-3.7-max",
    "qwen-3.7-plus",
    "kimi-2.7-code",
  ]);

  // No key configured → return curated list.
  if (!apiKey) {
    return NextResponse.json({
      models: [...defaultModels].sort(sortByVendor),
      source: "fallback",
    });
  }

  try {
    const res = await fetch(`${ALIBABA_BASE_URL}/models`, {
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

    // Filter to ONLY whitelisted models.
    const live: ModelInfo[] = items
      .filter((m) => ALLOWED_ALIBABA_MODELS.has(m.id))
      .map((m) => {
        const vendor = vendorFromId(m.id);
        return {
          id: m.id,
          label: prettyLabel(m.id),
          vendor,
          agentCapable: isAgentCapable(m.id),
          multimodal: isMultimodal(m.id),
        } satisfies ModelInfo;
      });

    const alibabaModelsStatic = defaultModels.filter(
      (m) => m.id === "glm-5.2" || m.id === "qwen-3.7-max" || m.id === "qwen-3.7-plus" || m.id === "kimi-2.7-code"
    );

    const liveIds = new Set(live.map((m) => m.id));
    const finalAlibaba = [
      ...live,
      ...alibabaModelsStatic.filter((m) => !liveIds.has(m.id)),
    ];

    // Merge: codex models + free models + whitelisted Alibaba models.
    const merged = [...codexModels, ...allFreeModels, ...finalAlibaba];

    return NextResponse.json({
      models: merged.sort(sortByVendor),
      source: "live",
    });
  } catch {
    return NextResponse.json({
      models: [...defaultModels].sort(sortByVendor),
      source: "fallback",
      warning: "Failed to reach Alibaba MaaS API",
    });
  }
}

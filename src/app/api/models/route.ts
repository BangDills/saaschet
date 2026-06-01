import { NextResponse } from "next/server";
import {
  defaultModels,
  allowedVendors,
  isAllowedVendor,
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
 * Best-effort vendor label from the model id. Must align with the labels
 * in `allowedVendors` so filtering works.
 */
function vendorFromId(id: string): string {
  const lower = id.toLowerCase();
  if (lower.includes("claude") || lower.startsWith("anthropic"))
    return "Anthropic";
  if (lower.includes("gpt") || lower.startsWith("openai")) return "OpenAI";
  if (lower.includes("deepseek")) return "DeepSeek";
  if (lower.includes("minimax") || lower.includes("abab")) return "MiniMax";
  if (lower.includes("qwen")) return "Qwen";
  if (lower.includes("llama")) return "Meta";
  if (lower.includes("mistral") || lower.includes("nemo")) return "Mistral";
  if (lower.includes("gemini")) return "Google";
  return "Other";
}

function prettyLabel(id: string): string {
  return id
    .replace(/^anthropic-/, "")
    .replace(/^openai-/, "")
    .replace(/-instruct$/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Sort: keep the order of allowedVendors, then alphabetical within vendor. */
function sortByVendor(a: ModelInfo, b: ModelInfo): number {
  const ai = allowedVendors.indexOf(a.vendor as never);
  const bi = allowedVendors.indexOf(b.vendor as never);
  if (ai !== bi) return ai - bi;
  return a.label.localeCompare(b.label);
}

export async function GET() {
  const apiKey = process.env.DO_INFERENCE_API_KEY;

  // No key configured → return curated list (already filtered).
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

    // Map to our shape and filter to allowed vendors only.
    const live: ModelInfo[] = items
      .map((m) => {
        const vendor = vendorFromId(m.id);
        return {
          id: m.id,
          label: prettyLabel(m.id),
          vendor,
        } satisfies ModelInfo;
      })
      .filter((m) => isAllowedVendor(m.vendor));

    if (live.length === 0) {
      return NextResponse.json({
        models: [...defaultModels].sort(sortByVendor),
        source: "fallback",
        warning: "Live list contained no models from allowed vendors",
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

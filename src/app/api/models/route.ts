import { NextResponse } from "next/server";
import { defaultModels } from "@/lib/chat/models";
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
 * Best-effort vendor label inference from the model id.
 * E.g. "anthropic-claude-3.5-sonnet" -> "Anthropic".
 */
function vendorFromId(id: string): string {
  const lower = id.toLowerCase();
  if (lower.includes("claude") || lower.startsWith("anthropic")) return "Anthropic";
  if (lower.includes("gpt") || lower.startsWith("openai")) return "OpenAI";
  if (lower.includes("llama")) return "Meta";
  if (lower.includes("mistral") || lower.includes("nemo")) return "Mistral";
  if (lower.includes("deepseek")) return "DeepSeek";
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

export async function GET() {
  const apiKey = process.env.DO_INFERENCE_API_KEY;

  // If no key configured, just return the curated catalog.
  if (!apiKey) {
    return NextResponse.json({
      models: defaultModels,
      source: "fallback",
    });
  }

  try {
    const res = await fetch(`${DO_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      // Revalidate hourly.
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return NextResponse.json({
        models: defaultModels,
        source: "fallback",
        warning: `Upstream returned ${res.status}`,
      });
    }

    const json = (await res.json()) as DOModelListResponse;
    const items = json.data ?? [];

    if (items.length === 0) {
      return NextResponse.json({ models: defaultModels, source: "fallback" });
    }

    const live: ModelInfo[] = items.map((m) => ({
      id: m.id,
      label: prettyLabel(m.id),
      vendor: vendorFromId(m.id),
    }));

    return NextResponse.json({ models: live, source: "live" });
  } catch {
    return NextResponse.json({
      models: defaultModels,
      source: "fallback",
      warning: "Failed to reach inference.do-ai.run",
    });
  }
}

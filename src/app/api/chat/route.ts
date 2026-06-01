import { NextResponse } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { defaultModelId } from "@/lib/chat/models";
import { searchWeb, formatSearchResults } from "@/lib/chat/web-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DO_BASE_URL =
  process.env.DO_INFERENCE_BASE_URL ?? "https://inference.do-ai.run/v1";

const DEFAULT_SYSTEM = `You are Horizon AI, a helpful, concise assistant. \
Use Markdown for formatting and triple-backtick code blocks with language \
tags for code.`;

type ChatRequestBody = {
  messages: UIMessage[];
  model?: string;
  /** When true, run web search on the latest user message and prepend
   *  results to the system prompt. */
  webSearch?: boolean;
  /** Optional system prompt override. */
  system?: string;
};

/** Pull the most recent user message text out of UIMessages. */
function lastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const text = (m.parts ?? [])
      .map((p) => (p.type === "text" ? p.text : ""))
      .filter(Boolean)
      .join("");
    if (text.trim()) return text;
  }
  return "";
}

export async function POST(req: Request) {
  const apiKey = process.env.DO_INFERENCE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "DO_INFERENCE_API_KEY is not set. Add it to your environment variables.",
      },
      { status: 500 },
    );
  }

  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = body.messages ?? [];
  const modelId = body.model || defaultModelId;
  const wantsWebSearch = body.webSearch === true;

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "messages must be a non-empty array" },
      { status: 400 },
    );
  }

  let system = body.system?.trim() || DEFAULT_SYSTEM;

  // Optionally augment with live web search results.
  if (wantsWebSearch) {
    const tavilyKey = process.env.TAVILY_API_KEY;
    const query = lastUserText(messages);
    if (tavilyKey && query) {
      try {
        const results = await searchWeb(query, tavilyKey, {
          maxResults: 5,
          includeAnswer: true,
        });
        if (results.results.length > 0) {
          system = `${system}\n\n${formatSearchResults(results)}`;
        }
      } catch (err) {
        console.warn("[chat] web search failed:", err);
      }
    } else if (!tavilyKey) {
      console.warn(
        "[chat] webSearch requested but TAVILY_API_KEY is not set; skipping",
      );
    }
  }

  // OpenAI-compatible client pointed at DigitalOcean Inference.
  const digitalocean = createOpenAI({
    baseURL: DO_BASE_URL,
    apiKey,
  });

  try {
    // .chat() forces Chat Completions endpoint; DO doesn't support
    // OpenAI's Responses API.
    const result = streamText({
      model: digitalocean.chat(modelId),
      system,
      messages: await convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse({
      headers: {
        "X-Accel-Buffering": "no",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown inference error";
    return NextResponse.json(
      { error: `Inference failed: ${message}` },
      { status: 502 },
    );
  }
}

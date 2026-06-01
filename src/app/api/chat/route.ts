import { NextResponse } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { defaultModelId } from "@/lib/chat/models";

export const runtime = "nodejs";
// Disable static optimization for this route — must always run server-side.
export const dynamic = "force-dynamic";

const DO_BASE_URL =
  process.env.DO_INFERENCE_BASE_URL ?? "https://inference.do-ai.run/v1";

type ChatRequestBody = {
  messages: UIMessage[];
  model?: string;
  system?: string;
};

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
  const system =
    body.system ||
    "You are Horizon AI, a helpful, concise assistant. Use Markdown for formatting and triple-backtick code blocks with language tags for code.";

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "messages must be a non-empty array" },
      { status: 400 },
    );
  }

  // Wire up the DigitalOcean Serverless Inference endpoint as an
  // OpenAI-compatible provider.
  const digitalocean = createOpenAI({
    baseURL: DO_BASE_URL,
    apiKey,
  });

  try {
    // IMPORTANT: use `.chat()` explicitly. The default `digitalocean(id)` call
    // routes through OpenAI's Responses API, which DigitalOcean Serverless
    // Inference does not support — it returns "this model is not a responses
    // model". The Chat Completions endpoint is the universal one and is what
    // DO Inference exposes for all foundation models.
    const result = streamText({
      model: digitalocean.chat(modelId),
      system,
      messages: await convertToModelMessages(messages),
    });

    // Returns an SSE stream that the @ai-sdk/react useChat hook understands.
    // Headers include `X-Accel-Buffering: no` to keep streaming alive behind
    // reverse proxies like cPanel's Phusion Passenger.
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

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertCanSpend, recordSpend, getCreditSnapshot, OutOfCreditsError } from "@/lib/credits/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImageRequestBody = {
  prompt: string;
  model?: string;
  size?: string;
  provider?: string;
};

/* ── Pollinations.ai (free, no API key) ─────────────────────────────── */
const POLLINATIONS_MODELS = new Set([
  "zimage",
  "flux",
  "seedream",
  "gptimage",
  "kontext",
  "wan-image",
  "grok-imagine",
  "nova-canvas",
  "qwen-image",
]);

function isPollinations(provider?: string, model?: string): boolean {
  return provider === "pollinations" || POLLINATIONS_MODELS.has(model ?? "");
}

async function generateViaPollinations(
  prompt: string,
  model: string,
  size: string,
): Promise<string> {
  const [w, h] = size.split("x").map(Number);
  const width = w || 1024;
  const height = h || 1024;

  const encodedPrompt = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=${model}&width=${width}&height=${height}&nologo=true&seed=${Math.floor(Math.random() * 999999)}`;

  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Pollinations returned ${res.status}: ${await res.text().then(t => t.slice(0, 300))}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength < 1000) {
    throw new Error("Pollinations returned an invalid/empty image");
  }

  const b64 = Buffer.from(arrayBuffer).toString("base64");
  const contentType = res.headers.get("content-type") || "image/jpeg";
  return `data:${contentType};base64,${b64}`;
}

/* ── DigitalOcean Inference (existing) ──────────────────────────────── */
async function generateViaDigitalOcean(
  prompt: string,
  model: string,
  size: string,
): Promise<string> {
  const apiKey = process.env.DO_INFERENCE_API_KEY;
  if (!apiKey) {
    throw new Error("DO_INFERENCE_API_KEY is not set. Add it to your environment variables.");
  }

  const doBaseUrl = process.env.DO_INFERENCE_BASE_URL ?? "https://inference.do-ai.run/v1";

  const response = await fetch(`${doBaseUrl}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt: prompt.trim(),
      model,
      size,
      n: 1,
      response_format: "b64_json",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().then((t) => t.slice(0, 300));
    throw new Error(`Upstream generation failed: ${errorText}`);
  }

  const resData = (await response.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };

  if (resData.data?.[0]?.b64_json) {
    return `data:image/png;base64,${resData.data[0].b64_json}`;
  } else if (resData.data?.[0]?.url) {
    const imgRes = await fetch(resData.data[0].url);
    if (!imgRes.ok) {
      throw new Error(`Failed to fetch image from URL: ${imgRes.status}`);
    }
    const arrayBuffer = await imgRes.arrayBuffer();
    const b64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:image/png;base64,${b64}`;
  }

  throw new Error("Invalid image response payload from provider");
}

/* ── Main handler ───────────────────────────────────────────────────── */
export async function POST(req: Request) {
  // ── Auth ─────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = user.id;

  // ── Parse body ───────────────────────────────────────────────────────
  let body: ImageRequestBody;
  try {
    body = (await req.json()) as ImageRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    prompt,
    model = "stable-diffusion-3.5-large",
    size = "1024x1024",
    provider,
  } = body;

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  // ── Pre-flight: daily credit check ───────────────────────────────────
  try {
    await assertCanSpend(userId, "image");
  } catch (err) {
    if (err instanceof OutOfCreditsError) {
      return NextResponse.json(
        {
          error: err.message,
          code: "out_of_credits",
          credits: err.snapshot,
        },
        { status: 402 },
      );
    }
    throw err;
  }

  // ── Generate ─────────────────────────────────────────────────────────
  try {
    let imageDataUrl: string;

    if (isPollinations(provider, model)) {
      imageDataUrl = await generateViaPollinations(prompt.trim(), model, size);
    } else {
      imageDataUrl = await generateViaDigitalOcean(prompt.trim(), model, size);
    }

    // ── Record credits spend ────────────────────────────────────────────
    await recordSpend({
      userId,
      conversationId: null,
      kind: "image",
      toolCount: 0,
      modelId: model,
    });

    const credits = await getCreditSnapshot(userId);

    return NextResponse.json({
      image: imageDataUrl,
      credits,
    });
  } catch (err) {
    console.error("[image] generation failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate image" },
      { status: 500 },
    );
  }
}

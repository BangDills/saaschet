import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertCanSpend, recordSpend, getCreditSnapshot, OutOfCreditsError } from "@/lib/credits/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImageRequestBody = {
  prompt: string;
  model?: string;
  size?: string;
};

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

  const { prompt, model = "black-forest-labs/flux-schnell", size = "1024x1024" } = body;

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

  // ── Inference keys check ─────────────────────────────────────────────
  const apiKey = process.env.DO_INFERENCE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "DO_INFERENCE_API_KEY is not set. Add it to your environment variables." },
      { status: 500 },
    );
  }

  const doBaseUrl = process.env.DO_INFERENCE_BASE_URL ?? "https://inference.do-ai.run/v1";

  // ── Call Image Generation API ────────────────────────────────────────
  try {
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
      return NextResponse.json(
        { error: `Upstream generation failed: ${errorText}` },
        { status: response.status },
      );
    }

    const resData = (await response.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
    };

    let b64 = "";
    if (resData.data?.[0]?.b64_json) {
      b64 = resData.data[0].b64_json;
    } else if (resData.data?.[0]?.url) {
      // Fallback: download and convert URL to base64
      const imgRes = await fetch(resData.data[0].url);
      if (!imgRes.ok) {
        throw new Error(`Failed to fetch image from URL: ${imgRes.status}`);
      }
      const arrayBuffer = await imgRes.arrayBuffer();
      b64 = Buffer.from(arrayBuffer).toString("base64");
    } else {
      return NextResponse.json(
        { error: "Invalid image response payload from provider" },
        { status: 502 },
      );
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
      image: `data:image/png;base64,${b64}`,
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

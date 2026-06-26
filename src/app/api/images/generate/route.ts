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

/* ── Alibaba Cloud Inference ────────────────────────────────────────── */
async function generateViaAlibaba(
  prompt: string,
  model: string,
  size: string,
): Promise<string> {
  const apiKey = process.env.ALIBABA_API_KEY || process.env.DO_INFERENCE_API_KEY;
  if (!apiKey) {
    throw new Error("ALIBABA_API_KEY is not set. Add it to your environment variables.");
  }

  const baseUrl = process.env.ALIBABA_BASE_URL || "https://ws-7i0g4fvbloleocpm.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1";
  const nativeBaseUrl = baseUrl.replace(/\/compatible-mode\/v1\/?$/, "/api/v1");

  const sizeParam = size.replace("x", "*");

  const endpointPath = model === "wanx-v1"
    ? "services/aigc/text2image/image-synthesis"
    : "services/aigc/multimodal-generation/generation";

  const requestBody: any = {
    model: model,
    parameters: {
      size: sizeParam,
      n: 1,
    },
  };

  if (model === "wanx-v1") {
    requestBody.input = {
      prompt: prompt.trim(),
    };
  } else {
    requestBody.input = {
      messages: [
        {
          role: "user",
          content: prompt.trim(),
        },
      ],
    };
  }

  const response = await fetch(`${nativeBaseUrl}/${endpointPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text().then((t) => t.slice(0, 300));
    throw new Error(`Alibaba task creation failed: ${errorText}`);
  }

  const taskData = (await response.json()) as {
    output?: {
      task_id?: string;
      task_status?: string;
      results?: Array<{ url?: string }>;
    };
    code?: string;
    message?: string;
  };

  // If synchronous response returned the image URL immediately, use it
  const immediateUrl = taskData.output?.results?.[0]?.url;
  if (immediateUrl) {
    const imgRes = await fetch(immediateUrl);
    if (!imgRes.ok) {
      throw new Error(`Failed to fetch image from URL: ${imgRes.status}`);
    }
    const arrayBuffer = await imgRes.arrayBuffer();
    const b64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:image/png;base64,${b64}`;
  }

  const taskId = taskData.output?.task_id;
  if (!taskId) {
    throw new Error(`Alibaba returned no task ID or image URL: ${taskData.message || JSON.stringify(taskData)}`);
  }

  const maxRetries = 25;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const pollRes = await fetch(`${nativeBaseUrl}/tasks/${taskId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!pollRes.ok) {
      const pollErrorText = await pollRes.text().then((t) => t.slice(0, 300));
      throw new Error(`Alibaba polling failed: ${pollErrorText}`);
    }

    const pollData = (await pollRes.json()) as {
      output?: {
        task_status: string;
        results?: Array<{ url?: string }>;
      };
      code?: string;
      message?: string;
    };

    const status = pollData.output?.task_status;
    if (status === "SUCCEEDED") {
      const imgUrl = pollData.output?.results?.[0]?.url;
      if (!imgUrl) {
        throw new Error("Alibaba task succeeded but returned no image URL");
      }

      const imgRes = await fetch(imgUrl);
      if (!imgRes.ok) {
        throw new Error(`Failed to fetch image from URL: ${imgRes.status}`);
      }
      const arrayBuffer = await imgRes.arrayBuffer();
      const b64 = Buffer.from(arrayBuffer).toString("base64");
      return `data:image/png;base64,${b64}`;
    }

    if (status === "FAILED" || status === "CANCELED") {
      throw new Error(`Alibaba task failed with status: ${status}. ${pollData.message || ""}`);
    }
  }

  throw new Error("Alibaba image generation timed out after 25 seconds");
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
    model = "wan2.7-image-pro",
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
      imageDataUrl = await generateViaAlibaba(prompt.trim(), model, size);
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

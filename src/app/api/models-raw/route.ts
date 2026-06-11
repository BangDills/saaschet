import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.DO_INFERENCE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "DO_INFERENCE_API_KEY not set" }, { status: 500 });
  }

  const baseUrl = process.env.DO_INFERENCE_BASE_URL ?? "https://inference.do-ai.run/v1";

  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      const text = await res.text().then((t) => t.slice(0, 500));
      return NextResponse.json({ error: text }, { status: res.status });
    }

    const json = await res.json();
    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

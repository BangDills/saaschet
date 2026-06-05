import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requestDeviceCode } from "@/lib/openai/codex-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/openai/device-code
 *
 * Starts the OpenAI Codex Device Code flow.
 * Returns the user_code and device_auth_id for the frontend to display.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const deviceCode = await requestDeviceCode();
    return NextResponse.json({
      user_code: deviceCode.user_code,
      device_auth_id: deviceCode.device_auth_id,
      interval: deviceCode.interval,
      verification_url: "https://auth.openai.com/codex/device",
    });
  } catch (err) {
    console.error("[openai/device-code] error:", err);
    return NextResponse.json(
      { error: "Failed to start OpenAI login flow" },
      { status: 502 },
    );
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TIER_LIMITS, type Tier } from "@/lib/credits/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/profile/tier  { tier: "free" | "pro" }
 *
 * Self-serve tier switch — but only the downgrade to Free is allowed.
 * Pro is a paid 24h trial activated by an admin (after WhatsApp payment)
 * via updateUserTierAction, so this endpoint blocks tier:"pro" to stop
 * self-activation via curl/script. Calls the `set_user_tier` RPC, which
 * self-gates on auth.uid() so users can only modify their own row.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { tier?: string };
  try {
    body = (await req.json()) as { tier?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tier = body.tier as Tier | undefined;
  if (tier !== "free" && tier !== "pro") {
    return NextResponse.json(
      { error: "tier must be 'free' or 'pro'" },
      { status: 400 },
    );
  }

  // Self-serve can only downgrade to Free. Pro is a paid 24h trial activated
  // by an admin after WhatsApp payment — block direct self-activation here so
  // the endpoint can't be abused via curl/script.
  if (tier === "pro") {
    return NextResponse.json(
      {
        error:
          "Pro hanya bisa diaktifkan admin setelah pembayaran. Hubungi admin via WhatsApp.",
      },
      { status: 403 },
    );
  }

  const { data, error } = await supabase.rpc("set_user_tier", { p_tier: tier });
  if (error) {
    return NextResponse.json(
      { error: `Failed to switch tier: ${error.message}` },
      { status: 500 },
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    ok: true,
    tier: row?.tier ?? tier,
    dailyLimit: row?.daily_limit ?? TIER_LIMITS[tier],
    remaining: row?.remaining,
  });
}

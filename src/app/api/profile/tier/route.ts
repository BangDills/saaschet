import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TIER_LIMITS, type Tier } from "@/lib/credits/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/profile/tier  { tier: "free" | "pro" }
 *
 * Switches the signed-in user between Free (50/day) and Pro (1000/day).
 * No payment yet — this is a self-service toggle for the demo. Calls
 * the Postgres function `set_user_tier` which runs with security
 * definer and self-gates on auth.uid() so users can only modify their
 * own row.
 *
 * When real payments are wired in (Phase 5 / Stripe), this route will
 * become webhook-only and the in-app "Upgrade to Pro" button will hit
 * Stripe Checkout instead.
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

/**
 * Credit accounting helpers.
 *
 * Mental model (Kiro-ish):
 *   - Each user has a daily quota (default 50). Resets at UTC 00:00.
 *   - A plain `chat` turn costs 1.
 *   - An `agent` turn costs 3, plus 1 per executed tool call (cap 10
 *     extra so a runaway loop can't bankrupt the user in one go).
 *
 * No money. No subscription. Just a soft daily ceiling — when it's hit,
 * /api/chat returns 402 with a friendly error and the UI shows
 * "limit reached, comes back at midnight UTC".
 */

import { createAdminClient } from "@/lib/supabase/admin";

export const COST_CHAT_BASE = 1;
export const COST_AGENT_BASE = 3;
export const COST_AGENT_PER_TOOL = 1;
export const COST_AGENT_TOOL_CAP = 10;
export const DEFAULT_DAILY_LIMIT = 50;

/** Free / Pro tier definition. Stays in code, mirrored by the SQL function
 *  `set_user_tier`. Kept in sync manually for now. */
export type Tier = "free" | "pro";

export const TIER_LIMITS: Record<Tier, number> = {
  free: 50,
  pro: 1000,
};

export type CreditSnapshot = {
  tier: Tier;
  dailyLimit: number;
  usedToday: number;
  remaining: number;
  /** UTC ms when the counter next resets. */
  resetsAt: number;
  totalUsed: number;
  /** UTC ms when the pro trial expires, or null (no expiry / not pro). */
  tierExpiresAt: number | null;
};

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowUtcMs(): number {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0); // sets to next 00:00 UTC
  return d.getTime();
}

/**
 * Read the user's current snapshot, lazily resetting the daily counter
 * when the day rolls over. Always returns a row — creates one if the
 * trigger from migration 2 hasn't fired yet (e.g. older users).
 */
export async function getCreditSnapshot(
  userId: string,
): Promise<CreditSnapshot> {
  const admin = createAdminClient();

  const { data: row } = await admin
    .from("user_credits")
    .select(
      "tier, daily_limit, used_today, day_started_on, total_used, tier_expires_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  let tier: Tier = "free";
  let dailyLimit = DEFAULT_DAILY_LIMIT;
  let usedToday = 0;
  let totalUsed = 0;
  let tierExpiresAt: number | null = null;

  if (!row) {
    // Backfill missing row (older users predating migration 2).
    await admin.from("user_credits").insert({ user_id: userId });
  } else {
    tier = (row.tier as Tier) ?? "free";
    dailyLimit = row.daily_limit ?? TIER_LIMITS[tier];
    totalUsed = Number(row.total_used ?? 0);

    // Pro trial expiry: if the pro window has passed, auto-downgrade to free
    // (no expiry) and reset the daily limit to the free tier. A null
    // tier_expires_at means permanent (legacy pro users from before 0008).
    const expiresRaw = row.tier_expires_at as string | null;
    if (tier === "pro" && expiresRaw) {
      const expiresMs = new Date(expiresRaw).getTime();
      tierExpiresAt = expiresMs;
      if (Date.now() >= expiresMs) {
        tier = "free";
        dailyLimit = TIER_LIMITS.free;
        tierExpiresAt = null;
        await admin
          .from("user_credits")
          .update({
            tier: "free",
            daily_limit: TIER_LIMITS.free,
            tier_expires_at: null,
          })
          .eq("user_id", userId);
      }
    }

    if (row.day_started_on === todayUtcDate()) {
      usedToday = row.used_today ?? 0;
    } else {
      // Day rolled over since the last write — reset before reporting.
      await admin
        .from("user_credits")
        .update({
          used_today: 0,
          day_started_on: todayUtcDate(),
        })
        .eq("user_id", userId);
      usedToday = 0;
    }
  }

  return {
    tier,
    dailyLimit,
    usedToday,
    remaining: Math.max(0, dailyLimit - usedToday),
    resetsAt: tomorrowUtcMs(),
    totalUsed,
    tierExpiresAt,
  };
}

/**
 * Estimate the cost of a turn BEFORE we run it. Used for the pre-flight
 * gate. Tool count is unknown for agent runs at this point, so we charge
 * the base only and let `recordSpend` catch up at the end.
 */
export function estimatePreflightCost(
  kind: "chat" | "agent",
): number {
  return kind === "chat" ? COST_CHAT_BASE : COST_AGENT_BASE;
}

/**
 * Compute the actual cost based on observed tool calls.
 */
export function computeFinalCost(
  kind: "chat" | "agent",
  toolCount: number,
): number {
  if (kind === "chat") return COST_CHAT_BASE;
  const tools = Math.min(Math.max(0, toolCount), COST_AGENT_TOOL_CAP);
  return COST_AGENT_BASE + tools * COST_AGENT_PER_TOOL;
}

/**
 * Pre-flight gate. Read-only snapshot check vs estimated cost; throws a
 * recognizable error when already over the daily limit so the API route
 * can return a 402 fast, before running the turn. This is a UX short-cut
 * only — the authoritative atomic charge happens in `recordSpend` via the
 * `spend_credits` RPC, which serializes concurrent turns on a row lock so
 * a race here can't let a second turn slip past the limit.
 */
export class OutOfCreditsError extends Error {
  readonly snapshot: CreditSnapshot;
  readonly estimated: number;
  constructor(snapshot: CreditSnapshot, estimated: number) {
    super(
      `Daily credit limit reached (${snapshot.usedToday}/${snapshot.dailyLimit}). Resets at midnight UTC.`,
    );
    this.name = "OutOfCreditsError";
    this.snapshot = snapshot;
    this.estimated = estimated;
  }
}

export async function assertCanSpend(
  userId: string,
  kind: "chat" | "agent",
): Promise<{ snapshot: CreditSnapshot; estimated: number }> {
  const snapshot = await getCreditSnapshot(userId);
  const estimated = estimatePreflightCost(kind);
  if (snapshot.remaining < estimated) {
    throw new OutOfCreditsError(snapshot, estimated);
  }
  return { snapshot, estimated };
}

/**
 * Record a spend after the turn finishes. Increments the daily counter
 * + lifetime counter and writes a ledger row. Best-effort: failure to
 * record is logged but doesn't throw, since the user already got the
 * AI response.
 */
export async function recordSpend(opts: {
  userId: string;
  conversationId: string | null;
  kind: "chat" | "agent";
  toolCount: number;
  modelId: string;
}): Promise<{ cost: number; overLimit: boolean }> {
  const cost = computeFinalCost(opts.kind, opts.toolCount);
  const admin = createAdminClient();

  // Single atomic RPC: gate check + counter bump + ledger row in one
  // transaction with a row lock (SELECT ... FOR UPDATE). Concurrent turns
  // serialize on the lock, so two requests can't both pass a stale gate.
  // If the bump would exceed the daily limit the function reports
  // over_limit = true and skips the write — the user already received the
  // response, so we log + move on rather than throw.
  const { data, error } = await admin.rpc("spend_credits", {
    p_user_id: opts.userId,
    p_kind: opts.kind,
    p_cost: cost,
    p_model_id: opts.modelId,
    p_conversation_id: opts.conversationId,
    p_tool_count: opts.toolCount,
  });

  if (error) {
    console.error("[credits] spend_credits RPC failed:", error);
    return { cost, overLimit: false };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { over_limit: boolean | null }
    | null;

  return { cost, overLimit: Boolean(row?.over_limit) };
}

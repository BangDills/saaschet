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
export const COST_IMAGE_BASE = 5;
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
    .select("tier, daily_limit, used_today, day_started_on, total_used")
    .eq("user_id", userId)
    .maybeSingle();

  let tier: Tier = "free";
  let dailyLimit = DEFAULT_DAILY_LIMIT;
  let usedToday = 0;
  let totalUsed = 0;

  if (!row) {
    // Backfill missing row (older users predating migration 2).
    await admin.from("user_credits").insert({ user_id: userId });
  } else {
    tier = (row.tier as Tier) ?? "free";
    dailyLimit = row.daily_limit ?? TIER_LIMITS[tier];
    totalUsed = Number(row.total_used ?? 0);
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
  };
}

/**
 * Estimate the cost of a turn BEFORE we run it. Used for the pre-flight
 * gate. Tool count is unknown for agent runs at this point, so we charge
 * the base only and let `recordSpend` catch up at the end.
 */
export function estimatePreflightCost(
  kind: "chat" | "agent" | "image",
): number {
  if (kind === "image") return COST_IMAGE_BASE;
  return kind === "chat" ? COST_CHAT_BASE : COST_AGENT_BASE;
}

/**
 * Compute the actual cost based on observed tool calls.
 */
export function computeFinalCost(
  kind: "chat" | "agent" | "image",
  toolCount: number,
): number {
  if (kind === "image") return COST_IMAGE_BASE;
  if (kind === "chat") return COST_CHAT_BASE;
  const tools = Math.min(Math.max(0, toolCount), COST_AGENT_TOOL_CAP);
  return COST_AGENT_BASE + tools * COST_AGENT_PER_TOOL;
}

/**
 * Pre-flight gate. Checks current snapshot vs estimated cost; throws a
 * recognizable error when over the daily limit so the API route can
 * return a 402.
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
  kind: "chat" | "agent" | "image",
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
  kind: "chat" | "agent" | "image";
  toolCount: number;
  modelId: string;
}): Promise<{ cost: number }> {
  const cost = computeFinalCost(opts.kind, opts.toolCount);
  const admin = createAdminClient();

  // Insert log entry.
  const { error: logErr } = await admin.from("credit_usage_log").insert({
    user_id: opts.userId,
    conversation_id: opts.conversationId,
    kind: opts.kind,
    cost,
    model_id: opts.modelId,
    tool_count: opts.toolCount,
  });
  if (logErr) {
    console.error("[credits] failed to write usage log:", logErr);
  }

  // Atomically bump the user's counters. We do a read-modify-write since
  // Supabase JS doesn't expose a SQL UPDATE … SET col = col + N helper
  // without an RPC. The race window is tiny + worst case the user
  // gets one extra request through, which is acceptable.
  const { data: cur } = await admin
    .from("user_credits")
    .select("used_today, day_started_on, total_used")
    .eq("user_id", opts.userId)
    .maybeSingle();

  if (!cur) return { cost };

  const today = todayUtcDate();
  const nextUsedToday =
    cur.day_started_on === today ? (cur.used_today ?? 0) + cost : cost;
  const nextTotal = Number(cur.total_used ?? 0) + cost;

  const { error: updErr } = await admin
    .from("user_credits")
    .update({
      used_today: nextUsedToday,
      day_started_on: today,
      total_used: nextTotal,
    })
    .eq("user_id", opts.userId);
  if (updErr) {
    console.error("[credits] failed to update counter:", updErr);
  }

  return { cost };
}

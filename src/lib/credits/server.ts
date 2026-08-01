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
  pro: 3000,
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
  if (kind === "chat") return COST_CHAT_BASE;

  // Reserving only the base is why used_today can read past the cap — 54/50
  // was observed in production. That overshoot is deliberate and documented
  // here, in settle_reserved_credits, and by over_limit being returned as
  // informational: the tool calls already ran, so the user is charged for
  // them even if it crosses the line. The bound is COST_AGENT_TOOL_CAP.
  //
  // The alternative is to hold the worst case up front and let settle refund
  // the difference — settle_reserved_credits applies
  // (p_final_cost - p_reserved), so a negative delta already gives credits
  // back. That guarantees the cap is never crossed, at the price of refusing
  // an agent turn whenever fewer than 13 credits remain, even though most
  // turns cost far less.
  //
  // Neither is a bug, so the documented behaviour stays the default and the
  // strict policy is opt-in.
  return process.env.CREDITS_STRICT_PREFLIGHT === "1"
    ? COST_AGENT_BASE + COST_AGENT_TOOL_CAP * COST_AGENT_PER_TOOL
    : COST_AGENT_BASE;
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

// ── Reserve-then-settle (atomic, closes the parallel-request hole) ─────
//
// assertCanSpend only READS a snapshot; N parallel requests could all pass
// it with one credit left and all reach the model provider. reserveSpend
// increments the counter atomically BEFORE the turn runs, and settleSpend
// adjusts to the real cost (success) or refunds (failure/abort) afterwards
// — so failed turns stay free, exactly like before.
//
// Both call RPCs introduced in migration 0027. Migrations in this repo are
// applied by hand, so a deploy can precede the SQL: when the function is
// missing we fall back to the legacy read-only gate + spend_credits path
// and warn loudly instead of breaking chat.

export type CreditReservation = {
  /** Credits atomically added to used_today up front. 0 = legacy fallback. */
  reserved: number;
};

function isMissingFunction(error: { code?: string; message?: string }): boolean {
  // 42883: Postgres "function does not exist"; PGRST202: PostgREST cannot
  // find the function in its schema cache.
  return (
    error.code === "42883" ||
    error.code === "PGRST202" ||
    /could not find the function|does not exist/i.test(error.message ?? "")
  );
}

/**
 * Atomically reserve the base cost of a turn before running it. Throws
 * OutOfCreditsError when the quota can't cover it.
 */
export async function reserveSpend(
  userId: string,
  kind: "chat" | "agent",
): Promise<CreditReservation> {
  const amount = estimatePreflightCost(kind);
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("reserve_credits", {
    p_user_id: userId,
    p_amount: amount,
  });

  if (error) {
    if (isMissingFunction(error)) {
      console.warn(
        "[credits] reserve_credits missing — run migration 0027. Falling back to the non-atomic gate.",
      );
    } else {
      console.error("[credits] reserve_credits RPC failed:", error);
    }
    // Legacy path: read-only gate now, spend_credits at settle time.
    await assertCanSpend(userId, kind);
    return { reserved: 0 };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { ok: boolean | null }
    | null;

  if (!row?.ok) {
    const snapshot = await getCreditSnapshot(userId);
    throw new OutOfCreditsError(snapshot, amount);
  }
  return { reserved: amount };
}

/**
 * Settle a reservation after the turn ends. Success: adjust to the real
 * cost and write the ledger row. Failure/abort: refund. Best-effort —
 * a settle error is logged, never thrown.
 */
export async function settleSpend(opts: {
  userId: string;
  conversationId: string | null;
  kind: "chat" | "agent";
  toolCount: number;
  modelId: string;
  reservation: CreditReservation;
  success: boolean;
}): Promise<void> {
  // Legacy fallback (reservation never happened): keep the old behavior —
  // charge on success only.
  if (opts.reservation.reserved === 0) {
    if (opts.success) {
      await recordSpend({
        userId: opts.userId,
        conversationId: opts.conversationId,
        kind: opts.kind,
        toolCount: opts.toolCount,
        modelId: opts.modelId,
      });
    }
    return;
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("settle_reserved_credits", {
    p_user_id: opts.userId,
    p_reserved: opts.reservation.reserved,
    p_final_cost: opts.success ? computeFinalCost(opts.kind, opts.toolCount) : 0,
    p_success: opts.success,
    p_kind: opts.kind,
    p_model_id: opts.modelId,
    p_conversation_id: opts.conversationId,
    p_tool_count: opts.toolCount,
  });

  if (error) {
    console.error("[credits] settle_reserved_credits failed:", error);
    // Reserved but unsettled: the base cost stays counted until the next
    // UTC rollover. Deliberately NOT retried via spend_credits here — that
    // could double-charge.
  }
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

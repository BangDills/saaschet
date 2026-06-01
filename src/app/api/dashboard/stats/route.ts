import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCreditSnapshot } from "@/lib/credits/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/stats
 *
 * Returns everything the main dashboard renders: KPI cards, daily usage
 * area-chart series (last 30 days), per-model usage bars, and a recent
 * activity feed. All numbers are scoped to the signed-in user.
 *
 * Built by composing several lightweight queries instead of one big
 * RPC, because Supabase + RLS handles per-user filtering for free.
 */

type DailyPoint = { date: string; chat: number; agent: number };
type ModelUsage = { modelId: string; count: number; totalCost: number };
type RecentItem = {
  id: string;
  kind: "chat" | "agent";
  cost: number;
  modelId: string | null;
  toolCount: number;
  createdAt: number;
  conversationTitle: string | null;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Credit snapshot (also gives us tier + remaining) ────────────────
  const credits = await getCreditSnapshot(user.id);

  // ── Total conversations + messages ──────────────────────────────────
  const [{ count: convCount }, { count: msgCount }, { count: ledgerCount }] =
    await Promise.all([
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .in(
          "conversation_id",
          (
            await supabase
              .from("conversations")
              .select("id")
              .eq("user_id", user.id)
          ).data?.map((c) => c.id) ?? [],
        ),
      supabase
        .from("credit_usage_log")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
    ]);

  // ── Daily usage series (last 30 days, including today) ──────────────
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 29);
  since.setUTCHours(0, 0, 0, 0);

  const { data: ledgerRows } = await supabase
    .from("credit_usage_log")
    .select("kind, cost, model_id, created_at, tool_count, conversation_id")
    .eq("user_id", user.id)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false });

  const rows = ledgerRows ?? [];

  // Bucket by UTC date.
  const dayMap = new Map<string, DailyPoint>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    dayMap.set(key, { date: key, chat: 0, agent: 0 });
  }
  for (const r of rows) {
    const key = (r.created_at as string).slice(0, 10);
    const point = dayMap.get(key);
    if (!point) continue;
    if (r.kind === "agent") point.agent += r.cost;
    else point.chat += r.cost;
  }
  const daily: DailyPoint[] = Array.from(dayMap.values());

  // ── Per-model totals (last 30 days) ─────────────────────────────────
  const modelMap = new Map<string, ModelUsage>();
  for (const r of rows) {
    const m = (r.model_id as string | null) ?? "unknown";
    const cur = modelMap.get(m) ?? { modelId: m, count: 0, totalCost: 0 };
    cur.count += 1;
    cur.totalCost += r.cost as number;
    modelMap.set(m, cur);
  }
  const byModel: ModelUsage[] = Array.from(modelMap.values())
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, 6);

  // ── Recent activity (top 8) ─────────────────────────────────────────
  const recent: RecentItem[] = rows.slice(0, 8).map((r) => ({
    id: String(r.created_at),
    kind: r.kind as "chat" | "agent",
    cost: r.cost as number,
    modelId: (r.model_id as string | null) ?? null,
    toolCount: (r.tool_count as number) ?? 0,
    createdAt: new Date(r.created_at as string).getTime(),
    conversationTitle: null,
  }));

  // Hydrate conversation titles for the recent feed in one query.
  const convIds = Array.from(
    new Set(
      rows
        .slice(0, 8)
        .map((r) => r.conversation_id as string | null)
        .filter((v): v is string => !!v),
    ),
  );
  if (convIds.length > 0) {
    const { data: convs } = await supabase
      .from("conversations")
      .select("id, title")
      .in("id", convIds);
    const titles = new Map((convs ?? []).map((c) => [c.id, c.title]));
    rows.slice(0, 8).forEach((r, i) => {
      const cid = r.conversation_id as string | null;
      if (cid) recent[i].conversationTitle = titles.get(cid) ?? null;
    });
  }

  // ── Today subtotals derived from `daily` ────────────────────────────
  const todayKey = new Date().toISOString().slice(0, 10);
  const today = daily.find((d) => d.date === todayKey) ?? {
    date: todayKey,
    chat: 0,
    agent: 0,
  };

  return NextResponse.json({
    credits: {
      tier: credits.tier,
      dailyLimit: credits.dailyLimit,
      usedToday: credits.usedToday,
      remaining: credits.remaining,
      resetsAt: credits.resetsAt,
      totalUsed: credits.totalUsed,
    },
    totals: {
      conversations: convCount ?? 0,
      messages: msgCount ?? 0,
      turns: ledgerCount ?? 0,
      todayChat: today.chat,
      todayAgent: today.agent,
    },
    daily,
    byModel,
    recent,
  });
}

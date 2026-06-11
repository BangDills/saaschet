import { Activity, BarChart3, Bot, Crown, MessageSquare, Sparkles } from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/stat-card";
import { UsageAreaChart } from "@/components/dashboard/usage-area-chart";
import { UsageBarChart } from "@/components/dashboard/usage-bar-chart";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { createClient } from "@/lib/supabase/server";
import { getCreditSnapshot, type Tier } from "@/lib/credits/server";
import { formatNumber } from "@/lib/utils";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type DailyPoint = { date: string; chat: number; agent: number; image: number };
type ModelUsage = { modelId: string; count: number; totalCost: number };
type RecentItem = {
  id: string;
  kind: "chat" | "agent" | "image";
  cost: number;
  modelId: string | null;
  toolCount: number;
  createdAt: number;
  conversationTitle: string | null;
};

type LedgerRow = {
  kind: "chat" | "agent" | "image";
  cost: number;
  model_id: string | null;
  created_at: string;
  tool_count: number;
  conversation_id: string | null;
};

async function loadDashboard(userId: string) {
  const supabase = await createClient();
  const credits = await getCreditSnapshot(userId);

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 29);
  since.setUTCHours(0, 0, 0, 0);

  const [convRes, ledgerRes, allConvIdsRes] = await Promise.all([
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("credit_usage_log")
      .select(
        "kind, cost, model_id, created_at, tool_count, conversation_id",
      )
      .eq("user_id", userId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false }),
    supabase.from("conversations").select("id").eq("user_id", userId),
  ]);

  const conversationIds = (allConvIdsRes.data ?? []).map((r) => r.id);
  const { count: msgCount } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .in("conversation_id", conversationIds.length ? conversationIds : ["__"]);

  const rows: LedgerRow[] = (ledgerRes.data ?? []) as LedgerRow[];

  // Daily series (30 days incl. today).
  const dayMap = new Map<string, DailyPoint>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    dayMap.set(key, { date: key, chat: 0, agent: 0, image: 0 });
  }
  for (const r of rows) {
    const key = r.created_at.slice(0, 10);
    const point = dayMap.get(key);
    if (!point) continue;
    if (r.kind === "agent") point.agent += r.cost;
    else if (r.kind === "image") point.image += r.cost;
    else point.chat += r.cost;
  }
  const daily = Array.from(dayMap.values());

  // Per-model totals.
  const modelMap = new Map<string, ModelUsage>();
  for (const r of rows) {
    const m = r.model_id ?? "unknown";
    const cur = modelMap.get(m) ?? { modelId: m, count: 0, totalCost: 0 };
    cur.count += 1;
    cur.totalCost += r.cost;
    modelMap.set(m, cur);
  }
  const byModel = Array.from(modelMap.values())
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, 6);

  // Recent activity (8) with conversation titles.
  const recent: RecentItem[] = rows.slice(0, 8).map((r, i) => ({
    id: `${r.created_at}-${i}`,
    kind: r.kind,
    cost: r.cost,
    modelId: r.model_id,
    toolCount: r.tool_count ?? 0,
    createdAt: new Date(r.created_at).getTime(),
    conversationTitle: null,
  }));
  const recentConvIds = Array.from(
    new Set(
      rows
        .slice(0, 8)
        .map((r) => r.conversation_id)
        .filter((v): v is string => !!v),
    ),
  );
  if (recentConvIds.length) {
    const { data: convs } = await supabase
      .from("conversations")
      .select("id, title")
      .in("id", recentConvIds);
    const titles = new Map((convs ?? []).map((c) => [c.id, c.title]));
    rows.slice(0, 8).forEach((r, i) => {
      if (r.conversation_id) {
        recent[i].conversationTitle = titles.get(r.conversation_id) ?? null;
      }
    });
  }

  // Today subtotal (last bucket of `daily`).
  const todayKey = new Date().toISOString().slice(0, 10);
  const today = daily.find((d) => d.date === todayKey) ?? {
    date: todayKey,
    chat: 0,
    agent: 0,
    image: 0,
  };

  const totalCreditsLast30 = rows.reduce((sum, r) => sum + r.cost, 0);
  const totalAgentTurnsLast30 = rows.filter((r) => r.kind === "agent").length;

  return {
    credits,
    totals: {
      conversations: convRes.count ?? 0,
      messages: msgCount ?? 0,
      todayChat: today.chat,
      todayAgent: today.agent,
      todayImage: today.image,
      totalCreditsLast30,
      totalAgentTurnsLast30,
    },
    daily,
    byModel,
    recent,
  };
}

const TIER_LABEL: Record<Tier, string> = {
  free: "Free",
  pro: "Pro",
};

export default async function MainDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Admin-only page — regular users go to AI Chat (the core product).
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") redirect("/ai-chat");

  const data = await loadDashboard(user.id);
  const { credits, totals, daily, byModel, recent } = data;
  const todayTotal = totals.todayChat + totals.todayAgent + totals.todayImage;

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Credits Used Today"
          value={formatNumber(credits.usedToday)}
          icon={<BarChart3 className="size-6" />}
        />
        <StatCard
          label="Credits Remaining"
          value={formatNumber(credits.remaining)}
          icon={<Sparkles className="size-6" />}
        />
        <StatCard
          label="Conversations"
          value={formatNumber(totals.conversations)}
          icon={<MessageSquare className="size-6" />}
        />
        <StatCard
          label="Current Plan"
          value={TIER_LABEL[credits.tier]}
          icon={<Crown className="size-6" />}
          action={
            <Link
              href="/profile"
              className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-medium transition-colors hover:bg-accent"
            >
              Manage
            </Link>
          }
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted">
                <Activity className="size-5" />
              </div>
              <div>
                <CardTitle className="text-2xl">
                  {formatNumber(totals.totalCreditsLast30)}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Credits used in the last 30 days
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground">
              Last 30 days
            </div>
          </CardHeader>
          <CardContent>
            <UsageAreaChart data={daily} />
            <div className="mt-4 flex items-center justify-center gap-6 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className="inline-block size-2.5 rounded-sm bg-chart-2" />
                Chat
              </span>
              <span className="flex items-center gap-2">
                <span className="inline-block size-2.5 rounded-sm bg-chart-1" />
                Agent
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Top models</CardTitle>
            <p className="text-sm text-muted-foreground">
              Credits by model · last 30 days
            </p>
          </CardHeader>
          <CardContent>
            {byModel.length === 0 ? (
              <p className="py-12 text-center text-xs text-muted-foreground">
                No usage yet — start a chat to see model breakdowns.
              </p>
            ) : (
              <UsageBarChart data={byModel} />
            )}
            <div className="mt-4 space-y-1">
              <p className="flex items-center gap-1 text-sm font-semibold">
                <Bot className="size-4" />
                {totals.totalAgentTurnsLast30} agent run
                {totals.totalAgentTurnsLast30 === 1 ? "" : "s"}
              </p>
              <p className="text-xs text-muted-foreground">
                Today: {totals.todayChat} chat · {totals.todayAgent} agent ·{" "}
                {todayTotal} credits
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl">Recent activity</CardTitle>
            <p className="text-sm text-muted-foreground">
              Last {Math.min(8, recent.length)} chat
              {recent.length === 1 ? "" : "s"}
            </p>
          </div>
          <Link
            href="/ai-chat"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-medium transition-colors hover:bg-accent"
          >
            Open chat
          </Link>
        </CardHeader>
        <CardContent>
          <RecentActivity items={recent} />
        </CardContent>
      </Card>
    </div>
  );
}

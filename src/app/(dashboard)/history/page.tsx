import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  HistoryTable,
  type HistoryRow,
} from "@/components/dashboard/history-table";

export const dynamic = "force-dynamic";

type LedgerRow = {
  id: string;
  kind: string;
  cost: number;
  model_id: string | null;
  tool_count: number;
  created_at: string;
  conversation_id: string | null;
};

export default async function HistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch all credit usage logs for this user, most recent first.
  const { data: logs } = await supabase
    .from("credit_usage_log")
    .select("id, kind, cost, model_id, tool_count, created_at, conversation_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = (logs ?? []) as LedgerRow[];

  // Batch-fetch conversation titles for rows that have a conversation_id.
  const convIds = Array.from(
    new Set(rows.map((r) => r.conversation_id).filter((v): v is string => !!v)),
  );
  const titles = new Map<string, string>();
  if (convIds.length > 0) {
    const { data: convs } = await supabase
      .from("conversations")
      .select("id, title")
      .in("id", convIds);
    for (const c of convs ?? []) {
      titles.set(c.id, c.title);
    }
  }

  const historyRows: HistoryRow[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind as "chat" | "agent",
    cost: r.cost,
    modelId: r.model_id,
    toolCount: r.tool_count ?? 0,
    createdAt: r.created_at,
    conversationId: r.conversation_id,
    conversationTitle: r.conversation_id
      ? titles.get(r.conversation_id) ?? null
      : null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Usage History</h2>
        <p className="text-sm text-muted-foreground">
          Track your credit usage across all chat and agent sessions.
        </p>
      </div>
      <HistoryTable rows={historyRows} />
    </div>
  );
}

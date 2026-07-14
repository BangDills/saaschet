import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConversationRow = {
  id: string;
  title: string;
  model_id: string;
  github_repo: string | null;
  status: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * List the signed-in user's conversations (metadata only — no messages).
 * Most-recently-updated first.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, model_id, github_repo, status, is_pinned, created_at, updated_at")
    .eq("user_id", user.id)
    .order("is_pinned", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as ConversationRow[];
  const conversations = rows.map((c) => ({
    id: c.id,
    title: c.title,
    modelId: c.model_id,
    githubRepo: c.github_repo,
    status: c.status ?? "idle",
    isPinned: c.is_pinned,
    messages: [],
    createdAt: new Date(c.created_at).getTime(),
    updatedAt: new Date(c.updated_at).getTime(),
  }));

  return NextResponse.json({ conversations });
}

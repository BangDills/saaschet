import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ChatRole } from "@/lib/chat/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConversationRow = {
  id: string;
  title: string;
  model_id: string;
  github_repo: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

/** GET /api/conversations/[id] — load full conversation with messages. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // RLS already guarantees ownership, but eq filters keep things tidy.
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, title, model_id, github_repo, created_at, updated_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (convErr) {
    return NextResponse.json({ error: convErr.message }, { status: 500 });
  }
  if (!conv) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  const { data: msgs, error: msgsErr } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (msgsErr) {
    return NextResponse.json({ error: msgsErr.message }, { status: 500 });
  }

  const c = conv as ConversationRow;
  const m = (msgs ?? []) as MessageRow[];

  return NextResponse.json({
    conversation: {
      id: c.id,
      title: c.title,
      modelId: c.model_id,
      githubRepo: c.github_repo,
      createdAt: new Date(c.created_at).getTime(),
      updatedAt: new Date(c.updated_at).getTime(),
      messages: m.map((row) => ({
        id: row.id,
        role: row.role as ChatRole,
        content: row.content,
        createdAt: new Date(row.created_at).getTime(),
      })),
    },
  });
}

/** DELETE /api/conversations/[id] — delete (cascade) the conversation. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

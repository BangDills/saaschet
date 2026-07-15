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
  is_pinned: boolean;
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
    .select("id, title, model_id, github_repo, is_pinned, created_at, updated_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (convErr) {
    console.error("[conversations] get failed:", convErr.message);
    return NextResponse.json(
      { error: "Failed to load conversation." },
      { status: 500 },
    );
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
    console.error("[conversations] messages get failed:", msgsErr.message);
    return NextResponse.json(
      { error: "Failed to load conversation." },
      { status: 500 },
    );
  }

  const c = conv as ConversationRow;
  const m = (msgs ?? []) as MessageRow[];

  return NextResponse.json({
    conversation: {
      id: c.id,
      title: c.title,
      modelId: c.model_id,
      githubRepo: c.github_repo,
      isPinned: c.is_pinned,
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

/** PATCH /api/conversations/[id] — rename or pin an owned conversation. */
export async function PATCH(
  req: NextRequest,
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

  let body: { title?: unknown; isPinned?: unknown };
  try {
    body = (await req.json()) as { title?: unknown; isPinned?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: { title?: string; is_pinned?: boolean } = {};
  if (body.title !== undefined) {
    if (typeof body.title !== "string") {
      return NextResponse.json({ error: "Title must be a string" }, { status: 400 });
    }
    const title = body.title.trim().replace(/\s+/g, " ");
    if (title.length < 1 || title.length > 100) {
      return NextResponse.json(
        { error: "Title must be between 1 and 100 characters" },
        { status: 400 },
      );
    }
    updates.title = title;
  }
  if (body.isPinned !== undefined) {
    if (typeof body.isPinned !== "boolean") {
      return NextResponse.json({ error: "isPinned must be a boolean" }, { status: 400 });
    }
    updates.is_pinned = body.isPinned;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No supported updates provided" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("conversations")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, title, model_id, github_repo, is_pinned, created_at, updated_at")
    .maybeSingle();

  if (error) {
    console.error("[conversations] patch failed:", error.message);
    return NextResponse.json(
      { error: "Failed to update conversation." },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const conversation = data as ConversationRow;
  return NextResponse.json({
    conversation: {
      id: conversation.id,
      title: conversation.title,
      modelId: conversation.model_id,
      githubRepo: conversation.github_repo,
      isPinned: conversation.is_pinned,
      messages: [],
      createdAt: new Date(conversation.created_at).getTime(),
      updatedAt: new Date(conversation.updated_at).getTime(),
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
    console.error("[conversations] delete failed:", error.message);
    return NextResponse.json(
      { error: "Failed to delete conversation." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

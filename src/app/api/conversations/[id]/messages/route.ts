import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/conversations/[id]/messages
 *
 * Phase 1: client saves the assistant message WITH its full UIMessage parts
 * (text + tool calls + tool results) after the stream finishes, so the
 * "Completed · N actions" timeline survives a page reload.
 *
 * Body: { role: "assistant", content: string, parts: unknown[] }
 * The conversation must be owned by the signed-in user.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: conversationId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify ownership.
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (convErr) {
    console.error("[messages] ownership check failed:", convErr.message);
    return NextResponse.json(
      { error: "Failed to verify conversation." },
      { status: 500 },
    );
  }
  if (!conv) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  let body: { role?: string; content?: string; parts?: unknown[]; clientId?: string; metadata?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.role !== "assistant") {
    return NextResponse.json(
      { error: "Only assistant messages are accepted in phase 1." },
      { status: 400 },
    );
  }
  const content = (body.content ?? "").toString();
  const parts = Array.isArray(body.parts) ? body.parts : null;
  // The client UIMessage id — used as the idempotency key together with the
  // conversation. A repeated request (retry/reconnect/reload) for the same
  // client message updates the existing row instead of inserting a new one.
  const clientId = body.clientId?.trim() || null;
  // Message metadata — currently holds { agentState: AgentCompletionState }
  // emitted by the orchestrator. Persisted so reload keeps context-aware
  // Quick Actions. Null is fine for legacy / messages without state.
  const metadata =
    body.metadata && typeof body.metadata === "object" ? body.metadata : null;

  console.log("[messages] POST", {
    conversationId,
    clientId,
    contentLen: content.length,
    partsLen: Array.isArray(parts) ? parts.length : null,
    hasMetadata: metadata != null,
  });

  // Upsert on (conversation_id, client_message_id) via the partial unique
  // index. DO UPDATE so a later retry with more complete parts still wins.
  // Supabase's upsert maps to INSERT ... ON CONFLICT; we tell it the conflict
  // target column explicitly.
  const { data, error } = await supabase
    .from("messages")
    .upsert(
      {
        conversation_id: conversationId,
        role: "assistant",
        content,
        parts,
        client_message_id: clientId,
        metadata,
      },
      { onConflict: "conversation_id,client_message_id", ignoreDuplicates: false },
    )
    .select("id")
    .single();

  if (error) {
    console.error("[messages] upsert failed:", error.message, error);
    return NextResponse.json(
      { error: "Failed to save message." },
      { status: 500 },
    );
  }

  console.log("[messages] upsert ok", { messageId: data?.id, conversationId });

  return NextResponse.json({ ok: true, messageId: data.id });
}

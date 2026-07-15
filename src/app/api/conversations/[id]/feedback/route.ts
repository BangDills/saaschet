import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FeedbackBody = {
  messageId?: string;
  rating?: "like" | "dislike";
  reason?: string | null;
};

async function getOwnedConversation(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" as const, status: 401, supabase };

  const { data: conversation, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[feedback] ownership check failed:", error.message);
    return { error: "Failed to load conversation." as const, status: 500, supabase };
  }
  if (!conversation) {
    return { error: "Conversation not found" as const, status: 404, supabase };
  }
  return { user, supabase };
}

async function resolveAssistantMessage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: string,
  messageId?: string,
) {
  let query = supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("role", "assistant");

  if (messageId && UUID_PATTERN.test(messageId)) {
    query = query.eq("id", messageId);
  } else {
    query = query.order("created_at", { ascending: false }).limit(1);
  }

  const { data, error } = await query.maybeSingle();
  return { messageId: data?.id as string | undefined, error };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownership = await getOwnedConversation(id);
  if ("error" in ownership) {
    return NextResponse.json(
      { error: ownership.error },
      { status: ownership.status },
    );
  }

  const { data, error } = await ownership.supabase
    .from("message_feedback")
    .select("message_id, rating, reason, messages!inner(conversation_id)")
    .eq("user_id", ownership.user.id)
    .eq("messages.conversation_id", id);

  if (error) {
    console.error("[feedback] list failed:", error.message);
    return NextResponse.json(
      { error: "Failed to load feedback." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    feedback: (data ?? []).map((row) => ({
      messageId: row.message_id as string,
      rating: row.rating as "like" | "dislike",
      reason: (row.reason as string | null) ?? null,
    })),
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownership = await getOwnedConversation(id);
  if ("error" in ownership) {
    return NextResponse.json(
      { error: ownership.error },
      { status: ownership.status },
    );
  }

  const body = (await request.json().catch(() => null)) as FeedbackBody | null;
  if (!body || (body.rating !== "like" && body.rating !== "dislike")) {
    return NextResponse.json({ error: "Invalid feedback rating" }, { status: 400 });
  }

  const reason = body.reason?.trim() || null;
  if (reason && reason.length > 500) {
    return NextResponse.json(
      { error: "Feedback reason must be 500 characters or fewer" },
      { status: 400 },
    );
  }

  const resolved = await resolveAssistantMessage(
    ownership.supabase,
    id,
    body.messageId,
  );
  if (resolved.error) {
    console.error("[feedback] resolve assistant message failed:", resolved.error.message);
    return NextResponse.json(
      { error: "Failed to locate assistant message." },
      { status: 500 },
    );
  }
  if (!resolved.messageId) {
    return NextResponse.json(
      { error: "Assistant message not found" },
      { status: 404 },
    );
  }

  const { error } = await ownership.supabase.from("message_feedback").upsert(
    {
      message_id: resolved.messageId,
      user_id: ownership.user.id,
      rating: body.rating,
      reason: body.rating === "dislike" ? reason : null,
    },
    { onConflict: "message_id,user_id" },
  );

  if (error) {
    console.error("[feedback] upsert failed:", error.message);
    return NextResponse.json(
      { error: "Failed to save feedback." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    feedback: {
      messageId: resolved.messageId,
      rating: body.rating,
      reason: body.rating === "dislike" ? reason : null,
    },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ownership = await getOwnedConversation(id);
  if ("error" in ownership) {
    return NextResponse.json(
      { error: ownership.error },
      { status: ownership.status },
    );
  }

  const body = (await request.json().catch(() => null)) as FeedbackBody | null;
  const resolved = await resolveAssistantMessage(
    ownership.supabase,
    id,
    body?.messageId,
  );
  if (resolved.error) {
    console.error("[feedback] resolve assistant message failed:", resolved.error.message);
    return NextResponse.json(
      { error: "Failed to locate assistant message." },
      { status: 500 },
    );
  }
  if (!resolved.messageId) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await ownership.supabase
    .from("message_feedback")
    .delete()
    .eq("message_id", resolved.messageId)
    .eq("user_id", ownership.user.id);

  if (error) {
    console.error("[feedback] delete failed:", error.message);
    return NextResponse.json(
      { error: "Failed to delete feedback." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, messageId: resolved.messageId });
}

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/conversations/[id]/status
 *
 * Lightweight endpoint for polling. Returns the conversation's processing
 * status and message count so the client can detect when the server finishes
 * generating a response.
 */
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

  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, status, updated_at")
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

  // Count messages for this conversation (client uses this to detect new ones)
  const { count, error: countErr } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", id);

  if (countErr) {
    return NextResponse.json({ error: countErr.message }, { status: 500 });
  }

  return NextResponse.json({
    status: conv.status ?? "idle",
    messageCount: count ?? 0,
    updatedAt: conv.updated_at,
  });
}

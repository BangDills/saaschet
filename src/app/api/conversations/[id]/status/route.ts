import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Maximum time a conversation can stay in "processing" before we consider
 * it stale (the serverless function timed out or crashed without cleanup).
 * Vercel max is 120s, so 3 minutes gives generous buffer.
 */
const STALE_THRESHOLD_MS = 3 * 60 * 1000;

/**
 * GET /api/conversations/[id]/status
 *
 * Lightweight endpoint for polling. Returns the conversation's processing
 * status and message count so the client can detect when the server finishes
 * generating a response.
 *
 * **Stale detection**: if a conversation has been "processing" for longer
 * than STALE_THRESHOLD_MS, we auto-reset it to "idle". This handles the
 * case where the Vercel function timed out or crashed without running
 * onFinish (which would normally set status back to idle).
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

  // ── Stale processing detection ─────────────────────────────────────
  // If the conversation has been "processing" for too long, the server
  // function likely timed out. Auto-reset to "idle" so the client stops
  // waiting forever.
  let status = conv.status ?? "idle";
  if (status === "processing") {
    const updatedAt = new Date(conv.updated_at).getTime();
    const elapsed = Date.now() - updatedAt;
    if (elapsed > STALE_THRESHOLD_MS) {
      // Auto-heal: reset to idle
      await supabase
        .from("conversations")
        .update({ status: "idle", updated_at: new Date().toISOString() })
        .eq("id", id);
      status = "idle";
      console.log(
        `[status] Auto-reset stale conversation ${id} (was processing for ${Math.round(elapsed / 1000)}s)`,
      );
    }
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
    status,
    messageCount: count ?? 0,
    updatedAt: conv.updated_at,
  });
}

import { NextResponse, type NextRequest } from "next/server";
import { createUIMessageStreamResponse } from "ai";
import { createClient } from "@/lib/supabase/server";
import {
  getResumableRun,
  getRunForConversation,
  subscribeToRun,
  abortRun,
} from "@/lib/chat/run-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Nothing to resume. 204 is what the AI SDK reads as "no active stream". */
function noContent() {
  return new Response(null, { status: 204 });
}

/**
 * GET /api/chat/[conversationId]/stream — reattach to an in-flight agent turn.
 *
 * This is the endpoint `useChat({ resume: true })` probes on mount (the AI SDK
 * derives the URL as `<api>/<chatId>/stream`). If a run for this conversation
 * is still going, we replay everything it has produced so far and then follow
 * it live, so reopening the tab mid-agent-run picks the timeline back up
 * exactly where it was.
 *
 * Every non-resumable case answers 204 rather than an error — including no
 * session, someone else's conversation, and a run whose replay buffer
 * overflowed. This endpoint is a probe fired on every chat mount, so a 4xx
 * would surface a spurious error banner on ordinary page loads; the client
 * instead falls back to polling conversation status and reloading from the
 * database, which is also what covers a server restart.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return noContent();

  const run = getResumableRun(conversationId, user.id);
  if (!run) return noContent();

  console.log("[chat/stream] resuming run", {
    conversationId,
    runId: run.runId,
    bufferedChunks: run.chunks.length,
  });

  return createUIMessageStreamResponse({
    stream: subscribeToRun(run),
    headers: {
      "X-Accel-Buffering": "no",
      "Cache-Control": "no-cache, no-transform",
      "X-Conversation-Id": conversationId,
    },
  });
}

/**
 * DELETE /api/chat/[conversationId]/stream — stop an in-flight agent turn.
 *
 * The client's own `stop()` only aborts its fetch, which no longer stops the
 * work now that runs are detached. This is the explicit kill switch. The run
 * still persists whatever it produced before the abort, so a stopped turn
 * keeps its partial timeline.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const run = getRunForConversation(conversationId, user.id);
  if (!run) return NextResponse.json({ stopped: false });

  abortRun(run, "stopped by user");
  return NextResponse.json({ stopped: true });
}

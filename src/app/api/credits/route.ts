import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCreditSnapshot } from "@/lib/credits/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/credits
 *
 * Returns the signed-in user's current credit snapshot — daily limit,
 * used today, when it resets. Used by the sidebar credit meter, polled
 * after every assistant turn.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = await getCreditSnapshot(user.id);
  return NextResponse.json({ credits: snapshot });
}

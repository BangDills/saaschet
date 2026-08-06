import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/payments/status?id=<paymentId>
 *
 * Returns the caller's payment status. Lazily expires a stale open payment
 * (past expires_at) on read so the UI doesn't need a cron to flip states.
 * Only the owner can read it (defense in depth on top of RLS).
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("payments")
    .select("id, user_id, reference, amount_total, status, expires_at, proof_path")
    .eq("id", id)
    .maybeSingle();

  if (!row || row.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let status = row.status as string;
  if (
    (status === "pending" || status === "awaiting_confirmation") &&
    new Date(row.expires_at as string).getTime() <= Date.now()
  ) {
    await admin.from("payments").update({ status: "expired" }).eq("id", id);
    status = "expired";
  }

  return NextResponse.json({
    payment: {
      id: row.id,
      reference: row.reference,
      amount_total: row.amount_total,
      status,
      expires_at: row.expires_at,
      proof_path: row.proof_path,
    },
  });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/payments/mark-received  { paymentId, proofPath }
 *
 * The user asserts they have paid and attaches an uploaded proof path. Moves
 * the payment pending -> awaiting_confirmation via the `mark_payment_received`
 * RPC, which is owner-gated in SQL and can NEVER set status = 'paid'. Only an
 * admin (or a future verified gateway webhook) can mark a payment paid.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { paymentId?: string; proofPath?: string };
  try {
    body = (await req.json()) as { paymentId?: string; proofPath?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.paymentId || !body.proofPath) {
    return NextResponse.json(
      { error: "paymentId and proofPath are required" },
      { status: 400 },
    );
  }

  // The proof must live under the caller's own storage folder — a user must
  // not be able to point at someone else's screenshot.
  if (!body.proofPath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Invalid proof path" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("mark_payment_received", {
    p_payment_id: body.paymentId,
    p_proof_path: body.proofPath,
  });

  if (error) {
    console.error("[payments/mark-received]", error.message);
    return NextResponse.json(
      { error: "Gagal menandai pembayaran." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, status: data });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildDynamicQris, generateReference, pickUniqueCode } from "@/lib/payments/qris-dynamic";
import { proPriceIdr, paymentExpiryMinutes, staticQrisString } from "@/lib/payments/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/payments/create
 *
 * Opens a Pro checkout: picks a unique amount suffix (so the merchant can tell
 * payments apart from their mutation feed), builds the dynamic QRIS payload,
 * and stores a `pending` payment row. Idempotent — if the user already has an
 * OPEN payment it is returned instead of creating a second one (enforced at
 * the DB level by the payments_one_open_per_user partial unique index).
 *
 * The client NEVER sends an amount. The price lives entirely on the server.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Return an existing open payment if there is one (idempotent re-entry).
  const { data: existing } = await admin
    .from("payments")
    .select(
      "id, reference, amount_total, status, expires_at, qris_payload, proof_path",
    )
    .eq("user_id", user.id)
    .in("status", ["pending", "awaiting_confirmation"])
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ payment: existing, reused: true });
  }

  const amountBase = proPriceIdr();

  // Unique-amount pool: codes already held by OTHER open payments.
  const { data: openRows } = await admin
    .from("payments")
    .select("unique_code")
    .in("status", ["pending", "awaiting_confirmation"])
    .gt("expires_at", new Date().toISOString());
  const taken = (openRows ?? []).map((r) => r.unique_code as number);

  const uniqueCode = pickUniqueCode(taken);
  if (uniqueCode === null) {
    return NextResponse.json(
      { error: "Sistem pembayaran sedang penuh. Coba lagi sebentar lagi." },
      { status: 503 },
    );
  }

  const amountTotal = amountBase + uniqueCode;
  const reference = generateReference();
  const expiresAt = new Date(
    Date.now() + paymentExpiryMinutes() * 60_000,
  ).toISOString();

  let qrisPayload: string;
  try {
    qrisPayload = buildDynamicQris(staticQrisString(), amountTotal, reference);
  } catch (err) {
    // Misconfigured merchant string — fail loudly, don't store a broken row.
    console.error(
      "[payments/create] QRIS build failed:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Pembayaran belum dikonfigurasi. Hubungi admin." },
      { status: 503 },
    );
  }

  const { data: inserted, error } = await admin
    .from("payments")
    .insert({
      user_id: user.id,
      plan: "pro",
      method: "qris_static",
      amount_base: amountBase,
      unique_code: uniqueCode,
      amount_total: amountTotal,
      reference,
      status: "pending",
      expires_at: expiresAt,
      qris_payload: qrisPayload,
    })
    .select("id, reference, amount_total, status, expires_at, qris_payload, proof_path")
    .single();

  if (error) {
    // Unique-open violation = a race with another tab; refetch and return it.
    if (error.code === "23505") {
      const { data: won } = await admin
        .from("payments")
        .select(
          "id, reference, amount_total, status, expires_at, qris_payload, proof_path",
        )
        .eq("user_id", user.id)
        .in("status", ["pending", "awaiting_confirmation"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (won) return NextResponse.json({ payment: won, reused: true });
    }
    console.error("[payments/create] insert failed:", error.message);
    return NextResponse.json({ error: "Gagal membuat pembayaran." }, { status: 500 });
  }

  return NextResponse.json({ payment: inserted, reused: false });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TIER_LIMITS } from "@/lib/credits/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin gate: caller must be authed AND profiles.role === 'admin'. Returns the
 * admin service client on success, or a NextResponse error to return.
 */
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return {
      error: NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 }),
    };
  }
  return { admin: createAdminClient(), actorId: user.id };
}

/**
 * GET /api/admin/payments
 *
 * Lists payments needing attention (awaiting_confirmation first, then recent
 * pending/paid/rejected). Admin only.
 */
export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;

  const { data, error } = await gate.admin
    .from("payments")
    .select(
      "id, user_id, reference, amount_total, unique_code, status, proof_path, created_at, expires_at, paid_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[admin/payments] list failed:", error.message);
    return NextResponse.json({ error: "Gagal memuat pembayaran." }, { status: 500 });
  }

  // Attach the payer's email so the admin knows who to credit, and a signed
  // URL for each proof screenshot (bucket is private).
  const userIds = [...new Set((data ?? []).map((p) => p.user_id as string))];
  const emailById = new Map<string, string>();
  await Promise.all(
    userIds.map(async (uid) => {
      const { data: u } = await gate.admin.auth.admin.getUserById(uid);
      if (u?.user?.email) emailById.set(uid, u.user.email);
    }),
  );

  const payments = await Promise.all(
    (data ?? []).map(async (p) => {
      let proofUrl: string | null = null;
      if (p.proof_path) {
        const { data: signed } = await gate.admin.storage
          .from("payment-proofs")
          .createSignedUrl(p.proof_path as string, 300);
        proofUrl = signed?.signedUrl ?? null;
      }
      return {
        ...p,
        email: emailById.get(p.user_id as string) ?? null,
        proofUrl,
      };
    }),
  );

  return NextResponse.json({ payments });
}

/**
 * POST /api/admin/payments  { paymentId, action: "approve" | "reject" }
 *
 * The ONLY place a payment becomes 'paid'. Approving also activates the Pro
 * 24h tier for the payer (same write updateUserTierAction performs). Admin
 * only; the service-role client bypasses RLS, which is exactly why this route
 * is gated above.
 */
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;

  let body: { paymentId?: string; action?: string };
  try {
    body = (await req.json()) as { paymentId?: string; action?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { paymentId, action } = body;
  if (!paymentId || (action !== "approve" && action !== "reject")) {
    return NextResponse.json(
      { error: "paymentId and action ('approve'|'reject') are required" },
      { status: 400 },
    );
  }

  const { data: payment } = await gate.admin
    .from("payments")
    .select("id, user_id, status, amount_total, reference")
    .eq("id", paymentId)
    .maybeSingle();

  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }
  if (payment.status === "paid") {
    return NextResponse.json({ ok: true, status: "paid", already: true });
  }
  if (payment.status !== "awaiting_confirmation" && payment.status !== "pending") {
    return NextResponse.json(
      { error: `Tidak bisa ${action} pembayaran berstatus ${payment.status}.` },
      { status: 409 },
    );
  }

  if (action === "reject") {
    const { error } = await gate.admin
      .from("payments")
      .update({ status: "rejected" })
      .eq("id", paymentId);
    if (error) {
      console.error("[admin/payments] reject failed:", error.message);
      return NextResponse.json({ error: "Gagal menolak pembayaran." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // approve → mark paid, then activate the Pro 24h window for the payer.
  const { error: payErr } = await gate.admin
    .from("payments")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", paymentId);
  if (payErr) {
    console.error("[admin/payments] approve failed:", payErr.message);
    return NextResponse.json({ error: "Gagal menandai lunas." }, { status: 500 });
  }

  const tierExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error: tierErr } = await gate.admin
    .from("user_credits")
    .update({
      tier: "pro",
      daily_limit: TIER_LIMITS.pro,
      tier_expires_at: tierExpiresAt,
    })
    .eq("user_id", payment.user_id);

  if (tierErr) {
    // Payment is paid but tier didn't flip — loud, so the admin fixes by hand.
    console.error(
      `[admin/payments] paid ${payment.reference} but tier activation failed:`,
      tierErr.message,
    );
    return NextResponse.json(
      {
        ok: true,
        status: "paid",
        warning: "Pembayaran lunas, tapi aktivasi Pro gagal — set tier manual di /users.",
      },
      { status: 200 },
    );
  }

  return NextResponse.json({ ok: true, status: "paid", tierExpiresAt });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB screenshots are plenty.
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * POST /api/payments/proof  (multipart/form-data: file, paymentId)
 *
 * Uploads a payment-proof screenshot into the private `payment-proofs` bucket
 * under the caller's own folder (<user_id>/<payment_id>-<name>). Uses the
 * caller's session client so the storage RLS policy (own-folder-only) is the
 * enforcement — the server adds type/size validation on top.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = form.get("file");
  const paymentId = form.get("paymentId");
  if (!(file instanceof File) || typeof paymentId !== "string" || !paymentId) {
    return NextResponse.json(
      { error: "file and paymentId are required" },
      { status: 400 },
    );
  }

  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: "Bukti harus berupa gambar (PNG/JPG/WebP)." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Ukuran bukti maksimal 5 MB." },
      { status: 400 },
    );
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
  const path = `${user.id}/${paymentId}-${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from("payment-proofs")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    console.error("[payments/proof] upload failed:", error.message);
    return NextResponse.json({ error: "Gagal mengunggah bukti." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, path });
}

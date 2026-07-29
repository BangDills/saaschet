import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("profile");

const MIN_PASSWORD_LENGTH = 8;

/**
 * Verify a password without touching the caller's session.
 *
 * `supabase.auth.signInWithPassword` on the request-scoped client would issue
 * a fresh session and rewrite the auth cookies, so the check runs on a
 * throwaway client that persists nothing.
 */
async function passwordIsCorrect(email: string, password: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;

  const throwaway = createSupabaseClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await throwaway.auth.signInWithPassword({ email, password });
  return !error;
}

/**
 * PATCH /api/profile
 *
 * Update the signed-in user's display name and/or password.
 * Body: { full_name?: string, current_password?: string, password?: string }
 *
 * A password change requires `current_password` and it is VERIFIED here.
 * Without that check a hijacked session — or anyone at an unlocked machine —
 * could lock the real owner out of their account.
 */
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  let body: { full_name?: string; current_password?: string; password?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body JSON tidak valid." }, { status: 400 });
  }

  // ── Display name ────────────────────────────────────────────────────────
  if (typeof body.full_name === "string") {
    const name = body.full_name.trim();
    if (name.length < 1 || name.length > 60) {
      return NextResponse.json(
        { error: "Nama harus 1–60 karakter." },
        { status: 400 },
      );
    }
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: name })
      .eq("id", user.id);

    if (error) {
      log.error("update name failed", { userId: user.id, err: error.message });
      return NextResponse.json({ error: "Gagal menyimpan nama." }, { status: 500 });
    }
  }

  // ── Password ────────────────────────────────────────────────────────────
  if (typeof body.password === "string") {
    // OAuth-only accounts have no password to replace; Supabase would happily
    // set one, which silently creates a second way into the account.
    const hasEmailIdentity = (user.identities ?? []).some(
      (identity) => identity.provider === "email",
    );
    if (!hasEmailIdentity) {
      return NextResponse.json(
        {
          error:
            "Akun ini masuk lewat penyedia eksternal, jadi passwordnya diatur di sana.",
        },
        { status: 400 },
      );
    }

    if (body.password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password baru minimal ${MIN_PASSWORD_LENGTH} karakter.` },
        { status: 400 },
      );
    }

    if (!user.email || typeof body.current_password !== "string" || !body.current_password) {
      return NextResponse.json(
        { error: "Password lama wajib diisi." },
        { status: 400 },
      );
    }

    if (body.current_password === body.password) {
      return NextResponse.json(
        { error: "Password baru harus berbeda dari password lama." },
        { status: 400 },
      );
    }

    if (!(await passwordIsCorrect(user.email, body.current_password))) {
      log.warn("password change rejected — wrong current password", {
        userId: user.id,
      });
      return NextResponse.json({ error: "Password lama salah." }, { status: 403 });
    }

    const { error } = await supabase.auth.updateUser({ password: body.password });
    if (error) {
      log.error("update password failed", { userId: user.id, err: error.message });
      return NextResponse.json({ error: "Gagal mengganti password." }, { status: 500 });
    }
    log.info("password changed", { userId: user.id });
  }

  return NextResponse.json({ ok: true });
}

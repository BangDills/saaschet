import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/profile
 *
 * Update the signed-in user's profile (full_name) and/or password.
 * Body: { full_name?: string, password?: string }
 */
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { full_name?: string; password?: string };
  try {
    body = (await req.json()) as { full_name?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Update display name in profiles table.
  if (typeof body.full_name === "string") {
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: body.full_name.trim() })
      .eq("id", user.id);

    if (error) {
      console.error("[profile] update name failed:", error.message);
      return NextResponse.json(
        { error: "Failed to update name." },
        { status: 500 },
      );
    }
  }

  // Update password via Supabase Auth.
  if (typeof body.password === "string") {
    if (body.password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 },
      );
    }
    const { error } = await supabase.auth.updateUser({
      password: body.password,
    });
    if (error) {
      console.error("[profile] update password failed:", error.message);
      return NextResponse.json(
        { error: "Failed to update password." },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}

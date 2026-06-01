import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OAuth + email-link callback handler.
 *
 * Supabase redirects users here after they click the email confirmation
 * link or finish an OAuth flow. We exchange the `code` query param for a
 * session cookie, then bounce them to /ai-chat (or `next` if provided).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/ai-chat";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Failure → bounce back to login with a message.
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}

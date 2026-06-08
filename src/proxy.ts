import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match request paths except for static/image/favicon/public asset files.
     * API routes are intentionally included so Supabase SSR can refresh
     * session cookies consistently for route handlers too.
     *
     * Feel free to relax further if you need.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

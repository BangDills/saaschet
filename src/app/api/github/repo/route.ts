import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchRepoBundle, parseRepoSlug } from "@/lib/github/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/github/repo?slug=owner/name
 *
 * Returns a preview of the repo (info, README, manifest, top-level files).
 * Uses the caller's GitHub OAuth token from `profiles.github_token` when
 * available for the higher rate limit; otherwise falls back to anonymous
 * GitHub API (60 req/h shared per IP).
 *
 * Auth required.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const slug = req.nextUrl.searchParams.get("slug")?.trim();
  if (!slug) {
    return NextResponse.json(
      { error: "Missing ?slug=owner/name" },
      { status: 400 },
    );
  }

  const parsed = parseRepoSlug(slug);
  if (!parsed) {
    return NextResponse.json(
      { error: "Invalid repository reference. Use owner/name." },
      { status: 400 },
    );
  }

  // Look up the user's stored GitHub token (optional).
  const { data: profile } = await supabase
    .from("profiles")
    .select("github_token")
    .eq("id", user.id)
    .maybeSingle();

  const token: string | undefined = profile?.github_token ?? undefined;

  try {
    const bundle = await fetchRepoBundle(parsed.owner, parsed.name, token);
    return NextResponse.json({
      slug: bundle.info.fullName,
      info: bundle.info,
      // We deliberately don't return the full README to the client to keep
      // payloads small — the chat endpoint refetches and injects server-side.
      hasReadme: !!bundle.readme,
      hasManifest: !!bundle.manifest,
      fileCount: bundle.files.length,
    });
  } catch (err) {
    console.error(
      `[github/repo] fetch ${parsed.owner}/${parsed.name} failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { error: `Failed to fetch ${parsed.owner}/${parsed.name}.` },
      { status: 502 },
    );
  }
}

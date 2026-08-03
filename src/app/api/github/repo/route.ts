import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchRepoBundle, parseRepoSlug } from "@/lib/github/client";
import { resolveGitHubAuth } from "@/lib/github/app-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/github/repo?slug=owner/name
 *
 * Returns a preview of the repo (info, README, manifest, top-level files).
 * Authenticates as the caller's GitHub App installation when that installation
 * owns the repo (5000 req/h); any other slug — someone else's public repo —
 * uses the anonymous GitHub API (60 req/h shared per IP).
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

  // Authenticate as the user's App installation when it actually covers this
  // repo. An installation token is scoped to one account and answers 404 for
  // anything outside it — including public repos — so an arbitrary pasted slug
  // must stay on the anonymous path rather than being handed a token that will
  // pretend the repo doesn't exist.
  const ghAuth = await resolveGitHubAuth(user.id, `${parsed.owner}/${parsed.name}`);
  const token: string | undefined =
    ghAuth.accountLogin?.toLowerCase() === parsed.owner.toLowerCase()
      ? (ghAuth.token ?? undefined)
      : undefined;

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

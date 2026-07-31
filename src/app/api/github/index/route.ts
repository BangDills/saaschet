import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveGitHubAuth } from "@/lib/github/app-client";
import { indexRepo } from "@/lib/indexing/index-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Indexing a mid-size repo takes tens of seconds (parallel fetches + batch
// embeds); allow the same 5-minute ceiling as chat turns.
export const maxDuration = 300;

/**
 * POST /api/github/index — index (or re-index) a connected repo.
 * Body: { repo: "owner/repo" }
 *
 * GET /api/github/index?repo=… — index status for the repo picker/composer.
 *
 * DELETE /api/github/index?repo=… — drop the index (chunks cascade).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { repo?: string };
  try {
    body = (await request.json()) as { repo?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const repo = body.repo?.trim();
  if (!repo || !repo.includes("/")) {
    return NextResponse.json(
      { error: "repo must be in 'owner/name' form" },
      { status: 400 },
    );
  }

  // Repo access requires a GitHub App installation — there is no token-less
  // indexing of private content, and public-only tokens rate-limit fast.
  const ghAuth = await resolveGitHubAuth(user.id, repo);
  if (!ghAuth.token) {
    return NextResponse.json(
      { error: "Connect the GitHub App first to index this repo." },
      { status: 403 },
    );
  }

  // Reject concurrent runs for the same (user, repo).
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("repo_indexes")
    .select("status")
    .eq("user_id", user.id)
    .eq("repo_full_name", repo)
    .maybeSingle();

  if (existing?.status === "indexing") {
    return NextResponse.json(
      { error: "An indexing run is already in progress for this repo." },
      { status: 409 },
    );
  }

  try {
    const result = await indexRepo({
      userId: user.id,
      repoFullName: repo,
      token: ghAuth.token,
    });

    return NextResponse.json({
      status: "ready",
      fileCount: result.fileCount,
      chunkCount: result.chunkCount,
      headSha: result.headSha,
      incremental: result.incremental,
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        error: err instanceof Error ? err.message : "Indexing failed",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const repo = new URL(request.url).searchParams.get("repo")?.trim();
  if (!repo) {
    return NextResponse.json({ error: "repo is required" }, { status: 400 });
  }

  const { data } = await supabase
    .from("repo_indexes")
    .select("status, file_count, chunk_count, head_sha, error_message, updated_at")
    .eq("user_id", user.id)
    .eq("repo_full_name", repo)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ status: "none" });
  }

  return NextResponse.json({
    status: data.status,
    fileCount: data.file_count,
    chunkCount: data.chunk_count,
    headSha: data.head_sha,
    error: data.error_message,
    updatedAt: data.updated_at,
  });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const repo = new URL(request.url).searchParams.get("repo")?.trim();
  if (!repo) {
    return NextResponse.json({ error: "repo is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("repo_indexes")
    .delete()
    .eq("user_id", user.id)
    .eq("repo_full_name", repo);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "deleted" });
}

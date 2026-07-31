import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/github/webhook
 *
 * Receives GitHub App lifecycle events so our DB never points at dead
 * installations:
 *
 *   - installation.deleted                  → remove the row (cascades repos)
 *   - installation.new_permissions_accepted → refresh the permissions jsonb
 *   - installation_repositories.*           → re-sync the visible repo list
 *
 * Every delivery is verified against X-Hub-Signature-256 with
 * GITHUB_APP_WEBHOOK_SECRET — unverified payloads are rejected before any
 * processing, so nobody can forge "user uninstalled" events.
 */

function verifySignature(secret: string, body: string, header: string | null): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "GITHUB_APP_WEBHOOK_SECRET not configured" },
      { status: 500 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifySignature(secret, rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = request.headers.get("x-github-event");

  // GitHub sends a `ping` when the webhook is first saved — answer 200 so
  // the App settings page shows a green check.
  if (event === "ping") {
    return NextResponse.json({ ok: true, event: "ping" });
  }

  let payload: {
    action?: string;
    installation?: {
      id?: number;
      account?: { login?: string; type?: string };
      permissions?: Record<string, string>;
      repository_selection?: string;
    };
    repositories_added?: Array<{ id: number; full_name: string; private: boolean }>;
    repositories_removed?: Array<{ id: number; full_name: string; private: boolean }>;
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const installationId = payload.installation?.id;
  if (!installationId) {
    return NextResponse.json({ ok: true, ignored: "no installation id" });
  }

  const admin = createAdminClient();

  if (event === "installation" && payload.action === "deleted") {
    // User uninstalled the App on GitHub's side. Deleting the row cascades
    // to github_installation_repos. Cached tokens die within the hour on
    // their own; the next mint attempt will 404 and be treated as
    // disconnected by app-client.
    await admin
      .from("github_installations")
      .delete()
      .eq("installation_id", installationId);
    return NextResponse.json({ ok: true, handled: "installation.deleted" });
  }

  if (event === "installation" && payload.action === "new_permissions_accepted") {
    await admin
      .from("github_installations")
      .update({ permissions: payload.installation?.permissions ?? {} })
      .eq("installation_id", installationId);
    return NextResponse.json({
      ok: true,
      handled: "installation.new_permissions_accepted",
    });
  }

  if (event === "installation_repositories") {
    // Apply the delta instead of a full refetch — the payload already tells
    // us exactly what changed.
    const { data: row } = await admin
      .from("github_installations")
      .select("id")
      .eq("installation_id", installationId)
      .maybeSingle();

    if (!row) {
      return NextResponse.json({ ok: true, ignored: "unknown installation" });
    }

    const removed = payload.repositories_removed ?? [];
    if (removed.length > 0) {
      await admin
        .from("github_installation_repos")
        .delete()
        .eq("installation_id", row.id)
        .in(
          "repo_id",
          removed.map((r) => r.id),
        );
    }

    const added = payload.repositories_added ?? [];
    if (added.length > 0) {
      await admin.from("github_installation_repos").upsert(
        added.map((r) => ({
          installation_id: row.id,
          repo_id: r.id,
          full_name: r.full_name,
          is_private: r.private,
        })),
        { onConflict: "installation_id,repo_id" },
      );
    }

    return NextResponse.json({
      ok: true,
      handled: `installation_repositories.${payload.action}`,
    });
  }

  // Other events aren't subscribed to in the App settings; acknowledge and
  // move on so GitHub doesn't mark deliveries as failed.
  return NextResponse.json({ ok: true, ignored: event });
}

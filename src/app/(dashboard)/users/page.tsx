import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { UsersTable, type RealUserRow } from "@/components/dashboard/users-table";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Admin-only page.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") redirect("/ai-chat");

  // Use the admin client to list auth.users (requires service_role key).
  const admin = createAdminClient();
  const {
    data: { users: authUsers },
  } = await admin.auth.admin.listUsers({ perPage: 100 });

  // Also fetch profiles to get extra metadata (full_name, github_username).
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, avatar_url, github_username, created_at");

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p]),
  );

  // Also fetch credits info for each user.
  const { data: credits } = await admin
    .from("user_credits")
    .select("user_id, tier, used_today, daily_limit, total_used");

  const creditMap = new Map(
    (credits ?? []).map((c) => [c.user_id, c]),
  );

  const rows: RealUserRow[] = (authUsers ?? []).map((u) => {
    const profile = profileMap.get(u.id);
    const credit = creditMap.get(u.id);
    return {
      id: u.id,
      email: u.email ?? "",
      fullName: profile?.full_name ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      githubUsername: profile?.github_username ?? null,
      provider: u.app_metadata?.provider ?? "email",
      tier: (credit?.tier as "free" | "pro") ?? "free",
      totalUsed: Number(credit?.total_used ?? 0),
      createdAt: u.created_at,
      lastSignIn: u.last_sign_in_at ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Users</h2>
        <p className="text-sm text-muted-foreground">
          All {rows.length} user{rows.length === 1 ? "" : "s"} registered on
          your platform.
        </p>
      </div>
      <UsersTable users={rows} />
    </div>
  );
}

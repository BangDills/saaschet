import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCreditSnapshot } from "@/lib/credits/server";
import { ProfileSettings } from "@/components/dashboard/profile-settings";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const credits = await getCreditSnapshot(user.id);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, github_username, avatar_url, created_at")
    .eq("id", user.id)
    .maybeSingle();

  // Supabase records the sign-up method on the identity list; `email` is the
  // only provider that owns a password this page can change.
  const provider =
    user.identities?.[0]?.provider ??
    (user.app_metadata?.provider as string | undefined) ??
    "email";

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("id-ID", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl space-y-6 py-2">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Profil</h2>
        <p className="text-sm text-muted-foreground">
          Kelola identitas, password, dan langganan akun Anda.
        </p>
      </div>

      <ProfileSettings
        email={user.email ?? ""}
        fullName={profile?.full_name ?? ""}
        avatarUrl={profile?.avatar_url ?? null}
        githubUsername={profile?.github_username ?? null}
        provider={provider}
        memberSince={memberSince}
        tier={credits.tier}
        usedToday={credits.usedToday}
        dailyLimit={credits.dailyLimit}
      />
    </div>
  );
}

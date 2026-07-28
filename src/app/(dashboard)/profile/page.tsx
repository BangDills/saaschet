import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCreditSnapshot } from "@/lib/credits/server";
import { ProfileTierSwitcher } from "@/components/dashboard/profile-tier-switcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getInitials } from "@/lib/utils";

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

  const displayName =
    profile?.full_name?.trim() || user.email?.split("@")[0] || "Member";
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("id-ID", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Profil</h2>
        <p className="text-sm text-muted-foreground">
          Akun, paket, dan pemakaian Anda dalam satu tempat.
        </p>
      </div>

      {/* Account card */}
      <Card>
        <CardHeader>
          <CardTitle>Akun</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt=""
                className="h-14 w-14 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-lg font-semibold text-secondary-foreground">
                {getInitials(displayName)}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-semibold">{displayName}</p>
              <p className="truncate text-sm text-muted-foreground">
                {user.email}
              </p>
              {profile?.github_username && (
                <p className="text-xs text-muted-foreground">
                  GitHub:{" "}
                  <span className="font-mono">@{profile.github_username}</span>
                </p>
              )}
              {memberSince && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Bergabung sejak {memberSince}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plan + tier switcher */}
      <ProfileTierSwitcher
        initialTier={credits.tier}
        usedToday={credits.usedToday}
      />
    </div>
  );
}

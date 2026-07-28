import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthSettings } from "@/components/dashboard/auth-settings";

export const dynamic = "force-dynamic";

export default async function AuthSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, github_username")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Pengaturan Autentikasi
        </h2>
        <p className="text-sm text-muted-foreground">
          Kelola keamanan akun dan layanan yang terhubung.
        </p>
      </div>
      <AuthSettings
        email={user.email ?? ""}
        fullName={profile?.full_name ?? ""}
        githubUsername={profile?.github_username ?? null}
        provider={user.app_metadata?.provider ?? "email"}
        lastSignIn={user.last_sign_in_at ?? null}
        createdAt={user.created_at}
      />
    </div>
  );
}

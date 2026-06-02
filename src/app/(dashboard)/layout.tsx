import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Pull a friendly display name from the profile if available, fall back
  // to the email's local-part. The profiles row is auto-created by a
  // trigger on auth.users insert (see supabase/migrations).
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, role")
    .eq("id", user.id)
    .maybeSingle();

  const role: UserRole = (profile?.role as UserRole) ?? "user";

  const displayName =
    profile?.full_name?.trim() || user.email?.split("@")[0] || "Member";
  const initials = displayName
    .split(/\s+/)
    .map((p: string) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        displayName={displayName}
        initials={initials}
        email={user.email ?? ""}
        avatarUrl={profile?.avatar_url ?? null}
        role={role}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar initials={initials} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

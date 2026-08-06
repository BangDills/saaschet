import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminPayments } from "@/components/dashboard/admin-payments";

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") redirect("/subscription");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Pembayaran</h2>
        <p className="text-sm text-muted-foreground">
          Verifikasi bukti QRIS, lalu setujui untuk mengaktifkan Pro 24 jam.
        </p>
      </div>
      <AdminPayments />
    </div>
  );
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCreditSnapshot } from "@/lib/credits/server";
import { ProCheckout } from "@/components/dashboard/pro-checkout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProCheckoutPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const credits = await getCreditSnapshot(user.id);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Aktifkan Pro</h2>
        <p className="text-sm text-muted-foreground">
          Bayar sekali, Pro aktif 24 jam — 3.000 kredit, agent mode penuh.
        </p>
      </div>

      {credits.tier === "pro" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle2 className="size-5 text-emerald-500" />
              Pro sudah aktif
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Kamu sedang dalam masa Pro. Limit harianmu {credits.dailyLimit}{" "}
            kredit. Tidak perlu membayar lagi sekarang.
          </CardContent>
        </Card>
      ) : (
        <ProCheckout />
      )}
    </div>
  );
}

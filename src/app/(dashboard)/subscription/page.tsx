import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCreditSnapshot } from "@/lib/credits/server";
import { SubscriptionPlans } from "@/components/dashboard/subscription-plans";

export const dynamic = "force-dynamic";

export default async function SubscriptionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const credits = await getCreditSnapshot(user.id);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Subscription</h2>
        <p className="text-sm text-muted-foreground">
          Choose a plan that fits your usage. Upgrade or downgrade at any time.
        </p>
      </div>
      <SubscriptionPlans
        currentTier={credits.tier}
        usedToday={credits.usedToday}
        dailyLimit={credits.dailyLimit}
        remaining={credits.remaining}
        resetsAt={credits.resetsAt}
        totalUsed={credits.totalUsed}
      />
    </div>
  );
}

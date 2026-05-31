import * as React from "react";
import { TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string;
  icon: React.ReactNode;
  delta?: number;
  action?: React.ReactNode;
};

export function StatCard({ label, value, icon, delta, action }: StatCardProps) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-foreground">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="truncate text-2xl font-bold tracking-tight">{value}</p>
        {typeof delta === "number" && (
          <p
            className={cn(
              "mt-0.5 flex items-center gap-1 text-xs font-medium",
              delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500",
            )}
          >
            <TrendingUp className="size-3" />
            {delta >= 0 ? "+" : ""}
            {delta}% from last month
          </p>
        )}
      </div>
      {action}
    </Card>
  );
}

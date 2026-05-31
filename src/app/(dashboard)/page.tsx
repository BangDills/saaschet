import { BarChart3, Users, Wallet, DollarSign } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard/stat-card";
import { CreditUsageAreaChart } from "@/components/dashboard/area-chart";
import { CreditUsageBarChart } from "@/components/dashboard/bar-chart";
import { UsersTable } from "@/components/dashboard/users-table";
import { stats } from "@/lib/data";
import { formatNumber } from "@/lib/utils";

export default function MainDashboardPage() {
  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Credits Used"
          value={formatNumber(stats.totalCreditsUsed)}
          delta={stats.totalCreditsUsedDelta}
          icon={<BarChart3 className="size-6" />}
        />
        <StatCard
          label="Total Users"
          value={formatNumber(stats.totalUsers)}
          delta={stats.totalUsersDelta}
          icon={<Users className="size-6" />}
        />
        <StatCard
          label="Credits Available"
          value={formatNumber(stats.creditsAvailable)}
          icon={<Wallet className="size-6" />}
        />
        <StatCard
          label="Current Plan"
          value={stats.currentPlan}
          icon={<DollarSign className="size-6" />}
          action={
            <Button variant="outline" size="sm">
              Manage
            </Button>
          }
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted">
                <BarChart3 className="size-5" />
              </div>
              <div>
                <CardTitle className="text-2xl">
                  {formatNumber(149758)}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Credits usage in the last year
                </p>
              </div>
            </div>
            <select
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue="30"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </CardHeader>
          <CardContent>
            <CreditUsageAreaChart />
            <div className="mt-4 flex items-center justify-center gap-6 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className="inline-block size-2.5 rounded-sm bg-chart-2" />
                Mobile
              </span>
              <span className="flex items-center gap-2">
                <span className="inline-block size-2.5 rounded-sm bg-chart-1" />
                Desktop
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Credit usage</CardTitle>
            <p className="text-sm text-muted-foreground">January - June 2024</p>
          </CardHeader>
          <CardContent>
            <CreditUsageBarChart />
            <div className="mt-4 space-y-1">
              <p className="flex items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                +20.4% from last month ↗
              </p>
              <p className="text-xs text-muted-foreground">
                Showing credits usage for the last 6 months
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Users table */}
      <UsersTable />
    </div>
  );
}

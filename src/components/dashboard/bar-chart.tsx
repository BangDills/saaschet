"use client";

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { creditUsageMonthly } from "@/lib/data";

type TooltipPayloadItem = { value?: number | string; color?: string };

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      {payload.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="inline-block size-2 rounded-full"
            style={{ background: item.color }}
          />
          <span className="ml-auto font-medium text-foreground">
            {Number(item.value).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CreditUsageBarChart() {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart
        data={creditUsageMonthly}
        margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
        barGap={4}
      >
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
        />
        <Tooltip
          content={<ChartTooltip />}
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
        />
        <Bar dataKey="current" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
        <Bar dataKey="previous" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

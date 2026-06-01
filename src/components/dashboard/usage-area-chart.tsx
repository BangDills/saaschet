"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";

export type DailyPoint = { date: string; chat: number; agent: number };

type TooltipPayloadItem = {
  name?: string;
  value?: number | string;
  color?: string;
};

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
      {payload.map((item) => (
        <div key={item.name} className="flex items-center gap-2">
          <span
            className="inline-block size-2 rounded-full"
            style={{ background: item.color }}
          />
          <span className="capitalize text-muted-foreground">{item.name}</span>
          <span className="ml-auto font-medium text-foreground">
            {Number(item.value).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Pretty-print "2026-06-01" → "Jun 1". */
function formatDate(dateIso: string): string {
  const d = new Date(dateIso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function UsageAreaChart({ data }: { data: DailyPoint[] }) {
  const formatted = data.map((d) => ({
    ...d,
    label: formatDate(d.date),
  }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart
        data={formatted}
        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id="fillChat" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.4} />
            <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="fillAgent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid
          vertical={false}
          stroke="var(--border)"
          strokeDasharray="4 4"
        />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={12}
          minTickGap={32}
          tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--border)" }} />
        <Area
          type="monotone"
          dataKey="chat"
          stackId="1"
          stroke="var(--chart-2)"
          strokeWidth={2}
          fill="url(#fillChat)"
        />
        <Area
          type="monotone"
          dataKey="agent"
          stackId="1"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#fillAgent)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

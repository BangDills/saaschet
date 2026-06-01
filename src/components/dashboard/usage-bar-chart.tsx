"use client";

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";

export type ModelUsage = { modelId: string; count: number; totalCost: number };

function shortLabel(modelId: string): string {
  return modelId
    .replace(/^anthropic-/, "")
    .replace(/^openai-/, "")
    .replace(/-instruct$/, "")
    .replace(/-distill-llama-70b$/, "-distill")
    .slice(0, 24);
}

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
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Credits</span>
        <span className="ml-auto font-medium text-foreground">
          {Number(payload[0]?.value ?? 0).toLocaleString()}
        </span>
      </div>
    </div>
  );
}

export function UsageBarChart({ data }: { data: ModelUsage[] }) {
  const formatted = data.map((d) => ({
    label: shortLabel(d.modelId),
    cost: d.totalCost,
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart
        data={formatted}
        margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
        barGap={4}
      >
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          interval={0}
        />
        <Tooltip
          content={<ChartTooltip />}
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
        />
        <Bar dataKey="cost" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

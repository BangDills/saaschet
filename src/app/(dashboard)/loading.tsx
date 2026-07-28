import { Loader2 } from "lucide-react";

/** Segment-level loading state so page switches show feedback, not a freeze. */
export default function DashboardLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground motion-reduce:animate-none" />
      <span className="sr-only">Memuat…</span>
    </div>
  );
}

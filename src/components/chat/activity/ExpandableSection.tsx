"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Single animation primitive for collapse/expand.
 * Uses CSS grid-rows 0fr→1fr transition — no JS height measurement.
 * Used by ActivityGroup (body), "+N more" reveal, and ActivityItem detail.
 */
export function ExpandableSection({
  open,
  children,
  className,
}: {
  open: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        className,
      )}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

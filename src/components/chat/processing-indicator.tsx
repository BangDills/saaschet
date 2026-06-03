"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

/**
 * Pulsing indicator shown when a conversation was restored from DB
 * and the server is still processing the AI response.
 */
export function ProcessingIndicator() {
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  return (
    <div className="mx-4 my-3 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300">
      <Loader2 className="size-4 animate-spin shrink-0" />
      <div className="flex-1">
        <span className="font-semibold">Agent is still working…</span>
        <span className="ml-1 text-blue-600 dark:text-blue-400">
          The response will appear here automatically when ready.
        </span>
      </div>
      <span className="shrink-0 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-mono tabular-nums text-blue-600 dark:text-blue-300">
        {timeStr}
      </span>
    </div>
  );
}

"use client";

import { Loader2 } from "lucide-react";

/**
 * Pulsing indicator shown when a conversation was restored from DB
 * and the server is still processing the AI response.
 */
export function ProcessingIndicator() {
  return (
    <div className="mx-4 my-3 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300">
      <Loader2 className="size-4 animate-spin" />
      <div>
        <span className="font-semibold">Agent is still working…</span>
        <span className="ml-1 text-blue-600 dark:text-blue-400">
          The response will appear here automatically when ready.
        </span>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import { ExternalLink, Loader2, CheckCircle2, X } from "lucide-react";

type ConnectState =
  | { step: "idle" }
  | { step: "loading" }
  | { step: "code"; user_code: string; device_auth_id: string; interval: number }
  | { step: "connected" }
  | { step: "error"; message: string };

type Props = {
  open: boolean;
  onClose: () => void;
  onConnected: () => void;
};

/**
 * Dialog for connecting a ChatGPT account via OpenAI Codex Device Code flow.
 *
 * Flow:
 * 1. Request device code from backend
 * 2. Show user the code + link to auth.openai.com/codex/device
 * 3. Poll until user completes login
 * 4. onConnected() callback
 */
export function OpenAIConnectDialog({ open, onClose, onConnected }: Props) {
  const [state, setState] = React.useState<ConnectState>({ step: "idle" });
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount or when dialog closes
  React.useEffect(() => {
    if (open) return;
    // Dialog just closed — clear any active polling.
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [open]);

  // Start the flow when dialog opens
  const startFlow = React.useCallback(async () => {
    // Reset state at the start of a new flow
    setState({ step: "loading" });
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    try {
      const res = await fetch("/api/openai/device-code", { method: "POST" });
      if (!res.ok) throw new Error("Failed to start login flow");
      const data = (await res.json()) as {
        user_code: string;
        device_auth_id: string;
        interval: number;
      };
      setState({
        step: "code",
        user_code: data.user_code,
        device_auth_id: data.device_auth_id,
        interval: data.interval,
      });

      // Start polling
      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch("/api/openai/poll", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              device_auth_id: data.device_auth_id,
              user_code: data.user_code,
            }),
          });
          const pollData = (await pollRes.json()) as {
            status: string;
            error?: string;
          };

          if (pollData.status === "connected") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setState({ step: "connected" });
            setTimeout(() => {
              onConnected();
              onClose();
            }, 1500);
          } else if (pollData.status === "error") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setState({
              step: "error",
              message: pollData.error ?? "Authentication failed",
            });
          }
          // "pending" → keep polling
        } catch {
          // Ignore network errors during polling
        }
      }, (data.interval || 5) * 1000);
    } catch (err) {
      setState({
        step: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, [onClose, onConnected]);

  // Trigger flow when dialog opens
  const prevOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (open && !prevOpenRef.current) {
      startFlow();
    }
    prevOpenRef.current = open;
  }, [open, startFlow]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>

        {/* Header */}
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-foreground">
            Connect ChatGPT
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with your ChatGPT account to use GPT-5.5. Requires an
            active Plus, Pro, or Enterprise subscription.
          </p>
        </div>

        {/* Content based on state */}
        {state.step === "loading" && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {state.step === "code" && (
          <div className="space-y-4">
            <div className="rounded-xl bg-muted/50 p-4 text-center">
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Your code
              </p>
              <p className="font-mono text-3xl font-bold tracking-widest text-foreground">
                {state.user_code}
              </p>
            </div>

            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Instructions:</p>
              <ol className="list-inside list-decimal space-y-1.5 pl-1">
                <li>Open the link below</li>
                <li>Enter the code shown above</li>
                <li>Sign in with your ChatGPT account</li>
                <li>Come back here — it will connect automatically</li>
              </ol>
            </div>

            <a
              href="https://auth.openai.com/codex/device"
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#10a37f] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0d8c6d]"
            >
              Open OpenAI Login
              <ExternalLink className="size-4" />
            </a>

            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Waiting for you to sign in...
            </div>
          </div>
        )}

        {state.step === "connected" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <CheckCircle2 className="size-12 text-emerald-500" />
            <p className="text-lg font-medium text-foreground">Connected!</p>
            <p className="text-sm text-muted-foreground">
              GPT-5.5 is now available in your model list.
            </p>
          </div>
        )}

        {state.step === "error" && (
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {state.message}
            </div>
            <button
              onClick={onClose}
              className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium transition-colors hover:bg-accent/80"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

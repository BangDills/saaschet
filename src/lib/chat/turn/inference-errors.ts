import { APICallError, RetryError } from "ai";
import { envNumber } from "@/lib/env";

/**
 * Inference failure handling: reading a provider error well enough to decide
 * whether to retry, how long to wait, and what to tell the user.
 *
 * Provider SDKs bury the useful signal (status, Retry-After, rate-limit
 * wording) under wrapper errors, so everything that digs for it lives here
 * instead of in the request handler.
 */

const DEFAULT_MAX_RETRIES = 0;
const MAX_ALLOWED_RETRIES = 2;
const DEFAULT_LIMIT_RECOVERY_DELAY_MS = 20_000;
const MAX_LIMIT_RECOVERY_DELAY_MS = 60_000;
const DEFAULT_LIMIT_RECOVERY_RETRIES = 1;
const MAX_LIMIT_RECOVERY_RETRIES = 2;
const DEFAULT_TRANSIENT_RETRIES = 2;
const MAX_TRANSIENT_RETRIES = 4;
const DEFAULT_TRANSIENT_DELAY_MS = 2_000;
const MAX_TRANSIENT_DELAY_MS = 15_000;

export function chatMaxRetries(): number {
  const raw = process.env.AI_CHAT_MAX_RETRIES;
  if (!raw) return DEFAULT_MAX_RETRIES;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) return DEFAULT_MAX_RETRIES;

  return Math.min(parsed, MAX_ALLOWED_RETRIES);
}

/**
 * Positional wrapper over the shared reader, kept because the retry and
 * backoff settings below read better as (key, fallback, min, max) than as an
 * options object. The parsing lives in one place so the two cannot drift.
 */
export function envInteger(key: string, fallback: number, min: number, max: number): number {
  return envNumber(key, fallback, { min, max, integer: true });
}

export function limitRecoveryDelayMs(): number {
  return envInteger(
    "AI_AGENT_LIMIT_RECOVERY_DELAY_MS",
    DEFAULT_LIMIT_RECOVERY_DELAY_MS,
    0,
    MAX_LIMIT_RECOVERY_DELAY_MS,
  );
}

export function limitRecoveryRetries(): number {
  return envInteger(
    "AI_AGENT_LIMIT_RECOVERY_RETRIES",
    DEFAULT_LIMIT_RECOVERY_RETRIES,
    0,
    MAX_LIMIT_RECOVERY_RETRIES,
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function findApiCallError(err: unknown, seen = new Set<unknown>()): APICallError | null {
  if (!err || seen.has(err)) return null;
  seen.add(err);

  if (APICallError.isInstance(err)) return err;

  if (RetryError.isInstance(err)) {
    const fromLast = findApiCallError(err.lastError, seen);
    if (fromLast) return fromLast;

    for (const retryErr of err.errors) {
      const found = findApiCallError(retryErr, seen);
      if (found) return found;
    }
  }

  if (typeof err === "object" && "cause" in err) {
    return findApiCallError((err as { cause?: unknown }).cause, seen);
  }

  return null;
}

export function retryAfterSeconds(headers: Record<string, string> | undefined): number | null {
  if (!headers) return null;

  const retryAfterMs = headers["retry-after-ms"];
  if (retryAfterMs) {
    const ms = Number(retryAfterMs);
    if (Number.isFinite(ms) && ms > 0) return Math.ceil(ms / 1000);
  }

  const retryAfter = headers["retry-after"];
  if (!retryAfter) return null;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);

  const dateMs = Date.parse(retryAfter);
  if (!Number.isNaN(dateMs)) {
    return Math.max(1, Math.ceil((dateMs - Date.now()) / 1000));
  }

  return null;
}

export function formatInferenceError(err: unknown): { message: string; status: number; code: string } {
  const apiErr = findApiCallError(err);
  const rawMessage = err instanceof Error ? err.message : "Unknown inference error";
  const lowerMessage = rawMessage.toLowerCase();
  const statusCode = apiErr?.statusCode;

  if (
    lowerMessage.includes("does not support image input") ||
    lowerMessage.includes("does not support images") ||
    lowerMessage.includes("image input")
  ) {
    return {
      message: "Maaf Model tersebut tidak support Vision hehe",
      status: 400,
      code: "vision_not_supported",
    };
  }

  if (
    statusCode === 429 ||
    lowerMessage.includes("rate limit") ||
    lowerMessage.includes("quota") ||
    lowerMessage.includes("limit exceeded")
  ) {
    const wait = retryAfterSeconds(apiErr?.responseHeaders);
    return {
      message: wait
        ? `Server lagi sibuk nih. Coba lagi sekitar ${wait} detik ya.`
        : "Server lagi sibuk nih. Coba lagi sebentar ya.",
      status: 429,
      code: "provider_rate_limited",
    };
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      message: "API key model ditolak. Cek konfigurasi atau hubungi admin.",
      status: statusCode,
      code: "provider_auth_failed",
    };
  }

  if (statusCode && statusCode >= 500) {
    return {
      message: "Model lagi tidak tersedia sebentar. Coba lagi ya.",
      status: 502,
      code: "provider_unavailable",
    };
  }

  return {
    message: "Maaf, ada gangguan pas memproses. Coba lagi ya.",
    status: 502,
    code: "inference_failed",
  };
}

export function isRateLimitFailure(err: unknown): boolean {
  return formatInferenceError(err).code === "provider_rate_limited";
}

export function transientRetries(): number {
  return envInteger("AI_TRANSIENT_RETRIES", DEFAULT_TRANSIENT_RETRIES, 0, MAX_TRANSIENT_RETRIES);
}

export function transientRetryDelayMs(): number {
  return envInteger(
    "AI_TRANSIENT_RETRY_DELAY_MS",
    DEFAULT_TRANSIENT_DELAY_MS,
    0,
    MAX_TRANSIENT_DELAY_MS,
  );
}

/**
 * A connection that failed rather than a model that refused.
 *
 * Observed in production: `AI_APICallError: Cannot connect to API` with
 * `ETIMEDOUT` reaching Fireworks, carrying `isRetryable: true` — and nothing
 * retried it, so a passing network blip became "Maaf, ada gangguan pas
 * memproses." on screen.
 *
 * Rate limits are excluded because they have their own recovery path with
 * model fallback and a much longer wait; retrying one after two seconds would
 * just burn the quota faster.
 */
export function isTransientFailure(err: unknown): boolean {
  if (isRateLimitFailure(err)) return false;

  const apiErr = findApiCallError(err);
  // The SDK's own verdict, which also covers 5xx.
  if (apiErr?.isRetryable) return true;

  const lower = err instanceof Error ? err.message.toLowerCase() : "";
  return (
    lower.includes("cannot connect to api") ||
    lower.includes("fetch failed") ||
    lower.includes("etimedout") ||
    lower.includes("econnreset") ||
    lower.includes("econnrefused") ||
    lower.includes("socket hang up") ||
    lower.includes("network error")
  );
}

export function isRateLimitMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("rate-limit") ||
    lower.includes("quota") ||
    lower.includes("limit reached") ||
    lower.includes("limit exceeded")
  );
}

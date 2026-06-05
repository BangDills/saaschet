/**
 * OpenAI Codex OAuth — Device Code Flow.
 *
 * Allows users to "Sign in with ChatGPT" and use their subscription
 * (Plus/Pro/Enterprise) for GPT-5.5 inference in SaaSchet.
 *
 * Flow:
 * 1. POST /api/accounts/deviceauth/usercode → user_code + device_auth_id
 * 2. User visits auth.openai.com/codex/device and enters the code
 * 3. Backend polls /api/accounts/deviceauth/token until user completes login
 * 4. Exchange authorization_code at /oauth/token → access + refresh tokens
 * 5. Tokens stored in profiles table, auto-refreshed before expiry
 *
 * Constants sourced from the open-source Codex CLI.
 */

// ── Constants ────────────────────────────────────────────────────────────

export const CODEX_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
export const CODEX_OAUTH_ISSUER = "https://auth.openai.com";
export const CODEX_OAUTH_TOKEN_URL = `${CODEX_OAUTH_ISSUER}/oauth/token`;
export const CODEX_DEVICE_CODE_URL = `${CODEX_OAUTH_ISSUER}/api/accounts/deviceauth/usercode`;
export const CODEX_DEVICE_POLL_URL = `${CODEX_OAUTH_ISSUER}/api/accounts/deviceauth/token`;
export const CODEX_DEVICE_CALLBACK = `${CODEX_OAUTH_ISSUER}/deviceauth/callback`;
export const CODEX_USER_AUTH_URL = `${CODEX_OAUTH_ISSUER}/codex/device`;

/** Where inference requests go once authenticated. */
export const CODEX_INFERENCE_BASE_URL =
  "https://chatgpt.com/backend-api/codex";

/** Refresh tokens 2 minutes before expiry. */
export const REFRESH_SKEW_SECONDS = 120;

// ── Types ────────────────────────────────────────────────────────────────

export type DeviceCodeResponse = {
  user_code: string;
  device_auth_id: string;
  interval: number;
};

export type DeviceTokenResponse = {
  authorization_code: string;
  code_verifier: string;
};

export type CodexTokens = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
};

// ── Step 1: Request device code ──────────────────────────────────────────

export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const res = await fetch(CODEX_DEVICE_CODE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CODEX_OAUTH_CLIENT_ID }),
  });

  if (!res.ok) {
    throw new Error(
      `Device code request failed: ${res.status} ${res.statusText}`,
    );
  }

  const data = (await res.json()) as {
    user_code?: string;
    device_auth_id?: string;
    interval?: number;
  };

  if (!data.user_code || !data.device_auth_id) {
    throw new Error("Device code response missing required fields");
  }

  return {
    user_code: data.user_code,
    device_auth_id: data.device_auth_id,
    interval: Math.max(3, data.interval ?? 5),
  };
}

// ── Step 2: Poll for user authorization ──────────────────────────────────

export type PollResult =
  | { status: "pending" }
  | { status: "completed"; authorization_code: string; code_verifier: string }
  | { status: "error"; message: string };

export async function pollDeviceAuth(
  device_auth_id: string,
  user_code: string,
): Promise<PollResult> {
  const res = await fetch(CODEX_DEVICE_POLL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_auth_id, user_code }),
  });

  if (res.status === 403 || res.status === 404) {
    return { status: "pending" };
  }

  if (!res.ok) {
    return { status: "error", message: `Poll returned ${res.status}` };
  }

  const data = (await res.json()) as {
    authorization_code?: string;
    code_verifier?: string;
  };

  if (!data.authorization_code || !data.code_verifier) {
    return { status: "error", message: "Response missing code or verifier" };
  }

  return {
    status: "completed",
    authorization_code: data.authorization_code,
    code_verifier: data.code_verifier,
  };
}

// ── Step 3: Exchange code for tokens ─────────────────────────────────────

export async function exchangeCodeForTokens(
  authorization_code: string,
  code_verifier: string,
): Promise<CodexTokens> {
  const res = await fetch(CODEX_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: authorization_code,
      redirect_uri: CODEX_DEVICE_CALLBACK,
      client_id: CODEX_OAUTH_CLIENT_ID,
      code_verifier,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!data.access_token) {
    throw new Error("Token exchange did not return an access_token");
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? "",
    expires_in: data.expires_in,
  };
}

// ── Token refresh ────────────────────────────────────────────────────────

export async function refreshAccessToken(
  refresh_token: string,
): Promise<CodexTokens> {
  const res = await fetch(CODEX_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token,
      client_id: CODEX_OAUTH_CLIENT_ID,
    }),
  });

  if (res.status === 429) {
    throw new Error("OpenAI rate limit exceeded — credentials are still valid");
  }

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!data.access_token) {
    throw new Error("Refresh did not return an access_token");
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refresh_token,
    expires_in: data.expires_in,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Calculate token expiry timestamp from expires_in seconds. */
export function expiresAt(expiresIn?: number): string | null {
  if (!expiresIn) return null;
  return new Date(
    Date.now() + (expiresIn - REFRESH_SKEW_SECONDS) * 1000,
  ).toISOString();
}

/** Check if a stored token needs refresh. */
export function needsRefresh(expiresAtIso: string | null): boolean {
  if (!expiresAtIso) return true;
  return new Date(expiresAtIso).getTime() <= Date.now();
}

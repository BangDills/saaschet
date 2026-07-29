import { Daytona } from "@daytona/sdk";
import { createLogger } from "@/lib/logger";

const log = createLogger("sandbox");

let _client: Daytona | null = null;

/**
 * Returns a singleton sandbox client (powered by Daytona SDK).
 * Requires DAYTONA_API_KEY env var.
 * Uses DAYTONA_SERVER_URL when set, with DAYTONA_API_URL as a legacy alias.
 */
export function getDaytonaClient(): Daytona {
  if (_client) return _client;

  const apiKey = process.env.DAYTONA_API_KEY;
  if (!apiKey) {
    throw new Error("DAYTONA_API_KEY is not set");
  }

  const target = (process.env.DAYTONA_TARGET as "us" | "eu") || "us";
  const apiUrl =
    process.env.DAYTONA_SERVER_URL ||
    process.env.DAYTONA_API_URL ||
    "https://app.daytona.io/api";

  // Key is only ever logged as a fingerprint — never the secret itself.
  log.debug("client initialized", {
    apiUrl,
    target,
    keyFingerprint: `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`,
    keyLength: apiKey.length,
  });

  _client = new Daytona({
    apiKey,
    apiUrl,
    target,
  });

  return _client;
}

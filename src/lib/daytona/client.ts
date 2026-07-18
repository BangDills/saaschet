import { Daytona } from "@daytona/sdk";

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

  // Print diagnostic log safely (only first and last 4 characters)
  const keyStart = apiKey.substring(0, 4);
  const keyEnd = apiKey.substring(apiKey.length - 4);
  console.info(
    `[sandbox-diag] Init sandbox client with URL: "${apiUrl}", Target: "${target}", Key: ${keyStart}...${keyEnd} (Len: ${apiKey.length})`
  );

  _client = new Daytona({
    apiKey,
    apiUrl,
    target,
  });

  return _client;
}

import { Daytona } from "@daytona/sdk";

let _client: Daytona | null = null;

/**
 * Returns a singleton Daytona client.
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

  _client = new Daytona({
    apiKey,
    apiUrl:
      process.env.DAYTONA_SERVER_URL ||
      process.env.DAYTONA_API_URL ||
      "https://app.daytona.io/api",
    target,
  });

  return _client;
}

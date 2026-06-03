import { Daytona } from "@daytona/sdk";

let _client: Daytona | null = null;

/**
 * Returns a singleton Daytona client.
 * Requires DAYTONA_API_KEY env var.
 */
export function getDaytonaClient(): Daytona {
  if (_client) return _client;

  const apiKey = process.env.DAYTONA_API_KEY;
  if (!apiKey) {
    throw new Error("DAYTONA_API_KEY is not set");
  }

  _client = new Daytona({
    apiKey,
    apiUrl: process.env.DAYTONA_API_URL || "https://app.daytona.io/api",
    target: (process.env.DAYTONA_TARGET as "us" | "eu") || "us",
  });

  return _client;
}

import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { saveMemory } from "./memory";
import { createLogger } from "@/lib/logger";


const log = createLogger("memory-extractor");
const MEMORY_EXTRACTION_SYSTEM = `You are a memory extractor agent. Your task is to analyze the recent conversation exchange between a user and an AI assistant and extract any persistent facts, preferences, project details, or configurations about the user that should be remembered in future conversations.

Guidelines:
- Extract only actual facts, preferences, settings, or project details (e.g. "User prefers Tailwind CSS v4", "User is building a SaaS platform named Celiuz AI", "User works with Next.js 16 and Supabase").
- Do NOT extract conversational fluff, temporary questions, or short-lived intents (e.g. "User asked how to fix a bug", "User said hello").
- Keep facts concise, clear, and written in 3rd person (e.g., "User prefers..." instead of "I prefer...").
- Output the results strictly as a JSON array of strings. Do not add markdown formatting, explanations, or wrappers. Just a raw JSON array.
- If nothing important is found, output an empty JSON array: []

Example Output:
[
  "User prefers TypeScript over JavaScript",
  "User is deploying their app on cPanel",
  "User prefers using pnpm as the package manager"
]`;

/**
 * Strips markdown code blocks and truncates text to avoid sending excessively large payloads
 * (e.g. file edits, terminal output logs) to the memory extraction LLM.
 */
function cleanAndTruncate(text: string, maxLen: number = 2000): string {
  let cleaned = text.replace(/```[\s\S]*?```/g, "[Code Block / Log Output]");
  if (cleaned.length > maxLen) {
    cleaned = cleaned.slice(0, maxLen) + "... [truncated]";
  }
  return cleaned;
}

/**
 * Extracts key facts and preferences from the latest chat turn and stores them.
 * This runs asynchronously to avoid blocking the main chat response.
 */
export async function extractAndSaveMemories(
  userId: string,
  userMessage: string,
  assistantMessage: string,
): Promise<void> {
  const apiKey = process.env.FIREWORKS_API_KEY;

  log.debug("env check", { hasFireworksKey: !!apiKey });

  if (!apiKey) {
    log.warn("FIREWORKS_API_KEY not set — skipping memory extraction");
    return;
  }

  const baseUrl = process.env.FIREWORKS_BASE_URL ?? "https://api.fireworks.ai/inference/v1";

  const cleanUser = cleanAndTruncate(userMessage);
  const cleanAssistant = cleanAndTruncate(assistantMessage);
  const prompt = `User Message: "${cleanUser}"\n\nAssistant Response: "${cleanAssistant}"`;

  try {
    const fireworksProvider = createOpenAI({
      apiKey,
      baseURL: baseUrl,
    });

    let text = "";
    try {
      const res = await streamText({
        model: fireworksProvider("accounts/fireworks/models/deepseek-v4-flash"),
        system: MEMORY_EXTRACTION_SYSTEM,
        prompt,
        maxOutputTokens: 2000,
        onError: ({ error }) => {
          log.error("streamText failed", { err: error });
        },
      });
      text = await res.text;
    } catch (err) {
      log.warn("Fireworks call failed", { err });
    }

    // Robustly extract the JSON array using regex (bypasses reasoning tags, markdown blocks, etc.)
    const jsonMatch = text ? text.match(/\[\s*([\s\S]*)\s*\]/) : null;
    if (!jsonMatch) {
      log.error("no JSON array in response", { responseLength: text?.length ?? 0, response: text });
      return;
    }

    let facts: string[] = [];
    try {
      facts = JSON.parse(jsonMatch[0]);
    } catch (err) {
      log.error("facts JSON parse failed", { raw: jsonMatch[0], err });
      return;
    }

    if (!Array.isArray(facts) || facts.length === 0) {
      return;
    }

    log.info("extracted memories", { userId, count: facts.length });

    // Save each memory using our vector helper
    for (const fact of facts) {
      if (typeof fact === "string" && fact.trim().length > 5) {
        await saveMemory(userId, fact);
      }
    }
  } catch (err) {
    log.error("extraction failed", { err });
  }
}

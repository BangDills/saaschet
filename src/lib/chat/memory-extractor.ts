import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { saveMemory } from "./memory";

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
 * Extracts key facts and preferences from the latest chat turn and stores them.
 * This runs asynchronously to avoid blocking the main chat response.
 */
export async function extractAndSaveMemories(
  userId: string,
  userMessage: string,
  assistantMessage: string,
): Promise<void> {
  const apiKey = process.env.DO_INFERENCE_API_KEY;
  if (!apiKey) {
    console.warn("[memory-extractor] DO_INFERENCE_API_KEY is not set. Skipping memory extraction.");
    return;
  }

  const baseUrl = process.env.DO_INFERENCE_BASE_URL ?? "https://inference.do-ai.run/v1";
  const prompt = `User Message: "${userMessage}"\n\nAssistant Response: "${assistantMessage}"`;

  try {
    const doProvider = createOpenAI({
      apiKey,
      baseURL: baseUrl,
    });

    let text = "";
    try {
      const res = await streamText({
        model: doProvider("deepseek-4-flash"),
        system: MEMORY_EXTRACTION_SYSTEM,
        prompt,
      });
      text = await res.text;
    } catch (err) {
      console.warn("[memory-extractor] Failed during streamText. This is likely due to DigitalOcean API response validation mismatch. Skipping memory extraction gracefully. Error:", err instanceof Error ? err.message : String(err));
      return;
    }

    // Robustly extract the JSON array using regex (bypasses reasoning tags, markdown blocks, etc.)
    const jsonMatch = text.match(/\[\s*([\s\S]*)\s*\]/);
    if (!jsonMatch) {
      console.error("[memory-extractor] Failed to locate JSON array in response:", text);
      return;
    }

    let facts: string[] = [];
    try {
      facts = JSON.parse(jsonMatch[0]);
    } catch (err) {
      console.error("[memory-extractor] Failed to parse facts JSON:", jsonMatch[0], "Error:", err);
      return;
    }

    if (!Array.isArray(facts) || facts.length === 0) {
      return;
    }

    console.log(`[memory-extractor] Extracted ${facts.length} potential memories for user ${userId}`);

    // Save each memory using our vector helper
    for (const fact of facts) {
      if (typeof fact === "string" && fact.trim().length > 5) {
        await saveMemory(userId, fact);
      }
    }
  } catch (err) {
    console.error("[memory-extractor] Failed to extract memories:", err);
  }
}

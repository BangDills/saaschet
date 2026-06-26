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
  const apiKey = process.env.ALIBABA_API_KEY || process.env.DO_INFERENCE_API_KEY;
  const opencodeKey = process.env.OPENCODE_API_KEY;
  
  console.log(`[memory-extractor] Env check: ALIBABA_API_KEY/DO_INFERENCE_API_KEY exists: ${!!apiKey}, OPENCODE_API_KEY exists: ${!!opencodeKey}`);

  if (!apiKey) {
    console.warn("[memory-extractor] ALIBABA_API_KEY or DO_INFERENCE_API_KEY is not set. Skipping memory extraction.");
    return;
  }

  const baseUrl = process.env.ALIBABA_BASE_URL ?? "https://ws-7i0g4fvbloleocpm.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1";
  
  const cleanUser = cleanAndTruncate(userMessage);
  const cleanAssistant = cleanAndTruncate(assistantMessage);
  const prompt = `User Message: "${cleanUser}"\n\nAssistant Response: "${cleanAssistant}"`;

  try {
    const alibabaProvider = createOpenAI({
      apiKey,
      baseURL: baseUrl,
    });

    let text = "";
    try {
      const res = await streamText({
        model: alibabaProvider("qwen-3.7-plus"),
        system: MEMORY_EXTRACTION_SYSTEM,
        prompt,
        onError: ({ error }) => {
          console.error("[memory-extractor] streamText error details:", error);
        },
      });
      text = await res.text;
    } catch (err) {
      console.warn("[memory-extractor] Alibaba call failed:", err instanceof Error ? err.message : String(err));
    }

    // Fallback to OpenCode if Alibaba returned empty or failed, and OpenCode key is available
    if ((!text || text.trim().length === 0) && opencodeKey) {
      console.log("[memory-extractor] Alibaba returned empty or failed. Falling back to OpenCode...");
      try {
        const opencodeProvider = createOpenAI({
          apiKey: opencodeKey,
          baseURL: "https://opencode.ai/zen/v1",
        });
        const res = await streamText({
          model: opencodeProvider("deepseek-v4-flash-free"),
          system: MEMORY_EXTRACTION_SYSTEM,
          prompt,
          onError: ({ error }) => {
            console.error("[memory-extractor] OpenCode streamText error details:", error);
          },
        });
        text = await res.text;
      } catch (err) {
        console.error("[memory-extractor] OpenCode fallback failed:", err instanceof Error ? err.message : String(err));
      }
    }

    // Robustly extract the JSON array using regex (bypasses reasoning tags, markdown blocks, etc.)
    const jsonMatch = text ? text.match(/\[\s*([\s\S]*)\s*\]/) : null;
    if (!jsonMatch) {
      console.error("[memory-extractor] Failed to locate JSON array in response. Response length:", text?.length ?? 0, "Response content:", JSON.stringify(text));
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

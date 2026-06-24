import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getStructuredMemory, saveStructuredMemory } from "./structured-memory";

const STRUCTURED_EXTRACTION_SYSTEM = `You are a Profile Metadata Extractor. Your task is to maintain a structured JSON profile about the user based on their recent chat exchange.

You will be given:
1. The CURRENT JSON profile of the user.
2. The latest message exchange (User message & Assistant response).

Your goal:
- Extract persistent, absolute facts about the user (e.g. languages they prefer, frameworks, timezone, project name they are building, OS, package manager, styling habits).
- Update the CURRENT JSON profile by modifying keys, adding new key-value pairs, or removing items that have become obsolete or corrected by the user.
- Keep keys short, lowercase, and snake_case (e.g., "preferred_language", "package_manager", "current_project_name").
- Keep values simple (strings, numbers, or arrays of strings).
- Do NOT include temporary states (like "current_error" or "current_task"). Only include long-term profile data.
- Output ONLY the updated JSON profile object. Do not include markdown codeblocks, explanations, or wrappers. Output must be raw parseable JSON.

Example Output:
{
  "full_name": "Dills",
  "preferred_languages": ["TypeScript", "Golang"],
  "styling_library": "Tailwind CSS v4",
  "deployment_target": "cPanel"
}`;

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
 * Reads user's current structured profile, invokes LLM to extract updates from the latest turn,
 * and saves the updated JSON profile back to the database.
 */
export async function extractAndSaveStructuredMemory(
  userId: string,
  userMessage: string,
  assistantMessage: string,
): Promise<void> {
  const apiKey = process.env.DO_INFERENCE_API_KEY;
  const opencodeKey = process.env.OPENCODE_API_KEY;

  console.log(`[structured-memory-extractor] Env check: DO_INFERENCE_API_KEY exists: ${!!apiKey}, OPENCODE_API_KEY exists: ${!!opencodeKey}`);

  if (!apiKey) {
    console.warn("[structured-memory-extractor] DO_INFERENCE_API_KEY is not set. Skipping metadata extraction.");
    return;
  }

  const baseUrl = process.env.DO_INFERENCE_BASE_URL ?? "https://inference.do-ai.run/v1";

  try {
    // 1. Fetch current profile
    const currentMemory = await getStructuredMemory(userId);

    // 2. Prepare prompt
    const cleanUser = cleanAndTruncate(userMessage);
    const cleanAssistant = cleanAndTruncate(assistantMessage);
    const prompt = `Current Profile:
${JSON.stringify(currentMemory, null, 2)}

Latest Message Exchange:
User Message: "${cleanUser}"
Assistant Response: "${cleanAssistant}"`;

    // 3. Invoke LLM (DeepSeek-4-Flash)
    const doProvider = createOpenAI({
      apiKey,
      baseURL: baseUrl,
    });

    let text = "";
    try {
      const res = await streamText({
        model: doProvider("deepseek-4-flash"),
        system: STRUCTURED_EXTRACTION_SYSTEM,
        prompt,
        onError: ({ error }) => {
          console.error("[structured-memory-extractor] streamText error details:", error);
        },
      });
      text = await res.text;
    } catch (err) {
      console.warn("[structured-memory-extractor] DigitalOcean call failed:", err instanceof Error ? err.message : String(err));
    }

    // Fallback to OpenCode if DigitalOcean returned empty or failed, and OpenCode key is available
    if ((!text || text.trim().length === 0) && opencodeKey) {
      console.log("[structured-memory-extractor] DigitalOcean returned empty or failed. Falling back to OpenCode...");
      try {
        const opencodeProvider = createOpenAI({
          apiKey: opencodeKey,
          baseURL: "https://opencode.ai/zen/v1",
        });
        const res = await streamText({
          model: opencodeProvider("deepseek-v4-flash-free"),
          system: STRUCTURED_EXTRACTION_SYSTEM,
          prompt,
          onError: ({ error }) => {
            console.error("[structured-memory-extractor] OpenCode streamText error details:", error);
          },
        });
        text = await res.text;
      } catch (err) {
        console.error("[structured-memory-extractor] OpenCode fallback failed:", err instanceof Error ? err.message : String(err));
      }
    }

    // 4. Robustly extract the JSON object using regex (bypasses reasoning tags, markdown blocks, etc.)
    const jsonMatch = text ? text.match(/\{\s*([\s\S]*)\s*\}/) : null;
    if (!jsonMatch) {
      console.error("[structured-memory-extractor] Failed to locate JSON object in response. Response length:", text?.length ?? 0, "Response content:", JSON.stringify(text));
      return;
    }

    // 5. Parse and save
    let updatedMemory: Record<string, unknown> = {};
    try {
      updatedMemory = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } catch (err) {
      console.error("[structured-memory-extractor] Failed to parse updated JSON profile:", jsonMatch[0], "Error:", err);
      return;
    }

    // Basic integrity check (must be an object)
    if (typeof updatedMemory !== "object" || updatedMemory === null || Array.isArray(updatedMemory)) {
      console.error("[structured-memory-extractor] Extracted metadata is not a JSON object");
      return;
    }

    // Only save if it actually changed compared to currentMemory
    const currentStr = JSON.stringify(currentMemory);
    const updatedStr = JSON.stringify(updatedMemory);
    if (currentStr !== updatedStr) {
      await saveStructuredMemory(userId, updatedMemory);
    }
  } catch (err) {
    console.error("[structured-memory-extractor] Failed to extract metadata:", err);
  }
}

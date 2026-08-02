import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getStructuredMemory, saveStructuredMemory } from "./structured-memory";
import { createLogger } from "@/lib/logger";


const log = createLogger("structured-memory");
const STRUCTURED_EXTRACTION_SYSTEM = `You are a Profile Metadata Extractor. Your task is to maintain a structured JSON profile about the user based on their recent chat exchange.

You will be given:
1. The CURRENT JSON profile of the user.
2. The latest message exchange (User message & Assistant response).

Your goal:
- Extract persistent, absolute facts about the USER (e.g. languages they prefer, frameworks they reach for, timezone, OS, package manager, styling habits).
- Update the CURRENT JSON profile by modifying keys, adding new key-value pairs, or removing items that have become obsolete or corrected by the user.
- Keep keys short, lowercase, and snake_case (e.g., "preferred_language", "package_manager", "styling_library").
- Keep values simple (strings, numbers, or arrays of strings).
- NEVER record which project or repository the user is working on. No "current_project_name", "project_repo", "github_repository", "default_branch" or anything like them. This profile is read on EVERY message, and the user switches between projects constantly, so such a key is wrong within hours and then contradicts the repository actually connected to the conversation — which the system already knows for certain. Facts about the user survive a project change; the name of a project does not.
- Do NOT include temporary states (like "current_error" or "current_task"). Only long-term facts about the person.
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
  const apiKey = process.env.FIREWORKS_API_KEY;

  log.debug("env check", { hasFireworksKey: !!apiKey });

  if (!apiKey) {
    log.warn("FIREWORKS_API_KEY not set — skipping metadata extraction");
    return;
  }

  const baseUrl = process.env.FIREWORKS_BASE_URL ?? "https://api.fireworks.ai/inference/v1";

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

    // 3. Invoke LLM (Fireworks DeepSeek V4 Flash — fast, 131k cap, fits extraction)
    const fireworksProvider = createOpenAI({
      apiKey,
      baseURL: baseUrl,
    });

    let text = "";
    try {
      const res = await streamText({
        model: fireworksProvider("accounts/fireworks/models/deepseek-v4-flash"),
        system: STRUCTURED_EXTRACTION_SYSTEM,
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

    // 4. Robustly extract the JSON object using regex (bypasses reasoning tags, markdown blocks, etc.)
    const jsonMatch = text ? text.match(/\{\s*([\s\S]*)\s*\}/) : null;
    if (!jsonMatch) {
      log.error("no JSON object in response", { responseLength: text?.length ?? 0, response: text });
      return;
    }

    // 5. Parse and save
    let updatedMemory: Record<string, unknown> = {};
    try {
      updatedMemory = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } catch (err) {
      log.error("profile JSON parse failed", { raw: jsonMatch[0], err });
      return;
    }

    // Basic integrity check (must be an object)
    if (typeof updatedMemory !== "object" || updatedMemory === null || Array.isArray(updatedMemory)) {
      log.error("extracted metadata is not a JSON object");
      return;
    }

    // Only save if it actually changed compared to currentMemory
    const currentStr = JSON.stringify(currentMemory);
    const updatedStr = JSON.stringify(updatedMemory);
    if (currentStr !== updatedStr) {
      await saveStructuredMemory(userId, updatedMemory);
    }
  } catch (err) {
    log.error("extraction failed", { err });
  }
}

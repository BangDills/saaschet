import { generateObject, jsonSchema, streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
// Relative, not "@/..." on purpose: action-registry.test.ts imports this module
// and `npm test` runs those files through tsx, where the tsconfig path alias is
// not exercised by any existing selfcheck. Keep these relative so the test can
// load the normalizer.
import { createLogger } from "../../logger";
import type { FollowUp } from "../../agent/action-registry";

/**
 * Follow-up suggestion generator.
 *
 * The follow-ups under a reply used to be reverse-engineered from the reply's
 * prose with regexes, which failed for two structural reasons: the chat-mode
 * system prompt tells the model to AVOID next-step sections (so the list the
 * parser looked for was never written), and `report_state` — the structured
 * path — only exists in agent mode. Chat mode therefore fell through to three
 * canned labels on essentially every turn.
 *
 * So we ask instead of guess: one small structured call over the finished turn
 * produces suggestions that are grounded in what was actually said. It runs
 * after the reply has fully streamed, so it never delays the text — only the
 * chips appear a beat later.
 */

const log = createLogger("follow-ups");

/** Small, fast Fireworks model — same one the memory extractors use. */
const FOLLOW_UP_MODEL = "accounts/fireworks/models/deepseek-v4-flash";

const MAX_FOLLOW_UPS = 4;
const LABEL_MAX = 48;
const MESSAGE_MAX = 400;
/**
 * This model family emits `<think>…</think>` before answering (see
 * lib/chat/parse-reasoning.ts). At 800 tokens the reasoning ate the whole
 * budget and the JSON never arrived, so every call came back empty. 2000
 * matches what the memory extractors already prove is enough here.
 */
const MAX_OUTPUT_TOKENS = 2000;
/** Never hold the stream open for a slow side-call; no chips beats a hang. */
const TIMEOUT_MS = 12000;

const SYSTEM = `You write the follow-up suggestions that appear under an assistant's reply in a chat product.

You are given the user's request and the assistant's final reply. Propose the 2-4 next moves THIS user would plausibly want, judged from what the reply actually says and what it leaves open.

Each option has two fields:
- "label": the chip the user taps. Short — a few words, under ${LABEL_MAX} characters. It is the action itself, not a sentence describing it.
- "message": what gets sent as the user's next message when they tap it. A complete, self-contained instruction that stands on its own, because the assistant will not see the label.

Requirements:
- Write in the same language as the assistant's reply. If the reply is Indonesian, the options are Indonesian.
- Ground every option in the reply's specifics: name the actual file, feature, number, or decision at stake. Vague options like "Jelaskan lebih detail", "Apa langkah berikutnya?", or "Berikan contoh" are worthless — never emit them.
- Offer genuinely different directions, not one direction phrased three ways.
- If the reply asked the user a question, the options are the answers to that question.
- Return an empty options array when the turn is genuinely closed and nothing meaningful follows. Empty is a valid, good answer — better than padding with filler.

Output raw JSON only, no markdown fences, no commentary:
{"options":[{"label":"...","message":"..."}]}`;

const OPTIONS_SCHEMA = {
  type: "object",
  properties: {
    options: {
      type: "array",
      maxItems: MAX_FOLLOW_UPS,
      items: {
        type: "object",
        properties: {
          label: { type: "string", description: `Tappable chip, under ${LABEL_MAX} characters.` },
          message: { type: "string", description: "Self-contained instruction sent on tap." },
        },
        required: ["label", "message"],
        additionalProperties: false,
      },
    },
  },
  required: ["options"],
  additionalProperties: false,
} as const;

type RawOptions = { options?: Array<{ label?: unknown; message?: unknown }> };

/** Reasoning blocks and code fences wrap the payload we actually want. */
function stripNoise(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?think>/gi, "")
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/```/g, "")
    .trim();
}

/**
 * Locate the JSON object carrying "options" in a raw model response.
 *
 * Anchoring on the key and brace-counting outward, rather than matching the
 * first `{` to the last `}`, is what makes this survive reasoning text that
 * contains braces of its own — a greedy match would splice prose into the
 * candidate and fail to parse. Exported so the shapes are testable.
 */
export function parseOptionsPayload(text: string | null | undefined): unknown {
  if (!text) return null;
  const s = stripNoise(text);
  if (!s) return null;

  // A well-behaved response is already a bare object.
  try {
    return JSON.parse(s);
  } catch {
    // Fall through to locating it inside surrounding chatter.
  }

  const key = s.indexOf('"options"');
  if (key < 0) return null;

  let start = -1;
  for (let i = key; i >= 0; i--) {
    if (s[i] === "{") {
      start = i;
      break;
    }
  }
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(s.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Strip code blocks and cap length. A turn that wrote three files would
 * otherwise ship its whole diff into this prompt.
 */
function cleanAndTruncate(text: string, maxLen = 2500): string {
  const cleaned = text.replace(/```[\s\S]*?```/g, "[code block]").trim();
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen)}… [truncated]` : cleaned;
}

/** Trim a label to LABEL_MAX without cutting mid-word. */
function shortenLabel(label: string): string {
  if (label.length <= LABEL_MAX) return label;
  // "Title — long explanation" and "Title: detail" keep just the title.
  for (const sep of [" — ", " – ", ": "]) {
    const head = label.split(sep)[0]?.trim();
    if (head && head.length >= 8 && head.length <= LABEL_MAX) return head;
  }
  const clipped = label.slice(0, LABEL_MAX);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${(lastSpace > 12 ? clipped.slice(0, lastSpace) : clipped).trim()}…`;
}

/**
 * Coerce whatever the model returned into trustworthy FollowUps.
 *
 * Exported and pure so the shaping rules are testable without a network call:
 * the generator is only as good as this gate.
 */
export function normalizeFollowUps(raw: unknown): FollowUp[] {
  // Accept a bare array too: asked for {"options":[…]}, models sometimes just
  // return the list.
  const options = Array.isArray(raw) ? raw : (raw as RawOptions | null)?.options;
  if (!Array.isArray(options)) return [];

  const out: FollowUp[] = [];
  const seen = new Set<string>();

  for (const option of options) {
    if (out.length >= MAX_FOLLOW_UPS) break;
    if (!option || typeof option !== "object") continue;

    const rawLabel = typeof option.label === "string" ? option.label : "";
    const rawMessage = typeof option.message === "string" ? option.message : "";

    const label = shortenLabel(
      rawLabel.replace(/[*_`~]/g, "").replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, ""),
    );
    // A missing message still makes a usable chip — the label carries it.
    const message = (rawMessage.replace(/\s+/g, " ").trim() || label).slice(0, MESSAGE_MAX);

    if (label.length < 3 || message.length < 3) continue;

    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ label, message });
  }

  return out;
}

function buildPrompt(userText: string, assistantText: string, taskType?: string): string {
  const context = taskType ? `Task category: ${taskType}\n\n` : "";
  return `${context}User's request:
"""
${cleanAndTruncate(userText, 1200)}
"""

Assistant's final reply:
"""
${cleanAndTruncate(assistantText)}
"""`;
}

/**
 * Ask the model for structured options.
 *
 * generateObject is the primary path. It is the first use of it in this repo,
 * and it leans on json_schema response formatting that not every Fireworks
 * model honours, so a refusal falls back to the plain streamText + JSON parse
 * shape the memory extractors already prove works against this same model.
 * Whichever path answers, normalizeFollowUps is the only way out.
 */
async function requestOptions(
  provider: ReturnType<typeof createOpenAI>,
  prompt: string,
): Promise<{ raw: unknown; via: "generateObject" | "textParse" }> {
  try {
    const { object } = await generateObject({
      model: provider(FOLLOW_UP_MODEL),
      schema: jsonSchema<{ options: Array<{ label: string; message: string }> }>(
        OPTIONS_SCHEMA as never,
      ),
      system: SYSTEM,
      prompt,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });
    return { raw: object, via: "generateObject" };
  } catch (err) {
    // Logged at warn, not debug: if this always fails we want to see it in the
    // deployment logs rather than discover it from empty chips.
    log.warn("generateObject path failed, falling back to text parse", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  const res = await streamText({
    model: provider(FOLLOW_UP_MODEL),
    system: SYSTEM,
    prompt,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    onError: ({ error }) => log.warn("follow-up streamText failed", { err: error }),
  });
  const text = await res.text;
  const raw = parseOptionsPayload(text);
  if (!raw) {
    log.warn("no options payload in follow-up response", {
      textLength: text?.length ?? 0,
      preview: text?.slice(0, 300) ?? "",
    });
  }
  return { raw, via: "textParse" };
}

/**
 * Generate follow-ups for a finished turn. Returns [] on any failure, missing
 * key, timeout, or genuinely-nothing-to-suggest — callers render no chips
 * rather than filler.
 */
export async function generateFollowUps(args: {
  userText: string;
  assistantText: string;
  taskType?: string;
}): Promise<FollowUp[]> {
  const { userText, assistantText, taskType } = args;

  const apiKey = process.env.FIREWORKS_API_KEY;
  if (!apiKey) {
    log.warn("FIREWORKS_API_KEY not set — skipping follow-up generation");
    return [];
  }
  // Nothing worth reacting to yet.
  if (!assistantText || assistantText.trim().length < 40) return [];

  const provider = createOpenAI({
    apiKey,
    baseURL: process.env.FIREWORKS_BASE_URL ?? "https://api.fireworks.ai/inference/v1",
  });

  const startedAt = Date.now();
  try {
    const result = await Promise.race([
      requestOptions(provider, buildPrompt(userText, assistantText, taskType)),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ]);
    if (!result) {
      log.warn("follow-up generation timed out", { timeoutMs: TIMEOUT_MS });
      return [];
    }
    const followUps = normalizeFollowUps(result.raw);
    // `via` answers the open question of whether structured output actually
    // works against this provider, and `count: 0` distinguishes "the model had
    // nothing to offer" from "the call fell over" above.
    log.info("follow-ups generated", {
      count: followUps.length,
      via: result.via,
      durationMs: Date.now() - startedAt,
    });
    return followUps;
  } catch (err) {
    log.warn("follow-up generation failed", { err });
    return [];
  }
}

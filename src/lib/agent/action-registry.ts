/**
 * Context-aware Quick Actions for the AI agent.
 *
 * The agent reports a structured AgentCompletionState (task type, status,
 * objective, what it can do next). The UI never hardcodes buttons — it looks
 * up actions in the ActionRegistry by (taskType, status), optionally filters
 * by the capabilities the agent said it has, and renders 3–5 relevant ones.
 *
 * Adding a new task category = add one entry to ActionRegistry. No UI change.
 */

/** A single suggested action shown as a button in the chat follow-up row. */
export type AgentAction = {
  /** Stable id; the client sends this back as the next user message intent. */
  id: string;
  /** Button label (Indonesian, user-facing). */
  label: string;
  /** Optional capability this action maps to, for filtering by nextCapabilities. */
  capability?: string;
};

/**
 * Structured state the agent (planner/orchestrator) emits at end of turn.
 * This is the single source of truth for the follow-up actions UI.
 */
export interface AgentCompletionState {
  taskType: string;
  status:
    | "planning"
    | "running"
    | "completed"
    | "blocked"
    | "approval_required"
    | "failed";
  objective: string;
  summary: string;
  /** Capability ids the agent can act on next (e.g. "fix", "security"). */
  nextCapabilities?: string[];
  /** Explicit actions the planner wants shown (overrides registry). */
  suggestedActions?: string[];
  requiresUserDecision?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Registry keyed by taskType → status → list of candidate actions.
 * Keep labels short and action-oriented.
 */
export const ActionRegistry: Record<
  string,
  Partial<Record<AgentCompletionState["status"], AgentAction[]>>
> = {
  audit: {
    completed: [
      { id: "fix", label: "Perbaiki seluruh temuan audit", capability: "fix" },
      { id: "security", label: "Audit keamanan lebih lanjut", capability: "security" },
      { id: "performance", label: "Audit performa", capability: "performance" },
      { id: "testing", label: "Buat regression test", capability: "testing" },
    ],
    failed: [
      { id: "retry", label: "Coba ulang audit", capability: "fix" },
      { id: "narrow", label: "Audit bagian spesifik", capability: "fix" },
    ],
  },
  ui: {
    completed: [
      { id: "responsive", label: "Optimalkan tampilan mobile", capability: "responsive" },
      { id: "spacing", label: "Rapikan spacing", capability: "spacing" },
      { id: "darkmode", label: "Perbaiki dark mode", capability: "darkmode" },
      { id: "typography", label: "Rapikan typography", capability: "typography" },
    ],
  },
  debugging: {
    completed: [
      { id: "fixBug", label: "Perbaiki bug", capability: "fix" },
      { id: "regression", label: "Buat regression test", capability: "testing" },
      { id: "rootCause", label: "Cari akar penyebab", capability: "rootCause" },
      { id: "logging", label: "Tambahkan logging", capability: "logging" },
    ],
  },
  git: {
    completed: [
      { id: "merge", label: "Merge ke main", capability: "merge" },
      { id: "deploy", label: "Deploy", capability: "deploy" },
      { id: "review", label: "Review perubahan", capability: "review" },
    ],
  },
  deploy: {
    completed: [
      { id: "verifyProd", label: "Verifikasi production", capability: "verify" },
      { id: "logs", label: "Lihat deployment log", capability: "logs" },
      { id: "smoke", label: "Jalankan smoke test", capability: "smoke" },
    ],
  },
};

/** Generic fallback when no taskType / no registry entry / no capabilities. */
const GENERIC_ACTIONS: AgentAction[] = [
  { id: "explain", label: "Jelaskan lebih detail" },
  { id: "next", label: "Apa langkah berikutnya?" },
  { id: "example", label: "Berikan contoh" },
];

/* ─────────────────────────────────────────────────────────────────────────
 * Next-step extraction from the assistant's own reply
 *
 * When the assistant closes a turn with "Langkah selanjutnya: 1. … 2. …",
 * THOSE are the right follow-up suggestions — not canned registry labels.
 * The server runs this over the final message text and puts the result in
 * `suggestedActions`, which `resolveActions` prioritizes. Deterministic
 * parsing, no extra LLM call.
 * ────────────────────────────────────────────────────────────────────── */

/** A line that introduces a list of next steps / options. */
const NEXT_STEP_CUE =
  /(langkah\s+(selanjutnya|berikut)|next\s+steps?|selanjutnya|berikutnya|rekomendasi|saran|opsi|pilihan|setelah\s+ini|(kamu|anda)\s+bisa|bisa\s+(di)?lanjut|mau\s+lanjut|lanjutannya|mau\s+(aku|saya)\s+bantu|atau\s+kita|saya\s+bisa|aku\s+bisa|bisa\s+juga)/i;

/**
 * A single spoken offer sentence, e.g. "Mau aku bantu merapikan X?",
 * "Atau kita coba deploy sekarang?", "Saya bisa tambahkan testnya."
 * These are the most common way the agent offers a next step — one
 * sentence, not a bulleted list — and were previously missed entirely,
 * dropping the UI to generic fallbacks.
 */
const SPOKEN_OFFER_RE =
  /^(?:mau\s+(?:aku|saya)\s+bantu|atau\s+kita|saya\s+bisa|aku\s+bisa|kamu\s+bisa|anda\s+bisa|mau\s+(?:aku|saya)|bagaimana\s+kalau|gimana\s+kalau)\s+(.+?)\??$/i;

const LIST_ITEM_RE = /^\s*(?:[-*•]|\d{1,2}[.)])\s+(.*)$/;

/** An offer-question closing the message ("Mau saya lanjutkan?"). */
const OFFER_QUESTION_RE = /(mau|ingin|apakah|perlu|boleh|lanjut)/i;

function cleanActionLabel(raw: string): string | null {
  let label = raw
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → text
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // A long "Title — long explanation" item keeps just the actionable title.
  if (label.length > 64) {
    const cut = label.split(/\s+[—–]\s+/)[0];
    if (cut.length >= 8) label = cut.trim();
  }
  if (label.length > 64) {
    const cut = label.split(/:\s+/)[0];
    if (cut.length >= 8) label = cut.trim();
  }
  label = label.replace(/[.,;:]+$/, "").trim();
  if (label.length < 4 || label.length > 80) return null;
  return label;
}

/**
 * Pull concrete follow-up suggestions out of the assistant's final text.
 *
 * Looks at the message tail for the LAST list block whose introducing line
 * reads like a next-step cue and returns up to 3 cleaned items. If there is
 * no such list but the message closes with an offer question, suggests a
 * plain "Ya, lanjutkan". Returns [] when nothing trustworthy is found —
 * callers then fall back to the registry.
 */
export function extractSuggestedActions(text: string | null | undefined): string[] {
  if (!text) return [];
  const lines = text.slice(-2000).split("\n");

  // Collect [start, end) ranges of consecutive list items.
  const blocks: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    if (!LIST_ITEM_RE.test(lines[i])) continue;
    const start = i;
    while (i + 1 < lines.length && LIST_ITEM_RE.test(lines[i + 1])) i++;
    blocks.push({ start, end: i + 1 });
  }

  // Last block introduced by a next-step cue wins.
  for (let b = blocks.length - 1; b >= 0; b--) {
    const { start, end } = blocks[b];
    let intro = "";
    for (let j = start - 1; j >= 0; j--) {
      const candidate = lines[j].trim();
      if (candidate) {
        intro = candidate;
        break;
      }
    }
    if (!NEXT_STEP_CUE.test(intro)) continue;

    const labels: string[] = [];
    for (let j = start; j < end && labels.length < 3; j++) {
      const item = lines[j].match(LIST_ITEM_RE)?.[1] ?? "";
      const label = cleanActionLabel(item);
      if (label && !labels.includes(label)) labels.push(label);
    }
    if (labels.length > 0) return labels;
  }

  // No usable list. Scan the last few non-empty lines for a SPOKEN OFFER
  // ("Mau aku bantu…", "Atau kita…") — the agent's most natural way to
  // suggest a next step. Collect up to 2 distinct offers as tappable
  // follow-ups instead of collapsing to a bare "Ya, lanjutkan".
  const tail = lines
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-4);
  const spokenOffers: string[] = [];
  for (const line of tail) {
    const m = line.match(SPOKEN_OFFER_RE);
    if (m) {
      const label = cleanActionLabel(line.replace(/\?\s*$/, ""));
      if (label && !spokenOffers.includes(label)) spokenOffers.push(label);
    }
    if (spokenOffers.length >= 2) break;
  }
  if (spokenOffers.length > 0) return spokenOffers;

  // No offer phrasing either — but a closing offer question still deserves
  // one tap.
  const lastLine = tail[tail.length - 1] ?? "";
  if (/\?\s*$/.test(lastLine) && OFFER_QUESTION_RE.test(lastLine)) {
    return ["Ya, lanjutkan"];
  }

  return [];
}

/**
 * Resolve the follow-up actions for a given agent state.
 *
 * Priority:
 *  1. If the state carries `suggestedActions` (extracted from the reply or
 *     sent by the planner), use them as-is.
 *  2. Else look up ActionRegistry[taskType][status]; if `nextCapabilities` is
 *     present, filter to actions whose `capability` is in that set; if that
 *     yields nothing, fall back to the unfiltered registry list.
 *  3. Else (unknown taskType / empty registry) use GENERIC_ACTIONS.
 *
 * Capped at 3 — follow-ups are a nudge, not a menu.
 */
export function resolveActions(state: AgentCompletionState | null | undefined): AgentAction[] {
  if (!state) return GENERIC_ACTIONS.slice(0, 3);

  // 1. Extracted/planner-provided explicit actions win.
  if (Array.isArray(state.suggestedActions) && state.suggestedActions.length > 0) {
    const fromPlanner = state.suggestedActions.slice(0, 3).map((label, i) => ({
      id: `planner-${i}`,
      label,
    }));
    return fromPlanner;
  }

  // 2. Registry lookup by taskType + status.
  const statusActions = ActionRegistry[state.taskType]?.[state.status];
  if (statusActions && statusActions.length > 0) {
    const caps = state.nextCapabilities;
    if (caps && caps.length > 0) {
      const filtered = statusActions.filter(
        (a) => !a.capability || caps.includes(a.capability),
      );
      if (filtered.length > 0) return filtered.slice(0, 3);
    }
    return statusActions.slice(0, 3);
  }

  // 3. Fallback.
  return GENERIC_ACTIONS.slice(0, 3);
}

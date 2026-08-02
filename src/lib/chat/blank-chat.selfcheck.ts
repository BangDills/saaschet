import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Structural guard for the "new chat inherits the old repo" bug.
 *
 * There is no React harness in this repo, so a unit test of the component
 * would be theatre. What actually recurs here is structural: someone adds
 * another path that blanks the chat panel and forgets one of the resets. It
 * had already happened twice — the new-chat button cleared the project but not
 * the repo, and deleting the open conversation cleared neither.
 *
 * The consequence is not cosmetic. `repo` is what flips a turn into agent mode
 * (3 credits base instead of 1, plus per tool call), and the inherited repo is
 * written onto the conversation on first send, so the wrong association sticks
 * every time that chat is reopened. Nothing on screen shows it.
 *
 * So this asserts the shape instead: exactly one place may open a blank panel,
 * and that place must forget the conversation-scoped state.
 */

const PAGE = fileURLToPath(
  new URL("../../app/(dashboard)/ai-chat/page.tsx", import.meta.url),
);
const src = readFileSync(PAGE, "utf8");

let checks = 0;
function check(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  checks++;
}

/* ── Only one path may blank the panel ────────────────────────────────────── */

// `freshPanel` without parens is the useState initialiser and is fine, and the
// declaration is obviously not a call — hence the lookbehind. A real CALL
// creates a blank panel and must live inside blankChat.
const calls = src.match(/(?<!function )freshPanel\(\)/g) ?? [];
check(
  calls.length === 1,
  `freshPanel() must be called from exactly one place (found ${calls.length}). ` +
    "A new blank-chat path has to go through blankChat, or it will inherit the previous repo.",
);

check(/function blankChat\(\)/.test(src), "blankChat exists");

/* ── That path must forget conversation-scoped state ──────────────────────── */

const start = src.indexOf("function blankChat()");
check(start >= 0, "blankChat is findable");
// Body runs to the next function declaration at the same indentation.
const after = src.slice(start);
const end = after.indexOf("\n  function ", 1);
const body = end > 0 ? after.slice(0, end) : after;

check(body.includes("freshPanel()"), "blankChat is what opens the blank panel");
check(
  body.includes("setRepo(null)"),
  "blankChat must clear the repo — inheriting it silently enables agent mode",
);
check(
  body.includes("setActiveConvProjectId(null)"),
  "blankChat must clear the conversation's project",
);
check(body.includes("removeItem(LS_KEY)"), "blankChat must drop the remembered conversation id");

/* ── Restoring an existing conversation must still set the repo ───────────── */

// The fix must not have gone too far: opening a saved conversation has to put
// its repo back, otherwise agent chats silently downgrade to plain chat.
check(
  /setRepo\(conversation\.githubRepo \?\? null\)/.test(src),
  "opening a conversation still restores its own repo",
);

console.log(`PASS: ${checks} blank-chat structural checks`);

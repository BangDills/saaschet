import {
  resolveActions,
  type AgentCompletionState,
} from "./action-registry";
import {
  normalizeFollowUps,
  parseOptionsPayload,
  truncateMiddle,
} from "../chat/turn/follow-ups";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

let checks = 0;
function check(cond: unknown, msg: string): void {
  assert(cond, msg);
  checks++;
}

const base: Pick<AgentCompletionState, "objective" | "summary"> = {
  objective: "x",
  summary: "y",
};

/* ── resolveActions priority ─────────────────────────────────────────────── */

// No state at all: nothing to offer. This used to return three canned generic
// labels, which is exactly the behaviour we removed.
check(resolveActions(null).length === 0, "null state -> no actions");
check(resolveActions(undefined).length === 0, "undefined state -> no actions");

// Unknown taskType with no planner offers and no generated follow-ups: still
// nothing. Silence beats "Jelaskan lebih detail".
check(
  resolveActions({ ...base, taskType: "cooking", status: "completed" }).length === 0,
  "unknown taskType -> no actions",
);

// 1. Planner labels win, and each label doubles as its own message.
const planner = resolveActions({
  ...base,
  taskType: "git",
  status: "completed",
  suggestedActions: ["Merge PR #21", "Deploy ke production"],
  followUps: [{ label: "Diabaikan", message: "tidak dipakai" }],
});
check(planner.length === 2, "planner actions keep their count");
check(planner[0].label === "Merge PR #21", "planner actions win over follow-ups");
check(planner[0].message === "Merge PR #21", "planner label doubles as message");
check(planner[0].id === "planner-0", "planner ids are stable");

// Blank planner labels are dropped rather than rendered as empty chips.
const blankPlanner = resolveActions({
  ...base,
  taskType: "cooking",
  status: "completed",
  suggestedActions: ["   ", ""],
});
check(blankPlanner.length === 0, "blank planner labels -> no actions");

// 2. Generated follow-ups carry a separate send-on-tap message.
const generated = resolveActions({
  ...base,
  taskType: "cooking",
  status: "completed",
  followUps: [
    { label: "Tipiskan ring", message: "Tipiskan ring fokus composer jadi 1px." },
    { label: "Naikkan kontras", message: "Naikkan kontras ring fokus composer." },
  ],
});
check(generated.length === 2, "generated follow-ups resolve");
check(generated[0].label === "Tipiskan ring", "generated label preserved");
check(
  generated[0].message === "Tipiskan ring fokus composer jadi 1px.",
  "generated message is distinct from the label",
);
check(generated[0].id === "followup-0", "generated ids are stable");

// A follow-up missing its message still works — the label carries it.
const noMessage = resolveActions({
  ...base,
  taskType: "cooking",
  status: "completed",
  followUps: [{ label: "Lanjutkan audit", message: "   " }],
});
check(noMessage[0].message === "Lanjutkan audit", "empty message falls back to label");

// A SINGLE planner action still outranks generated follow-ups. The fixtures
// above all supply two, so the `length > 0` gate that enforces the priority was
// never pinned — raising it to `> 1` silently demoted one-action turns.
const onePlanner = resolveActions({
  ...base,
  taskType: "git",
  status: "completed",
  suggestedActions: ["Merge PR #21"],
  followUps: [{ label: "Diabaikan", message: "tidak dipakai" }],
});
check(onePlanner.length === 1, "a single planner action is still returned");
check(onePlanner[0].label === "Merge PR #21", "one planner action outranks follow-ups");

// Follow-ups arrive from a model, so malformed entries are a real input, not a
// hypothetical. They must be dropped — not crash the resolver. Relaxing the
// filter's `&&` to `||` lets a non-string label through to `.trim()`, which
// throws while rendering the chips; no fixture here had ever been malformed.
const malformed = resolveActions({
  ...base,
  taskType: "cooking",
  status: "completed",
  followUps: [
    null,
    undefined,
    { label: 42 },
    { label: null, message: "orphan" },
    { label: "  ", message: "blank" },
    { label: "Valid", message: "kirim ini" },
  ] as unknown as AgentCompletionState["followUps"],
});
check(malformed.length === 1, `malformed follow-ups are dropped (got ${malformed.length})`);
check(malformed[0].label === "Valid", "the one well-formed follow-up survives");

// One-character labels are legitimate; the length gates must be "non-empty",
// not "longer than one".
const shortLabel = resolveActions({
  ...base,
  taskType: "cooking",
  status: "completed",
  suggestedActions: ["Y"],
});
check(shortLabel.length === 1, "a one-character planner label is kept");

// 3. There is no third tier. A taskType that once had canned registry labels
// now yields nothing, which is the point: the inferred taskType "audit" used to
// offer "Perbaiki seluruh temuan audit" on a turn about image generation.
check(
  resolveActions({ ...base, taskType: "ui", status: "completed" }).length === 0,
  "known taskType alone -> no actions",
);
check(
  resolveActions({ ...base, taskType: "audit", status: "completed" }).length === 0,
  "audit taskType no longer yields canned labels",
);
check(
  resolveActions({
    ...base,
    taskType: "debugging",
    status: "completed",
    nextCapabilities: ["testing", "rootCause"],
  }).length === 0,
  "capabilities alone never synthesise actions",
);

// Cap: a nudge, not a menu.
const capped = resolveActions({
  ...base,
  taskType: "cooking",
  status: "completed",
  suggestedActions: ["a1", "b2", "c3", "d4", "e5", "f6"],
});
check(capped.length === 4, "actions capped at 4");

/* ── normalizeFollowUps shaping ──────────────────────────────────────────── */

check(normalizeFollowUps(null).length === 0, "null -> []");
check(normalizeFollowUps({}).length === 0, "missing options -> []");
check(normalizeFollowUps({ options: "nope" }).length === 0, "non-array options -> []");
check(normalizeFollowUps({ options: [] }).length === 0, "empty options -> []");

// Garbage entries are dropped, not rendered. "Oke" survives; "x" is under the
// 3-character floor and the last entry has no label at all.
check(
  normalizeFollowUps({
    options: [null, 42, { label: "Oke" }, { label: "x" }, { message: "no label" }],
  }).length === 1,
  "only well-formed entries survive",
);

// Markdown and stray punctuation are stripped from labels.
const cleaned = normalizeFollowUps({
  options: [{ label: "  **Tipiskan   ring**.  ", message: "  Tipiskan ring-nya.  " }],
});
check(cleaned[0].label === "Tipiskan ring", "label markdown and padding stripped");
check(cleaned[0].message === "Tipiskan ring-nya.", "message trimmed");

// Duplicate labels collapse case-insensitively.
const deduped = normalizeFollowUps({
  options: [
    { label: "Deploy", message: "Deploy sekarang" },
    { label: "deploy", message: "Deploy lagi" },
    { label: "Rollback", message: "Rollback rilis" },
  ],
});
check(deduped.length === 2, "duplicate labels collapse");
check(deduped[1].label === "Rollback", "distinct label kept");

// Over-long labels prefer the title before a separator.
const split = normalizeFollowUps({
  options: [
    {
      label: "Perbaiki ring — lalu jelaskan kenapa cascade Tailwind mengalahkan outline-none",
      message: "Perbaiki ring lalu jelaskan cascade-nya.",
    },
  ],
});
check(split[0].label === "Perbaiki ring", "long label splits on em dash");

// With no separator, it clips on a word boundary and marks the truncation.
const clipped = normalizeFollowUps({
  options: [
    {
      label:
        "Perbaiki seluruh temuan audit keamanan lalu jalankan regression test menyeluruh sekarang",
      message: "Perbaiki semua temuan audit lalu jalankan regression test.",
    },
  ],
});
check(clipped[0].label.length <= 49, "long label clipped to the cap");
check(clipped[0].label.endsWith("…"), "clipped label marks truncation");
check(!clipped[0].label.includes("  "), "clipped label has no double space");

// Never more than 4 survive.
check(
  normalizeFollowUps({
    options: [1, 2, 3, 4, 5, 6].map((n) => ({ label: `Opsi ${n}`, message: `Jalankan opsi ${n}` })),
  }).length === 4,
  "normalizer caps at 4",
);

// A missing message defaults to the label at normalize time too.
const defaulted = normalizeFollowUps({ options: [{ label: "Lanjutkan" }] });
check(defaulted[0].message === "Lanjutkan", "missing message defaults to label");

// End-to-end: normalizer output flows through the resolver.
const e2e = resolveActions({
  ...base,
  taskType: "cooking",
  status: "completed",
  followUps: normalizeFollowUps({
    options: [{ label: "Push ke main", message: "Push perubahan ini ke main lalu pantau CI." }],
  }),
});
check(e2e.length === 1, "normalized follow-ups reach the resolver");
check(
  e2e[0].message === "Push perubahan ini ke main lalu pantau CI.",
  "message survives the full path",
);

/* ── parseOptionsPayload: surviving reasoning output ─────────────────────── */

// This model emits <think> before answering, which is what made the first
// version return nothing on every turn.
const bare = parseOptionsPayload('{"options":[{"label":"Deploy","message":"Deploy sekarang"}]}');
check(normalizeFollowUps(bare).length === 1, "bare JSON parses");

const thought = parseOptionsPayload(
  '<think>User asked about image gen. I should offer the three features.</think>\n' +
    '{"options":[{"label":"Negative prompt","message":"Kerjakan fitur negative prompt."}]}',
);
check(normalizeFollowUps(thought)[0]?.label === "Negative prompt", "reasoning tag stripped");

const fenced = parseOptionsPayload(
  '```json\n{"options":[{"label":"Multi-provider","message":"Kerjakan multi-provider."}]}\n```',
);
check(normalizeFollowUps(fenced)[0]?.label === "Multi-provider", "code fence stripped");

// The killer case for a greedy first-brace-to-last-brace match: braces inside
// the reasoning would splice prose into the candidate and fail to parse.
const bracesInReasoning = parseOptionsPayload(
  '<think>Maybe emit { foo: 1 } or { bar: 2 } first, then decide.</think> ' +
    'Here you go: {"options":[{"label":"History preset","message":"Kerjakan history dan preset."}]} done',
);
check(
  normalizeFollowUps(bracesInReasoning)[0]?.label === "History preset",
  "braces in surrounding text do not break the parse",
);

// An unclosed think block (budget ran out mid-reasoning) yields nothing rather
// than throwing.
check(
  parseOptionsPayload("<think>thinking and thinking and never finishing") === null,
  "unterminated reasoning -> null",
);
check(parseOptionsPayload("") === null, "empty text -> null");
check(parseOptionsPayload(null) === null, "null text -> null");
check(parseOptionsPayload("no json here at all") === null, "prose only -> null");
check(parseOptionsPayload('{"options":[{"label":"broken"') === null, "truncated JSON -> null");

// An object that starts at index 0 but has prose glued straight onto its
// closing brace. Two separate steps have to be exact for this to work: the
// backscan for the opening brace must be able to reach index 0, and the slice
// must stop ON the closing brace. Neither was pinned — every fixture either put
// the object mid-string or left only whitespace after it, and JSON.parse
// tolerates trailing whitespace, so both off-by-ones passed the suite.
const gluedTail = parseOptionsPayload(
  '{"options":[{"label":"Deploy","message":"Deploy sekarang"}]}. Semoga membantu.',
);
check(
  normalizeFollowUps(gluedTail).length === 1,
  "object at index 0 with prose glued to the closing brace still parses",
);

// Asked for {"options":[…]}, models sometimes return the bare list instead.
const bareArray = parseOptionsPayload('[{"label":"Rollback","message":"Rollback rilis."}]');
check(normalizeFollowUps(bareArray).length === 1, "bare array is accepted");

// Full path: raw reasoning response -> parse -> normalize -> resolve.
const fullPath = resolveActions({
  ...base,
  taskType: "audit",
  status: "completed",
  followUps: normalizeFollowUps(
    parseOptionsPayload(
      '<think>Three options were offered.</think>{"options":[' +
        '{"label":"Negative prompt","message":"Kerjakan negative prompt dulu."},' +
        '{"label":"Multi-provider","message":"Kerjakan multi-provider dulu."}]}',
    ),
  ),
});
check(fullPath.length === 2, "raw reasoning response reaches the resolver");
check(
  fullPath[0].message === "Kerjakan negative prompt dulu.",
  "generated message survives the full path",
);

/* ── truncateMiddle: keep the offer, which lives at the end ──────────────── */

// Under the cap, nothing is touched.
check(truncateMiddle("Singkat saja.", 100) === "Singkat saja.", "short text passes through");

// Code blocks are collapsed the same way the head-only truncator does it, so a
// turn that wrote three files does not ship its diff into the prompt.
check(
  truncateMiddle("Ini patch-nya:\n```ts\nconst a = 1;\n```\nSudah.", 100) ===
    "Ini patch-nya:\n[code block]\nSudah.",
  "code block collapsed",
);

// The point of this function: over the cap, BOTH ends survive. A plain
// slice(0, maxLen) would keep only "AWAL" and drop the closing offer, which is
// the highest-signal input the follow-up generator has.
const long = `AWAL objektifnya${"x".repeat(4000)}Mau saya lanjutkan ke AKHIR?`;
const cut = truncateMiddle(long, 1200);
check(cut.startsWith("AWAL objektifnya"), "opening survives truncation");
check(cut.endsWith("Mau saya lanjutkan ke AKHIR?"), "closing offer survives truncation");
check(cut.includes("omitted"), "truncation is marked");

// The cap is a real budget: the text kept never exceeds it (the marker is
// bookkeeping on top, not payload).
check(cut.length <= 1200 + 40, "kept text stays within the budget");

// Weighted toward the tail, because the ending matters more here.
const [headPart, tailPart] = cut.split("[… middle of reply omitted …]");
check(
  tailPart.trim().length > headPart.trim().length,
  "tail gets more budget than head",
);

// A reply exactly at the cap is not truncated — off-by-one guard.
const exact = "y".repeat(1200);
check(truncateMiddle(exact, 1200) === exact, "text exactly at the cap is untouched");

console.log(`PASS: ${checks} follow-up resolver, normalizer, parser, and truncation checks`);

/**
 * Selfcheck for splitStreamingSegments. Run with:
 *   npx tsx src/components/chat/markdown-segments.selfcheck.ts
 */
import { splitStreamingSegments } from "./markdown-segments";

let failures = 0;
let checks = 0;

function assert(name: string, condition: boolean) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${name}`);
  }
}

function assertEqual<T>(name: string, actual: T, expected: T) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.error(`  ✗ ${name}\n    expected ${e}\n    actual   ${a}`);
  }
}

// ── Basic splitting ────────────────────────────────────────────────────────
assertEqual("empty string → one empty segment", splitStreamingSegments(""), [""]);
assertEqual(
  "no headings → single segment",
  splitStreamingSegments("plain paragraph\n\nanother one"),
  ["plain paragraph\n\nanother one"],
);
assertEqual(
  "splits before each heading",
  splitStreamingSegments("# Title\nintro\n## A\nbody a\n## B\nbody b"),
  ["# Title\nintro", "## A\nbody a", "## B\nbody b"],
);
assertEqual(
  "heading on first line does not create a leading empty segment",
  splitStreamingSegments("# Only\ntext"),
  ["# Only\ntext"],
);
assertEqual(
  "content before the first heading stays its own segment",
  splitStreamingSegments("preamble\n# H\ntext"),
  ["preamble", "# H\ntext"],
);

// ── Fence awareness ────────────────────────────────────────────────────────
assertEqual(
  "does not split on # lines inside a code fence",
  splitStreamingSegments("## Code\n```bash\n# a comment\n## not a heading\n```\nafter"),
  ["## Code\n```bash\n# a comment\n## not a heading\n```\nafter"],
);
assertEqual(
  "splits again after the fence closes",
  splitStreamingSegments("## Code\n```py\n# comment\n```\n## Next\ntext"),
  ["## Code\n```py\n# comment\n```", "## Next\ntext"],
);
assert(
  "unclosed fence at the stream tail swallows later headings (no mid-fence split)",
  splitStreamingSegments("## Code\n```\n# inside\n## also inside").length === 1,
);
assertEqual(
  "tilde fences are respected too",
  splitStreamingSegments("## A\n~~~\n# x\n~~~\n## B"),
  ["## A\n~~~\n# x\n~~~", "## B"],
);

// ── Losslessness: joining segments reproduces the input ────────────────────
const samples = [
  "# PRD\n**Product Name**: X\n\n## Fitur\n| a | b |\n|---|---|\n| 1 | 2 |\n\n## NFR\n- satu\n- dua",
  "text\n\n```js\nconst a = 1;\n# not heading\n```\n\n### Sub\ndone\n",
  "",
  "#not-a-heading (no space)\nstill one segment",
];
for (const sample of samples) {
  assertEqual(
    `lossless round-trip (${sample.slice(0, 20).replace(/\n/g, "⏎")}…)`,
    splitStreamingSegments(sample).join("\n"),
    sample,
  );
}

// "#not-a-heading" without a space must not split (matches CommonMark ATX rule).
assertEqual(
  "hash without space is not a heading",
  splitStreamingSegments("intro\n#tag stuff\nmore"),
  ["intro\n#tag stuff\nmore"],
);

// ── Streaming stability: earlier segments never change as content grows ────
const full =
  "# PRD\nintro\n## Satu\nisi satu\n## Dua\nisi dua\n```\n## bukan heading\n```\n## Tiga\nisi tiga";
let previous: string[] = [];
let stable = true;
for (let cut = 1; cut <= full.length; cut++) {
  const segments = splitStreamingSegments(full.slice(0, cut));
  for (let i = 0; i < previous.length - 1 && i < segments.length - 1; i++) {
    if (segments[i] !== previous[i]) stable = false;
  }
  previous = segments;
}
assert("completed segments stay byte-identical while the tail grows", stable);

if (failures > 0) {
  console.error(`markdown-segments selfcheck: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`markdown-segments selfcheck: ${checks} checks passed`);

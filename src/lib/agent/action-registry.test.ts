import { resolveActions, type AgentCompletionState } from "./action-registry";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const cases: Array<{ name: string; state: AgentCompletionState | null; expectFirst: string; expectLenMin: number }> = [
  {
    name: "null -> generic",
    state: null,
    expectFirst: "Jelaskan lebih detail",
    expectLenMin: 1,
  },
  {
    name: "audit completed -> fix first",
    state: {
      taskType: "audit",
      status: "completed",
      objective: "Audit codebase",
      summary: "14 issue",
      nextCapabilities: ["fix", "security"],
    },
    expectFirst: "Perbaiki seluruh temuan audit",
    expectLenMin: 2,
  },
  {
    name: "ui completed -> responsive first",
    state: {
      taskType: "ui",
      status: "completed",
      objective: "UI work",
      summary: "done",
    },
    expectFirst: "Optimalkan tampilan mobile",
    expectLenMin: 3,
  },
  {
    name: "debugging completed with caps filter",
    state: {
      taskType: "debugging",
      status: "completed",
      objective: "debug",
      summary: "found",
      nextCapabilities: ["testing", "rootCause"],
    },
    expectFirst: "Buat regression test",
    expectLenMin: 2,
  },
  {
    name: "unknown taskType -> generic fallback",
    state: {
      taskType: "cooking",
      status: "completed",
      objective: "x",
      summary: "y",
    },
    expectFirst: "Jelaskan lebih detail",
    expectLenMin: 1,
  },
  {
    name: "planner suggestedActions override registry",
    state: {
      taskType: "audit",
      status: "completed",
      objective: "x",
      summary: "y",
      suggestedActions: ["Custom A", "Custom B"],
    },
    expectFirst: "Custom A",
    expectLenMin: 2,
  },
  {
    name: "git completed -> merge first",
    state: {
      taskType: "git",
      status: "completed",
      objective: "git",
      summary: "pr opened",
    },
    expectFirst: "Merge ke main",
    expectLenMin: 3,
  },
];

let pass = 0;
for (const c of cases) {
  const out = resolveActions(c.state);
  assert(out.length >= c.expectLenMin, `${c.name}: len ${out.length} < ${c.expectLenMin}`);
  assert(out[0].label === c.expectFirst, `${c.name}: first "${out[0].label}" !== "${c.expectFirst}"`);
  pass++;
}
console.log(`PASS: ${pass}/${cases.length} resolver cases`);

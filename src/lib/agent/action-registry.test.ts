import {
  extractSuggestedActions,
  resolveActions,
  type AgentCompletionState,
} from "./action-registry";

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

// ── extractSuggestedActions ────────────────────────────────────────────────

const extractCases: Array<{ name: string; text: string; expect: string[] }> = [
  {
    name: "numbered next steps after Indonesian cue",
    text:
      "Scaffold selesai dan build hijau.\n\nLangkah selanjutnya:\n1. **Lanjut edit halaman booking**\n2. Tambah validasi form dengan Zod\n3. Deploy preview ke Vercel\n",
    expect: [
      "Lanjut edit halaman booking",
      "Tambah validasi form dengan Zod",
      "Deploy preview ke Vercel",
    ],
  },
  {
    name: "bulleted options after 'kamu bisa'",
    text:
      "PR sudah dibuka.\n\nSetelah ini kamu bisa:\n- Review perubahan di GitHub\n- Merge ke main\n",
    expect: ["Review perubahan di GitHub", "Merge ke main"],
  },
  {
    name: "caps at 3 items",
    text:
      "Berikutnya:\n1. Satu dua tiga\n2. Empat lima enam\n3. Tujuh delapan\n4. Sembilan sepuluh\n",
    expect: ["Satu dua tiga", "Empat lima enam", "Tujuh delapan"],
  },
  {
    name: "long item keeps title before em-dash",
    text:
      "Langkah berikutnya:\n1. Integrasi pembayaran — hubungkan Midtrans, buat webhook handler, lalu uji sandbox end-to-end\n",
    expect: ["Integrasi pembayaran"],
  },
  {
    name: "spoken offer with a concrete action is captured as-is",
    text: "Phase 1 selesai dan sudah saya push.\n\nMau saya lanjutkan ke Phase 2?",
    expect: ["Mau saya lanjutkan ke Phase 2"],
  },
  {
    name: "offer question without a concrete offer → Ya, lanjutkan",
    text: "Semua audit selesai.\n\nMau lanjut?",
    expect: ["Ya, lanjutkan"],
  },
  {
    name: "summary list of finished work is NOT suggested",
    text:
      "Yang sudah saya kerjakan:\n- Setup project\n- Buat schema database\n\nSemua selesai tanpa error.",
    expect: [],
  },
  {
    name: "plain answer without steps → nothing",
    text: "Next.js adalah framework React untuk aplikasi web production.",
    expect: [],
  },
  {
    name: "markdown links and emphasis stripped",
    text:
      "Rekomendasi selanjutnya:\n- Baca [dokumentasi Supabase](https://supabase.com/docs) tentang RLS\n- Aktifkan **row level security** di tabel booking\n",
    expect: [
      "Baca dokumentasi Supabase tentang RLS",
      "Aktifkan row level security di tabel booking",
    ],
  },
];

let extractPass = 0;
for (const c of extractCases) {
  const out = extractSuggestedActions(c.text);
  assert(
    JSON.stringify(out) === JSON.stringify(c.expect),
    `${c.name}: got ${JSON.stringify(out)}, expected ${JSON.stringify(c.expect)}`,
  );
  extractPass++;
}

// End-to-end: extracted suggestions flow through resolveActions as priority 1.
const resolved = resolveActions({
  taskType: "git",
  status: "completed",
  objective: "x",
  summary: "y",
  suggestedActions: extractSuggestedActions("Langkah selanjutnya:\n1. Merge PR\n2. Deploy"),
});
assert(resolved[0].label === "Merge PR", "extracted actions win over registry");
assert(resolved.length === 2, "resolver keeps extracted count");

console.log(`PASS: ${extractPass}/${extractCases.length} extractor cases (+2 e2e checks)`);

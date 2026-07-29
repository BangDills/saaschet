/**
 * Selfcheck for the structured logger. Run with:
 *   npx tsx src/lib/logger.selfcheck.ts
 */
import { createLogger } from "./logger";

let failures = 0;
let checks = 0;

function assert(name: string, condition: boolean) {
  checks++;
  if (!condition) {
    failures++;
    process.stderr.write(`  ✗ ${name}\n`);
  }
}

/** Run `fn` with console captured; returns the lines it emitted. */
function capture(fn: () => void): string[] {
  const lines: string[] = [];
  const sinks = ["log", "warn", "error"] as const;
  const originals = sinks.map((s) => console[s]);
  for (const sink of sinks) {
    console[sink] = (...args: unknown[]) => {
      lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    };
  }
  try {
    fn();
  } finally {
    sinks.forEach((sink, i) => {
      console[sink] = originals[i];
    });
  }
  return lines;
}

function parse(line: string): Record<string, unknown> {
  return JSON.parse(line) as Record<string, unknown>;
}

const savedLevel = process.env.LOG_LEVEL;
const savedPretty = process.env.LOG_PRETTY;
delete process.env.LOG_PRETTY;
delete process.env.LOG_LEVEL;

// ── Shape ──────────────────────────────────────────────────────────────────
{
  const log = createLogger("sandbox");
  const [line] = capture(() => log.info("created", { sandboxId: "abc", cpu: 2 }));
  const rec = parse(line);
  assert("emits one JSON line", typeof line === "string" && line.startsWith("{"));
  assert("scope", rec.scope === "sandbox");
  assert("level", rec.level === "info");
  assert("msg", rec.msg === "created");
  assert("fields are top-level", rec.sandboxId === "abc" && rec.cpu === 2);
  assert("has timestamp", typeof rec.ts === "string" && rec.ts.includes("T"));
}

// ── Levels ─────────────────────────────────────────────────────────────────
{
  const log = createLogger("chat");
  assert("debug suppressed at default level", capture(() => log.debug("x")).length === 0);
  assert("info emitted at default level", capture(() => log.info("x")).length === 1);

  process.env.LOG_LEVEL = "debug";
  assert("debug emitted when LOG_LEVEL=debug", capture(() => log.debug("x")).length === 1);
  process.env.LOG_LEVEL = "error";
  assert("warn suppressed when LOG_LEVEL=error", capture(() => log.warn("x")).length === 0);
  assert("error still emitted", capture(() => log.error("x")).length === 1);
  delete process.env.LOG_LEVEL;

  process.env.LOG_LEVEL = "nonsense";
  assert("unknown LOG_LEVEL falls back to info", capture(() => log.debug("x")).length === 0);
  delete process.env.LOG_LEVEL;
}

// ── Bound context ──────────────────────────────────────────────────────────
{
  const base = createLogger("chat");
  const turn = base.with({ conversationId: "c1" });
  const rec = parse(capture(() => turn.info("persisted", { partsLen: 7 }))[0]);
  assert("bound field present", rec.conversationId === "c1");
  assert("call field present", rec.partsLen === 7);

  const nested = turn.with({ userId: "u1" });
  const rec2 = parse(capture(() => nested.info("x"))[0]);
  assert("with() chains", rec2.conversationId === "c1" && rec2.userId === "u1");

  const rec3 = parse(capture(() => base.info("x"))[0]);
  assert("with() does not mutate the parent", rec3.conversationId === undefined);

  const rec4 = parse(capture(() => turn.info("x", { conversationId: "override" }))[0]);
  assert("call fields override bound fields", rec4.conversationId === "override");
}

// ── Value handling ─────────────────────────────────────────────────────────
{
  const log = createLogger("t");
  const rec = parse(capture(() => log.error("boom", { err: new Error("kaboom") }))[0]);
  const err = rec.err as Record<string, unknown>;
  assert("Error is unwrapped, not {}", err?.message === "kaboom");
  assert("Error name kept", err?.name === "Error");
  assert("stack trimmed to a few frames", String(err?.stack ?? "").split("\n").length <= 4);

  const rec2 = parse(capture(() => log.info("x", { a: undefined, b: null, c: 0 }))[0]);
  assert("undefined fields dropped", !("a" in rec2));
  assert("null kept", rec2.b === null);
  assert("zero kept", rec2.c === 0);

  const circular: Record<string, unknown> = {};
  circular.self = circular;
  const lines = capture(() => log.info("circular", { circular }));
  assert("circular field does not throw", lines.length === 1);
}

// ── Pretty mode ────────────────────────────────────────────────────────────
{
  process.env.LOG_PRETTY = "1";
  const log = createLogger("chat");
  const [line] = capture(() => log.info("hello", { a: 1 }));
  assert("pretty mode is human-readable", line.startsWith("[chat] hello"));
  delete process.env.LOG_PRETTY;
}

if (savedLevel !== undefined) process.env.LOG_LEVEL = savedLevel;
if (savedPretty !== undefined) process.env.LOG_PRETTY = savedPretty;

if (failures > 0) {
  process.stderr.write(`logger selfcheck: ${failures}/${checks} FAILED\n`);
  process.exit(1);
}
process.stdout.write(`logger selfcheck: ${checks} checks passed\n`);

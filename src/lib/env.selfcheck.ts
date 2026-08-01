import { envNumber } from "./env";

/**
 * Guards the reason this helper exists: `Number(process.env.X) || fallback`
 * cannot express 0. Every assertion about the value 0 below fails against that
 * old expression, which is the point.
 */

let checks = 0;
function check(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  checks++;
}

const KEY = "SELFCHECK_ENV_VALUE";
function withEnv<T>(value: string | undefined, fn: () => T): T {
  const previous = process.env[KEY];
  if (value === undefined) delete process.env[KEY];
  else process.env[KEY] = value;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env[KEY];
    else process.env[KEY] = previous;
  }
}
const read = (raw: string | undefined, fallback: number, opts: Parameters<typeof envNumber>[2]) =>
  withEnv(raw, () => envNumber(KEY, fallback, opts));

const unit = { min: 0, max: 1 };
const minutes = { min: 0, max: 1440, integer: true } as const;

/* ── the whole point: 0 survives ─────────────────────────────────────────── */

check(read("0", 15, minutes) === 0, "explicit 0 is honoured, not replaced by the fallback");
check(read("0", 0.85, unit) === 0, "explicit 0 survives for float settings too");
check(read("0.0", 0.85, unit) === 0, '"0.0" parses to 0');

/* ── unset vs empty vs whitespace all mean "not configured" ──────────────── */

check(read(undefined, 15, minutes) === 15, "unset -> fallback");
check(read("", 15, minutes) === 15, "empty string -> fallback");
check(read("   ", 15, minutes) === 15, "whitespace-only -> fallback");

/* ── garbage falls back rather than reaching the caller as NaN ───────────── */

check(read("abc", 15, minutes) === 15, "non-numeric -> fallback");
check(read("Infinity", 15, minutes) === 15, "Infinity is not finite enough -> fallback");
check(read("NaN", 15, minutes) === 15, "NaN -> fallback");
check(Number.isFinite(read("abc", 15, minutes)), "never returns NaN");

/* ── integer mode rejects fractions instead of passing them downstream ───── */

check(read("2.5", 1, { min: 1, max: 16, integer: true }) === 1, "fractional vCPU -> fallback");
check(read("2", 1, { min: 1, max: 16, integer: true }) === 2, "whole vCPU accepted");
check(read("0.85", 0.5, unit) === 0.85, "fractions fine when integer mode is off");

/* ── clamping ────────────────────────────────────────────────────────────── */

check(read("99", 2, { min: 1, max: 64, integer: true }) === 64, "above max clamps to max");
check(read("-5", 15, minutes) === 0, "below min clamps to min");
check(read("2", 0.85, unit) === 1, "float above max clamps");
check(read("1440", 15, minutes) === 1440, "max itself is allowed");
check(read("1", 0.85, unit) === 1, "boundary value is not clamped away");

/* ── real call sites, spelled out ────────────────────────────────────────── */

// Disabling the sandbox reaper used to be impossible.
check(read("0", 15, minutes) === 0, "DAYTONA_SANDBOX_AUTOSTOP_MINUTES=0 disables auto-stop");
// Dedupe threshold 0 means "treat everything as a duplicate" — drastic, but
// the operator's call to make.
check(read("0", 0.85, unit) === 0, "MEMORY_DEDUPE_THRESHOLD=0 is reachable");

/* ── leading/trailing space around a real value is tolerated ─────────────── */

check(read(" 7 ", 15, minutes) === 7, "surrounding whitespace does not break parsing");

console.log(`PASS: ${checks} env reader checks`);

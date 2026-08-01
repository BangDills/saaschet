import { createLogger } from "./logger";

const log = createLogger("env");

/**
 * Numeric environment variables, read so that 0 is actually expressible.
 *
 * The pattern this replaces was `Number(process.env.X) || fallback`, repeated
 * in five places. It cannot express zero, because 0 is falsy: setting
 * DAYTONA_SANDBOX_AUTOSTOP_MINUTES=0 to disable the reaper silently produced
 * 15, and MEMORY_DEDUPE_THRESHOLD=0 silently produced 0.85. Both looked
 * applied — nothing in the logs said otherwise — which is the worst shape a
 * configuration bug can take.
 *
 * It is also silently permissive in the other direction: a typo lands on the
 * default, and `DAYTONA_SANDBOX_CPU=2.5` would have been handed to Daytona as
 * a fractional vCPU count. Both now say so at warn level.
 */
type NumericEnvOptions = {
  min: number;
  max: number;
  /** Reject fractional values rather than passing them downstream. */
  integer?: boolean;
};

export function envNumber(key: string, fallback: number, opts: NumericEnvOptions): number {
  const raw = process.env[key];

  // Unset and empty are both "not configured". Clearing a field in a hosting
  // dashboard leaves an empty string behind, and that is how someone unsets a
  // value — not how they ask for 0. Asking for 0 means writing "0".
  if (raw === undefined || raw.trim() === "") return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    log.warn("env value is not a number — using fallback", { key, raw, fallback });
    return fallback;
  }
  if (opts.integer && !Number.isInteger(parsed)) {
    log.warn("env value must be a whole number — using fallback", { key, raw, fallback });
    return fallback;
  }

  const clamped = Math.min(Math.max(parsed, opts.min), opts.max);
  if (clamped !== parsed) {
    log.warn("env value out of range — clamped", {
      key,
      raw,
      min: opts.min,
      max: opts.max,
      used: clamped,
    });
  }
  return clamped;
}

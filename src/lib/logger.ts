/**
 * Structured logging.
 *
 * Production debugging happens by reading container logs, and free-form
 * `console.log("[chat] thing", {...})` lines are painful to filter or grep
 * across a busy multi-user stream. Every line emitted here is one JSON object
 * with a stable shape:
 *
 *   {"ts":"…","level":"info","scope":"sandbox","msg":"created","sandboxId":"…"}
 *
 * so a log viewer can filter by scope/level and correlate a whole turn by
 * conversationId. Set LOG_PRETTY=1 for human-readable lines in local dev.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function minLevel(): number {
  const configured = (process.env.LOG_LEVEL ?? "").toLowerCase();
  if (configured in LEVEL_RANK) return LEVEL_RANK[configured as LogLevel];
  return LEVEL_RANK.info;
}

function pretty(): boolean {
  return process.env.LOG_PRETTY === "1";
}

/** Errors do not survive JSON.stringify — unwrap them to something readable. */
function normalize(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      // A stack is worth keeping for unexpected errors, but it is noise for
      // the expected ones (aborts, rate limits) that callers log at warn.
      stack: value.stack?.split("\n").slice(0, 4).join("\n"),
    };
  }
  return value;
}

function emit(level: LogLevel, scope: string, msg: string, fields?: LogFields): void {
  if (LEVEL_RANK[level] < minLevel()) return;

  const normalized: LogFields = {};
  for (const [key, value] of Object.entries(fields ?? {})) {
    if (value !== undefined) normalized[key] = normalize(value);
  }

  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;

  if (pretty()) {
    const rest = Object.keys(normalized).length > 0 ? normalized : "";
    sink(`[${scope}] ${msg}`, rest);
    return;
  }

  try {
    sink(
      JSON.stringify({
        ts: new Date().toISOString(),
        level,
        scope,
        msg,
        ...normalized,
      }),
    );
  } catch {
    // Circular field somewhere — never let logging break a request.
    sink(`[${scope}] ${msg} <unserializable fields>`);
  }
}

export type Logger = {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** Derive a logger that stamps every line with extra fields. */
  with(fields: LogFields): Logger;
};

/**
 * Create a logger for one subsystem.
 *
 *   const log = createLogger("sandbox");
 *   log.info("created", { sandboxId, snapshot });
 *
 * Bind per-turn context once and let every later line carry it:
 *
 *   const turnLog = log.with({ conversationId, userId });
 */
export function createLogger(scope: string, bound: LogFields = {}): Logger {
  const merge = (fields?: LogFields) =>
    Object.keys(bound).length > 0 ? { ...bound, ...fields } : fields;

  return {
    debug: (msg, fields) => emit("debug", scope, msg, merge(fields)),
    info: (msg, fields) => emit("info", scope, msg, merge(fields)),
    warn: (msg, fields) => emit("warn", scope, msg, merge(fields)),
    error: (msg, fields) => emit("error", scope, msg, merge(fields)),
    with: (fields) => createLogger(scope, { ...bound, ...fields }),
  };
}

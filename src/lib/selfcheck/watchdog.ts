/**
 * Completion guard for the async selfchecks. Test-only; nothing in the app
 * imports this.
 *
 * The async suites used to end with `void main()`. A thrown assertion still
 * surfaced (an unhandled rejection exits non-zero), but a suite that STALLED
 * did not: when the event loop empties with a promise still pending, Node exits
 * 0 and the runner sees a pass. It printed no PASS line and nobody noticed,
 * because `&&`-chained `npm test` only looks at exit codes.
 *
 * That is the worst possible blind spot for these particular suites. Inverting
 * one guard in endRun — so a finished run never closes its subscribers — makes
 * run-registry's selfcheck hang on `reader.read()` and report success. A stream
 * that never closes is precisely the bug the run registry exists to prevent.
 *
 * So: hold the loop open with a timer, and treat "did not finish" as a failure
 * with the same weight as a failed assertion.
 */

const DEFAULT_TIMEOUT_MS = 20_000;

export function runSelfcheck(
  main: () => Promise<void>,
  name: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): void {
  const watchdog = setTimeout(() => {
    console.error(
      `FAIL: ${name} stalled — it did not finish within ${timeoutMs}ms. ` +
        "A pending promise makes Node exit 0, so without this guard a hung " +
        "suite is indistinguishable from a passing one.",
    );
    process.exit(1);
  }, timeoutMs);

  main()
    .then(() => {
      clearTimeout(watchdog);
    })
    .catch((err) => {
      clearTimeout(watchdog);
      console.error(`FAIL: ${name} threw`, err);
      process.exit(1);
    });
}

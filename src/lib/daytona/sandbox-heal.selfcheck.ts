import type { Sandbox } from "@daytona/sdk";
import { execCommand, isSandboxGone, type SandboxContext } from "./sandbox-tools";
import { runSelfcheck } from "../selfcheck/watchdog";

/**
 * Self-healing sandbox: control-flow regression checks.
 *
 * These exist because the first draft of healSandbox re-cloned inside its own
 * mutex, which deadlocked — a clone failure re-entered healSandbox, found the
 * in-flight `_healing` promise, and awaited the promise it was already running
 * inside. Nothing here talks to Daytona; the point is the decision tree.
 *
 * Every case runs under a hang detector, so a future deadlock fails the build
 * instead of silently wedging a turn in production.
 */

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

/** A Daytona 404 for a sandbox that no longer exists. */
function goneError(): Error {
  return Object.assign(
    new Error("not found: sandbox abc not found (it has been deleted)"),
    { statusCode: 404, errorCode: "NOT_FOUND" },
  );
}

type Behaviour = (command: string) => string | Error;

/** Minimal stand-in for a Daytona Sandbox — only what execCommand touches. */
function fakeSandbox(id: string, behaviour: Behaviour): Sandbox {
  return {
    id,
    process: {
      executeCommand: async (command: string) => {
        const result = behaviour(command);
        if (result instanceof Error) throw result;
        return { result, exitCode: 0 };
      },
    },
  } as unknown as Sandbox;
}

type TestContext = SandboxContext & { provisionCount: number; clonedInto: string[] };

function makeContext(first: Sandbox | null, replacements: Sandbox[]): TestContext {
  let next = 0;
  const ctx: TestContext = {
    sandbox: first,
    repoSlug: "owner/repo",
    githubToken: "token",
    // Pretend the repo is already cloned; a heal resets this and the retry
    // path clones again, which is what the assertions below watch for.
    repoCloned: true,
    provisionCount: 0,
    clonedInto: [],
    provisionSandbox: async () => {
      ctx.provisionCount++;
      const replacement = replacements[next++];
      if (!replacement) throw new Error("test ran out of replacement sandboxes");
      return replacement;
    },
  };
  return ctx;
}

const HANG_MS = 3000;

async function withHangDetector<T>(label: string, work: Promise<T>): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hang = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`HANG: ${label}`)), HANG_MS);
  });
  try {
    return await Promise.race([work, hang]);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("HANG:")) {
      console.error("FAIL:", err.message);
      process.exit(1);
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function expectThrow(label: string, work: Promise<unknown>): Promise<Error> {
  try {
    await withHangDetector(label, work);
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err));
  }
  console.error("FAIL:", `${label}: expected a throw, got success`);
  process.exit(1);
}

async function main(): Promise<void> {
  /* ── isSandboxGone: narrow on purpose ─────────────────────────────────── */

  check(isSandboxGone(goneError()), "404 NOT_FOUND is a lost sandbox");
  check(isSandboxGone({ statusCode: 404 }), "bare 404 counts");
  check(isSandboxGone({ errorCode: "NOT_FOUND" }), "bare NOT_FOUND counts");
  check(
    isSandboxGone(new Error("Sandbox xyz not found")),
    "message wording counts when no status is attached",
  );
  // The safety boundary: a sandbox dying MID-command must not look the same,
  // because replaying that command could run its side effects twice.
  check(!isSandboxGone(new Error("ECONNRESET")), "mid-command reset is NOT a lost sandbox");
  check(!isSandboxGone(new Error("command exited 1")), "a failing command is not a lost sandbox");
  check(!isSandboxGone({ statusCode: 500 }), "500 is not a lost sandbox");
  check(!isSandboxGone(null), "null is safe");
  check(!isSandboxGone("gone"), "non-object is safe");
  // The message test ANDs two substrings. Every negative case above contains
  // neither word, so relaxing that AND to an OR — which makes any message
  // merely mentioning a sandbox trigger a mid-turn replacement — passed the
  // entire suite. These two pin each half of it.
  check(
    !isSandboxGone(new Error("sandbox is still starting")),
    "a message that only mentions a sandbox is NOT a lost sandbox",
  );
  check(
    !isSandboxGone(new Error("branch main not found")),
    "a message that only says 'not found' is NOT a lost sandbox",
  );

  /* ── execCommand: heal, re-clone, retry once ──────────────────────────── */

  {
    const dead = fakeSandbox("dead", () => goneError());
    const fresh = fakeSandbox("fresh", () => "ok");
    const ctx = makeContext(dead, [fresh]);

    const response = await withHangDetector("heal and retry", execCommand(ctx, "cat file"));
    check(response?.result === "ok", "retry runs against the replacement");
    check(ctx.sandbox?.id === "fresh", "ctx.sandbox is swapped in place");
    check(ctx.provisionCount === 1, "provisioned exactly once");
    check(ctx.repoCloned === true, "repo is cloned into the replacement");
  }

  /* ── Parallel tool calls share one heal and one clone ─────────────────── */

  {
    const dead = fakeSandbox("dead", () => goneError());
    const fresh = fakeSandbox("fresh", () => "ok");
    const spare = fakeSandbox("spare", () => "ok");
    const ctx = makeContext(dead, [fresh, spare]);

    const [a, b] = (await withHangDetector(
      "concurrent heal",
      Promise.all([execCommand(ctx, "cmd a"), execCommand(ctx, "cmd b")]),
    )) ?? [];
    check(a?.result === "ok" && b?.result === "ok", "both concurrent calls succeed");
    check(ctx.provisionCount === 1, "concurrent failures provision once, not twice");
  }

  /* ── The deadlock case: the re-clone also loses its sandbox ───────────── */

  {
    const dead = fakeSandbox("dead", () => goneError());
    const alsoDead = fakeSandbox("also-dead", () => goneError());
    const ctx = makeContext(dead, [alsoDead, fakeSandbox("third", () => "ok")]);

    const err = await expectThrow("re-clone loses sandbox", execCommand(ctx, "cat file"));
    check(/lost twice/.test(err.message), "second loss throws rather than looping");
    check(ctx.provisionCount === 1, "no runaway provisioning");
  }

  /* ── Errors that must pass straight through ───────────────────────────── */

  {
    const flaky = fakeSandbox("flaky", () => new Error("ECONNRESET mid-command"));
    const ctx = makeContext(flaky, [fakeSandbox("unused", () => "ok")]);

    const err = await expectThrow("mid-command reset", execCommand(ctx, "npm run build"));
    check(/ECONNRESET/.test(err.message), "mid-command failure propagates unchanged");
    check(ctx.provisionCount === 0, "no heal for a command that may have run");
  }

  {
    const dead = fakeSandbox("dead", () => goneError());
    const ctx = makeContext(dead, []);
    delete ctx.provisionSandbox;

    const err = await expectThrow("no provisioner", execCommand(ctx, "ls"));
    check(/no provisioner/.test(err.message), "without a provisioner it fails as before");
  }

  /* ── A second loss after a successful heal ────────────────────────────── */

  {
    let healthy = true;
    const first = fakeSandbox("first", () => goneError());
    const second = fakeSandbox("second", () => (healthy ? "ok" : goneError()));
    const ctx = makeContext(first, [second, fakeSandbox("third", () => "ok")]);

    await withHangDetector("first heal", execCommand(ctx, "one"));
    check(ctx.sandbox?.id === "second", "healed onto the replacement");

    healthy = false;
    const err = await expectThrow("second loss", execCommand(ctx, "two"));
    check(/lost twice/.test(err.message), "a turn heals at most once");
    check(ctx.provisionCount === 1, "still only one provision for the whole turn");
  }

  /* ── Lazy provisioning: nothing starts until something runs ───────────── */

  // The whole point: a turn that never issues a command must never start a
  // machine. A review of a 4-file repo used to hold a 2 vCPU / 4 GB box for
  // 219.7s without sending it a single command.
  {
    const ctx = makeContext(null, [fakeSandbox("lazy", () => "ok")]);
    check(ctx.sandbox === null, "no sandbox before the first command");
    check(ctx.provisionCount === 0, "nothing provisioned on a read-only turn");
  }

  // The first command starts exactly one, and the route is told its id.
  {
    const created: string[] = [];
    const ctx = makeContext(null, [fakeSandbox("lazy", () => "ok")]);
    ctx.onSandboxCreated = (s) => created.push(s.id);

    const response = await withHangDetector("lazy first call", execCommand(ctx, "ls"));
    check(response?.result === "ok", "command runs against the lazily started box");
    check(ctx.provisionCount === 1, "provisioned exactly once");
    check(ctx.sandbox?.id === "lazy", "ctx.sandbox is filled in");
    // A sandbox the route never hears about is never deleted — it just bills.
    check(created.join() === "lazy", "the route is told what was created");
  }

  // Parallel first calls must share one provision, or a machine is orphaned
  // with nothing holding its id.
  {
    const created: string[] = [];
    const ctx = makeContext(null, [
      fakeSandbox("one", () => "ok"),
      fakeSandbox("two", () => "ok"),
      fakeSandbox("three", () => "ok"),
    ]);
    ctx.onSandboxCreated = (s) => created.push(s.id);

    await withHangDetector(
      "parallel lazy start",
      Promise.all([execCommand(ctx, "a"), execCommand(ctx, "b"), execCommand(ctx, "c")]),
    );
    check(ctx.provisionCount === 1, "three parallel calls start ONE sandbox");
    check(created.length === 1, "and announce it once");
  }

  // A lazily started sandbox still heals if it dies, and still heals only once.
  {
    const ctx = makeContext(null, [
      fakeSandbox("lazy-dead", () => goneError()),
      fakeSandbox("lazy-fresh", () => "ok"),
    ]);
    const response = await withHangDetector("lazy then heal", execCommand(ctx, "ls"));
    check(response?.result === "ok", "healing still works after a lazy start");
    check(ctx.provisionCount === 2, "one lazy start plus one heal");
    check(ctx.sandbox?.id === "lazy-fresh", "swapped onto the replacement");
  }

  // A failed first provision must be retryable, not poison every later call
  // with a rejected promise parked in the mutex.
  {
    let failFirst = true;
    const ctx = makeContext(null, [fakeSandbox("eventually", () => "ok")]);
    const inner = ctx.provisionSandbox!;
    ctx.provisionSandbox = async () => {
      if (failFirst) {
        failFirst = false;
        throw new Error("daytona quota exceeded");
      }
      return inner();
    };

    const err = await expectThrow("first provision fails", execCommand(ctx, "ls"));
    check(/quota/.test(err.message), "the provisioning failure surfaces");
    check(ctx.sandbox === null, "no half-built sandbox left behind");
    check(ctx._provisioning === undefined, "the mutex is released after a failure");

    const retry = await withHangDetector("retry after failure", execCommand(ctx, "ls"));
    check(retry?.result === "ok", "a later call can still start one");
  }

  // Without a provisioner there is nothing to start — fail clearly rather than
  // dereferencing null somewhere deeper.
  {
    const ctx = makeContext(null, []);
    ctx.provisionSandbox = undefined;
    const err = await expectThrow("no provisioner", execCommand(ctx, "ls"));
    check(/no provisioner/.test(err.message), "missing provisioner is explicit");
  }

  console.log(`PASS: ${checks} sandbox self-healing checks`);
}

runSelfcheck(main, "sandbox-heal selfcheck");

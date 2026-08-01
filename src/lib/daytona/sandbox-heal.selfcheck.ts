import type { Sandbox } from "@daytona/sdk";
import { execCommand, isSandboxGone, type SandboxContext } from "./sandbox-tools";

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

function makeContext(first: Sandbox, replacements: Sandbox[]): TestContext {
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

  /* ── execCommand: heal, re-clone, retry once ──────────────────────────── */

  {
    const dead = fakeSandbox("dead", () => goneError());
    const fresh = fakeSandbox("fresh", () => "ok");
    const ctx = makeContext(dead, [fresh]);

    const response = await withHangDetector("heal and retry", execCommand(ctx, "cat file"));
    check(response?.result === "ok", "retry runs against the replacement");
    check(ctx.sandbox.id === "fresh", "ctx.sandbox is swapped in place");
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
    check(ctx.sandbox.id === "second", "healed onto the replacement");

    healthy = false;
    const err = await expectThrow("second loss", execCommand(ctx, "two"));
    check(/lost twice/.test(err.message), "a turn heals at most once");
    check(ctx.provisionCount === 1, "still only one provision for the whole turn");
  }

  console.log(`PASS: ${checks} sandbox self-healing checks`);
}

void main();

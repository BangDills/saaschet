import type { Sandbox } from "@daytona/sdk";
import { getDaytonaClient } from "./client";
import { createLogger } from "@/lib/logger";

/**
 * Sandbox provisioning, extracted so it can be called twice.
 *
 * The chat route creates a sandbox at the start of an agent turn; the tools
 * need to create another one mid-turn when the first vanishes (Daytona reaps an
 * idle sandbox via autoStop, or infrastructure loses it). Two copies of this
 * branching would drift, so both paths call here.
 *
 * Deliberately create-only: no label lookup. A heal has just lost a sandbox,
 * and the lookup would happily hand back the very corpse it lost — the route
 * owns that lookup along with its staleness guards.
 */

const log = createLogger("sandbox");

export type ProvisionedSandbox = {
  sandbox: Sandbox;
  /** Resource figures the caller reports to the model in the system prompt. */
  cpu: number;
  memory: number;
  disk: number;
};

/**
 * Resource figures from env, with the defaults in one place.
 *
 * The route needs these for the system prompt even on a turn that adopts an
 * existing sandbox and never calls provisionSandbox, so they live here rather
 * than being read twice with defaults that could drift apart.
 */
export function sandboxResourceHints(): { cpu: number; memory: number; disk: number } {
  return {
    cpu: Number(process.env.DAYTONA_SANDBOX_CPU) || 1,
    memory: Number(process.env.DAYTONA_SANDBOX_MEMORY) || 2,
    disk: Number(process.env.DAYTONA_SANDBOX_DISK) || 5,
  };
}

/**
 * Create a fresh sandbox labelled for this conversation.
 *
 * Creation priority:
 *  1. Snapshot (DAYTONA_SANDBOX_SNAPSHOT) — a pre-provisioned snapshot from the
 *     sandbox dashboard. Fast (cached), and the snapshot already carries its own
 *     resources (e.g. 4 vCPU / 8 GiB), so heavy builds like `next build` won't
 *     OOM. No image pull, no resource param.
 *  2. Image (DAYTONA_SANDBOX_IMAGE) — custom image + resource env. Only a real,
 *     pullable image; the SDK accepts resources here.
 *  3. Fast language path — cached default container, small resources.
 */
export async function provisionSandbox(conversationId: string): Promise<ProvisionedSandbox> {
  const daytona = getDaytonaClient();

  const snapshotName = process.env.DAYTONA_SANDBOX_SNAPSHOT;
  const sandboxImage = process.env.DAYTONA_SANDBOX_IMAGE;
  const { cpu, memory, disk } = sandboxResourceHints();

  // One live sandbox per conversation. The label is what lets a later turn
  // adopt an orphan left by a crashed run instead of stacking a second sandbox
  // against the org's total-memory quota.
  const labels = { "celiuz-conversation": conversationId };
  // Minutes of idleness before Daytona stops a sandbox; autoDelete 0 then
  // removes it immediately. This is the orphan reaper — a turn deletes its own
  // sandbox when it ends, so anything this catches was abandoned by a crashed
  // run.
  //
  // Was 5, which also killed sandboxes belonging to LIVE turns: one created at
  // 00:03 was gone by 00:11 while its turn was still stalled, and every command
  // after that returned 404. Self-healing now survives that, but 15 minutes
  // stops provoking it. Raising this holds quota longer for genuine orphans,
  // so it is env-tunable without a deploy.
  const autoStopInterval = Number(process.env.DAYTONA_SANDBOX_AUTOSTOP_MINUTES) || 15;
  const autoDeleteInterval = 0;

  let sandbox: Sandbox;

  if (snapshotName) {
    sandbox = await daytona.create(
      {
        snapshot: snapshotName,
        language: "typescript",
        envVars: { NODE_ENV: "development" },
        labels,
        autoStopInterval,
        autoDeleteInterval,
      },
      { timeout: 120 },
    );
    log.info("created", { sandboxId: sandbox.id, source: "snapshot", snapshot: snapshotName });
  } else if (sandboxImage) {
    sandbox = await daytona.create(
      {
        image: sandboxImage,
        language: "typescript",
        resources: { cpu, memory, disk },
        envVars: { NODE_ENV: "development" },
        labels,
        autoStopInterval,
        autoDeleteInterval,
      },
      // Image-based sandboxes pull the image first — allow up to 5 min.
      { timeout: 300 },
    );
    log.info("created", {
      sandboxId: sandbox.id,
      source: "image",
      image: sandboxImage,
      cpu,
      memoryGb: memory,
      diskGb: disk,
    });
  } else {
    // Fast, language-based instantiation using cached sandbox container.
    sandbox = await daytona.create(
      {
        language: "typescript",
        envVars: { NODE_ENV: "development" },
        labels,
        autoStopInterval,
        autoDeleteInterval,
      },
      { timeout: 90 },
    );
    log.info("created", { sandboxId: sandbox.id, source: "language-default" });
  }

  return { sandbox, cpu, memory, disk };
}

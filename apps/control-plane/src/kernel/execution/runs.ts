import { randomUUID } from "node:crypto";
import { newId, sql } from "@vynxlabs/db";
import { validateJson } from "@vynxlabs/manifest";
import type { Db, Trx } from "../audit.js";
import { badRequest, conflict, notFound } from "../errors.js";
import type { Kernel } from "../kernel.js";

/** Input and output above this size go to file storage, and the run keeps a reference. */
export const INLINE_PAYLOAD_BYTES = 256 * 1024;

export const queueName = (workspaceId: string) => `ws_${workspaceId.replaceAll("-", "")}`;

export interface ScriptBody {
  entry: string;
  input: object;
  output: object;
  timeoutSeconds: number;
  retries: { limit: number; delaySeconds: number; backoff: boolean };
  concurrency?: number;
  uses: { connections: string[]; secrets: string[]; variables: string[] };
  onFailure?: { script?: string; notify?: string };
}

export interface StartRun {
  tenantId: string;
  workspaceId: string;
  script: string;
  input: unknown;
  trigger: { type: string; detail?: Record<string, unknown> };
  startedBy: { type: string; id: string | null };
  idempotencyKey?: string | undefined;
  priority?: number | undefined;
  /** Do not start before this time. */
  startAfter?: Date | undefined;
}

async function storePayload(
  kernel: Kernel,
  runId: string,
  name: "input" | "output",
  value: unknown,
) {
  const text = JSON.stringify(value ?? null);
  if (Buffer.byteLength(text) <= INLINE_PAYLOAD_BYTES) return { inline: text, ref: null };
  const ref = `runs/${runId}/${name}.json`;
  await kernel.storage.put(ref, text, "application/json");
  return { inline: null, ref };
}

/** A run's input or output, wherever it is stored. */
export async function readPayload(
  kernel: Kernel,
  inline: unknown,
  ref: string | null,
): Promise<unknown> {
  if (ref === null) return inline ?? null;
  return JSON.parse((await kernel.storage.get(ref)).toString("utf8"));
}

/**
 * Creates a run and queues it, in the caller's transaction. Starting again
 * with the same idempotency key returns the first run.
 */
export async function startRun(kernel: Kernel, trx: Trx, request: StartRun) {
  const workspace = await trx
    .selectFrom("workspace")
    .select(["id", "active_bundle_id"])
    .where("id", "=", request.workspaceId)
    .where("tenant_id", "=", request.tenantId)
    .executeTakeFirst();
  if (!workspace) throw notFound("The workspace");
  const script = await trx
    .selectFrom("resource")
    .select(["id", "body"])
    .where("workspace_id", "=", request.workspaceId)
    .where("kind", "=", "script")
    .where("path", "=", request.script)
    .executeTakeFirst();
  if (!script || !workspace.active_bundle_id) {
    throw notFound(`The script ${request.script}`);
  }
  const body = script.body as unknown as ScriptBody;

  const issues = validateJson(body.input, request.input ?? {}, "/input");
  if (issues.length > 0) throw badRequest("The input does not match the script's schema.", issues);

  const key = request.idempotencyKey ?? randomUUID();
  if (request.idempotencyKey !== undefined) {
    const earlier = await trx
      .selectFrom("run")
      .selectAll()
      .where("workspace_id", "=", request.workspaceId)
      .where("script_path", "=", request.script)
      .where("idempotency_key", "=", key)
      .executeTakeFirst();
    if (earlier) return { created: false, run: earlier };
  }

  const id = newId();
  const input = await storePayload(kernel, id, "input", request.input ?? {});
  const jobId = await kernel.queue.enqueue(
    queueName(request.workspaceId),
    { runId: id },
    {
      priority: request.priority ?? 0,
      retryLimit: body.retries.limit,
      retryDelaySeconds: body.retries.delaySeconds,
      backoff: body.retries.backoff,
      timeoutSeconds: body.timeoutSeconds,
      ...(request.startAfter ? { startAfter: request.startAfter } : {}),
      ...(body.concurrency ? { group: { id: script.id, limit: body.concurrency } } : {}),
    },
    trx,
  );
  const run = await trx
    .insertInto("run")
    .values({
      id,
      tenant_id: request.tenantId,
      workspace_id: request.workspaceId,
      resource_id: script.id,
      script_path: request.script,
      bundle_id: workspace.active_bundle_id,
      status: "queued",
      max_attempts: body.retries.limit + 1,
      queue_job_id: jobId,
      priority: request.priority ?? 0,
      trigger_type: request.trigger.type,
      trigger_detail: JSON.stringify(request.trigger.detail ?? {}),
      started_by_type: request.startedBy.type,
      started_by_id: request.startedBy.id,
      idempotency_key: key,
      input: input.inline,
      input_ref: input.ref,
      scheduled_for: request.startAfter ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return { created: true, run };
}

export interface WorkerScope {
  credentialId: string;
  tenantId: string;
  workspaceId: string | null;
}

class ClaimAbandoned extends Error {}

let rotation = 0;

/**
 * Gives a worker the next job it may run, or null. Each workspace's limit is
 * checked and the job taken under one lock, so two workers cannot both take
 * the last slot. If the worker disconnects while waiting, nothing is claimed.
 */
export async function claimRun(
  kernel: Kernel,
  scope: WorkerScope,
  workerId: string,
  /** Says whether the worker has gone away. A job is never handed to a worker that has. */
  abandoned: () => boolean = () => false,
) {
  let query = kernel.db
    .selectFrom("workspace")
    .select(["id", "concurrency_limit"])
    .where("tenant_id", "=", scope.tenantId)
    .where("active_bundle_id", "is not", null);
  if (scope.workspaceId) query = query.where("id", "=", scope.workspaceId);
  const workspaces = await query.orderBy("id").execute();
  // Start from a different workspace each time, so none waits behind a busy one.
  rotation += 1;
  const start = workspaces.length > 0 ? rotation % workspaces.length : 0;
  const ordered = [...workspaces.slice(start), ...workspaces.slice(0, start)];

  for (const workspace of ordered) {
    for (;;) {
      const outcome = await kernel.db
        .transaction()
        .execute(async (trx) => {
          await sql`select pg_advisory_xact_lock(hashtextextended(${workspace.id}, 0))`.execute(
            trx,
          );
          const running = await trx
            .selectFrom("run")
            .select((eb) => eb.fn.countAll<string>().as("n"))
            .where("workspace_id", "=", workspace.id)
            .where("status", "=", "running")
            .executeTakeFirstOrThrow();
          if (Number(running.n) >= workspace.concurrency_limit) return "full" as const;

          const job = await kernel.queue.claim<{ runId: string }>(queueName(workspace.id), trx);
          if (!job) return "empty" as const;
          const run = await trx
            .selectFrom("run")
            .selectAll()
            .where("id", "=", job.data.runId)
            .forUpdate()
            .executeTakeFirst();
          if (
            !run ||
            run.status === "succeeded" ||
            run.status === "failed" ||
            run.status === "cancelled"
          ) {
            // The run ended some other way. Drop the job and look again.
            await kernel.queue.complete(queueName(workspace.id), job.id);
            return "stale" as const;
          }
          const now = new Date();
          const updated = await trx
            .updateTable("run")
            .set({
              status: "running",
              attempt: job.attempt,
              queue_job_id: job.id,
              worker_id: workerId,
              started_at: run.started_at ?? now,
              last_heartbeat_at: now,
            })
            .where("id", "=", run.id)
            .returningAll()
            .executeTakeFirstOrThrow();
          // Checked last, inside the transaction: rolling back leaves the job unclaimed.
          if (abandoned()) throw new ClaimAbandoned();
          return { run: updated, timeoutSeconds: job.timeoutSeconds };
        })
        .catch((error) => {
          if (error instanceof ClaimAbandoned) return "abandoned" as const;
          throw error;
        });
      if (outcome === "abandoned") return null;
      if (outcome === "stale") continue;
      if (outcome === "full" || outcome === "empty") break;
      return outcome;
    }
  }
  return null;
}

/** The run a worker is reporting on, if it is still that worker's to report on. */
export async function activeRun(db: Db | Trx, scope: WorkerScope, runId: string, attempt: number) {
  let query = db
    .selectFrom("run")
    .selectAll()
    .where("id", "=", runId)
    .where("tenant_id", "=", scope.tenantId);
  if (scope.workspaceId) query = query.where("workspace_id", "=", scope.workspaceId);
  const run = await query.executeTakeFirst();
  if (!run) throw notFound("The run");
  if (run.status !== "running" || run.attempt !== attempt) {
    throw conflict("This attempt is no longer in progress. Its result is not recorded.");
  }
  return run;
}

export async function completeRun(
  kernel: Kernel,
  scope: WorkerScope,
  runId: string,
  attempt: number,
  output: unknown,
) {
  const run = await activeRun(kernel.db, scope, runId, attempt);
  const taken = await kernel.queue.complete(
    queueName(run.workspace_id),
    run.queue_job_id as string,
  );
  if (!taken) throw conflict("This attempt is no longer in progress. Its result is not recorded.");
  const stored = await storePayload(kernel, run.id, "output", output);
  await kernel.db
    .updateTable("run")
    .set({
      status: "succeeded",
      output: stored.inline,
      output_ref: stored.ref,
      error: null,
      finished_at: new Date(),
    })
    .where("id", "=", run.id)
    .execute();
}

export interface RunFailure {
  message: string;
  stack?: string;
}

export async function failRun(
  kernel: Kernel,
  scope: WorkerScope,
  runId: string,
  attempt: number,
  error: RunFailure,
) {
  const run = await activeRun(kernel.db, scope, runId, attempt);
  const queue = queueName(run.workspace_id);
  const taken = await kernel.queue.fail(queue, run.queue_job_id as string, {
    message: error.message,
  });
  if (!taken) throw conflict("This attempt is no longer in progress. Its result is not recorded.");
  const state = await kernel.queue.state(queue, run.queue_job_id as string);
  if (state === "retry" || state === "created") {
    await kernel.db
      .updateTable("run")
      .set({ status: "queued", error: JSON.stringify(error), worker_id: null })
      .where("id", "=", run.id)
      .execute();
    return { final: false };
  }
  await finishFailed(kernel, run.id, error);
  return { final: true };
}

/** Marks a run as failed for good and fires its alerts. Safe to call twice. */
export async function finishFailed(kernel: Kernel, runId: string, error: RunFailure) {
  const run = await kernel.db
    .updateTable("run")
    .set({ status: "failed", error: JSON.stringify(error), finished_at: new Date() })
    .where("id", "=", runId)
    .where("status", "in", ["queued", "running"])
    .returningAll()
    .executeTakeFirst();
  if (!run) return;
  const { sendAlerts } = await import("./alerts.js");
  await sendAlerts(kernel, run).catch((failure) =>
    kernel.log.error({ err: failure, runId }, "failure alert could not be sent"),
  );
}

/** Stops a run that is waiting or in progress. A running script hears on its next heartbeat. */
export async function cancelRun(kernel: Kernel, trx: Trx, workspaceId: string, runId: string) {
  const run = await trx
    .selectFrom("run")
    .selectAll()
    .where("id", "=", runId)
    .where("workspace_id", "=", workspaceId)
    .forUpdate()
    .executeTakeFirst();
  if (!run) throw notFound("The run");
  if (run.status !== "queued" && run.status !== "running") {
    throw conflict(`The run already ${run.status === "succeeded" ? "succeeded" : run.status}.`);
  }
  if (run.queue_job_id) await kernel.queue.cancel(queueName(workspaceId), run.queue_job_id);
  return trx
    .updateTable("run")
    .set({ status: "cancelled", finished_at: new Date() })
    .where("id", "=", runId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

/**
 * Records the final failure of runs whose retries ran out without the worker
 * saying so: a timeout, or a worker that vanished. Returns how many it closed.
 */
export async function reapDeadRuns(kernel: Kernel): Promise<number> {
  let closed = 0;
  for (
    let job = await kernel.queue.takeDead<{ runId: string }>();
    job;
    job = await kernel.queue.takeDead()
  ) {
    await finishFailed(kernel, job.data.runId, {
      message: "The run timed out, or its worker stopped responding, and it had no retries left.",
    });
    closed += 1;
  }
  return closed;
}

/**
 * Puts back in line the runs whose worker went silent. The queue takes such a
 * job back by itself. This brings the run record in step, so the run shows as
 * waiting and a worker is started for it. Returns how many it put back.
 */
export async function requeueLostRuns(kernel: Kernel): Promise<number> {
  const silentSince = new Date(Date.now() - kernel.queue.heartbeatSeconds * 1000);
  const silent = await kernel.db
    .selectFrom("run")
    .select(["id", "workspace_id", "queue_job_id"])
    .where("status", "=", "running")
    .where("last_heartbeat_at", "<", silentSince)
    .limit(100)
    .execute();
  let requeued = 0;
  for (const run of silent) {
    if (!run.queue_job_id) continue;
    const state = await kernel.queue.state(queueName(run.workspace_id), run.queue_job_id);
    // Still "active" means the queue has not given up on the worker yet.
    if (state !== "retry" && state !== "created") continue;
    const updated = await kernel.db
      .updateTable("run")
      .set({
        status: "queued",
        worker_id: null,
        error: JSON.stringify({
          message: "The worker stopped responding. The run is being retried.",
        }),
      })
      .where("id", "=", run.id)
      .where("status", "=", "running")
      .where("last_heartbeat_at", "<", silentSince)
      .executeTakeFirst();
    requeued += Number(updated.numUpdatedRows);
  }
  return requeued;
}

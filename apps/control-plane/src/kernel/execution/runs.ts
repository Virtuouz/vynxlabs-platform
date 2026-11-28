import { createHash, randomUUID } from "node:crypto";
import { newId, sql } from "@volvel/db";
import { keyOf, type PlatformEventName, validateJson } from "@volvel/manifest";
import type { Db, Trx } from "../audit.js";
import { badRequest, conflict, notFound } from "../errors.js";
import type { Kernel } from "../kernel.js";
import { observe } from "../metrics.js";
import { formerPaths, resolveResource } from "../resolve.js";
import { traceFor, traceRun } from "../trace.js";
import { bundleManifest, payloadSchemas } from "./bundles.js";
import { redactError, summarize } from "./redact.js";
import { servedValues } from "./served.js";
import {
  type MachineClaim,
  machineHasRoom,
  machineShortOfMemory,
  mustHold,
  notePeak,
  noteStarted,
  onMachine,
  peakKnown,
  recallPeaks,
  runEnded,
} from "./workers.js";

/** Input and output above this size go to file storage, and the run keeps a reference. */
export const INLINE_PAYLOAD_BYTES = 256 * 1024;

/** Each workspace has a queue for the default pool, and one more for each named pool its scripts ask for. */
export const queueName = (workspaceId: string, pool?: string | null) =>
  `ws_${workspaceId.replaceAll("-", "")}${pool ? `_p_${pool.replaceAll("-", "_")}` : ""}`;

/** What a script's memory is remembered under: the script of one workspace. */
const scriptKey = (run: { workspace_id: string; script_path: string }) =>
  `${run.workspace_id}:${run.script_path}`;

/** How many of a workspace's latest runs are looked through for what a script held before. */
const PEAK_LOOKBACK_RUNS = 500;

/**
 * What a script held in its last runs, read once for each script after a start: what was known
 * of it is in this process's memory, and a restart forgets that.
 */
async function rememberPeaks(kernel: Kernel, run: { workspace_id: string; script_path: string }) {
  const key = scriptKey(run);
  if (peakKnown(key)) return;
  try {
    const rows = await kernel.db
      .selectFrom(
        kernel.db
          .selectFrom("run")
          .select(["id", "script_path", "peak_memory_mb"])
          .where("workspace_id", "=", run.workspace_id)
          .orderBy("id", "desc")
          .limit(PEAK_LOOKBACK_RUNS)
          .as("recent"),
      )
      .select("peak_memory_mb")
      .where("script_path", "=", run.script_path)
      .where("peak_memory_mb", "is not", null)
      .orderBy("id", "desc")
      .limit(4)
      .execute();
    recallPeaks(key, rows.map((row) => row.peak_memory_mb as number).reverse());
  } catch (error) {
    // Not worth a claim: the script is planned at the flat figure, as one never seen is.
    kernel.log.warn({ err: error }, "what a script held before could not be read");
  }
}

/** Keeps what a run's script held at most, for this process and for the next. */
async function keepPeak(
  kernel: Kernel,
  run: { id: string; workspace_id: string; script_path: string },
  peakMb: number | undefined,
) {
  if (peakMb === undefined || !Number.isFinite(peakMb) || peakMb <= 0) return;
  notePeak(scriptKey(run), peakMb);
  await kernel.db
    .updateTable("run")
    .set({ peak_memory_mb: Math.min(Math.ceil(peakMb), 1_000_000) })
    .where("id", "=", run.id)
    .execute()
    .catch((error) => kernel.log.warn({ err: error }, "what a script held could not be kept"));
}

export interface ScriptBody {
  entry: string;
  input: object;
  output: object;
  timeoutSeconds: number;
  /** The most memory the script may use, in MB. */
  memoryMb?: number;
  retries: { limit: number; delaySeconds: number; backoff: boolean };
  /** A number for the script as a whole, or a limit for each value of a key in the input. */
  concurrency?: number | { key: string; limit: number };
  /** The worker pool the script runs on. */
  worker?: string;
  uses: {
    connections: string[];
    connectionGroups?: string[];
    secrets: string[];
    variables: string[];
    events?: string[];
    tables?: string[];
    sources?: string[];
  };
  onFailure?: { script?: string; notify?: string };
}

/**
 * A trigger source runs on a worker as a script does: queued, claimed, held to
 * a time limit, and given only what it declared. This is its manifest in a
 * script's shape. It takes any input and is never retried: what it is handed
 * is a request or a tick, and the sender or the next tick is the retry.
 */
export function asScript(manifest: { kind: string; body: unknown }): ScriptBody {
  if (manifest.kind !== "trigger_source") return manifest.body as ScriptBody;
  const body = manifest.body as {
    entry: string;
    timeoutSeconds?: number;
    worker?: string;
    uses?: { connections?: string[]; secrets?: string[]; variables?: string[] };
  };
  return {
    entry: body.entry,
    input: {},
    output: {},
    timeoutSeconds: body.timeoutSeconds ?? 30,
    retries: { limit: 0, delaySeconds: 0, backoff: false },
    ...(body.worker ? { worker: body.worker } : {}),
    uses: {
      connections: body.uses?.connections ?? [],
      secrets: body.uses?.secrets ?? [],
      variables: body.uses?.variables ?? [],
    },
  };
}

/** What a run executes, from a stored bundle: a script, or a trigger source in a script's shape. */
export async function runnable(
  kernel: Kernel,
  bundle: { id: string; storage_key: string },
  path: string,
): Promise<ScriptBody | undefined> {
  const found =
    (await bundleManifest(kernel, bundle, "script", path)) ??
    (await bundleManifest(kernel, bundle, "trigger_source", path));
  return found ? asScript(found) : undefined;
}

/** Which trigger a run of a trigger source was started for, and so where its answer goes. */
export interface Relay {
  resourceId: string;
  node: string;
  mode: "webhook" | "poll";
}

/** The most tags one run or flow run carries. */
export const MAX_TAGS = 10;
/** What a tag may look like: short, lower case, no spaces. */
export const TAG_PATTERN = /^[a-z0-9_.:-]{1,64}$/;

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
  /** Run the script from this bundle, not the workspace's active one. For steps of a flow run. */
  bundleId?: string | undefined;
  /** The flow step this run belongs to. */
  step?: { flowRunId: string; node: string; item: string } | undefined;
  /** Tags the run starts with, from its trigger, the run it repeats, or its flow run. */
  tags?: string[] | undefined;
  /**
   * Set when the run is of a trigger source, for a trigger. Only then may a
   * trigger source be run: nobody starts one by hand.
   */
  relay?: Relay | undefined;
}

/** Where a value has text that the database cannot hold: a NUL, or half of a character. */
export function unstorable(value: unknown, path = ""): string | undefined {
  const bad = (text: string) => text.includes("\u0000") || !text.isWellFormed();
  if (typeof value === "string") return bad(value) ? path || "the value" : undefined;
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = unstorable(item, `${path}[${index}]`);
      if (found) return found;
    }
  } else if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      if (bad(key)) return path ? `${path}.${key}` : key;
      const found = unstorable(item, path ? `${path}.${key}` : key);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * The value as the database can hold it: half a character becomes U+FFFD, and a NUL is
 * left out. A step whose expression cuts text in the middle of a character gives such text.
 */
export function storable<T>(value: T): T {
  const clean = (text: string) => text.toWellFormed().replaceAll("\u0000", "");
  const walk = (one: unknown): unknown => {
    if (typeof one === "string") return clean(one);
    if (Array.isArray(one)) return one.map(walk);
    if (typeof one === "object" && one !== null) {
      return Object.fromEntries(Object.entries(one).map(([key, item]) => [clean(key), walk(item)]));
    }
    return one;
  };
  return walk(value) as T;
}

/** Refuses an input that cannot be stored, naming where, so that a start answers 400 and not 500. */
export function refuseUnstorable(input: unknown): void {
  const found = unstorable(input);
  if (found) {
    throw badRequest(
      `The input has text Volvel cannot store, at ${found}: a null character, or half of a character. Remove it and send again.`,
    );
  }
}

/** Keeps a small payload for the row, and puts a large one in file storage. */
export async function storePayload(
  kernel: Kernel,
  runId: string,
  name: string,
  value: unknown,
  folder = "runs",
) {
  const text = JSON.stringify(storable(value ?? null));
  if (Buffer.byteLength(text) <= INLINE_PAYLOAD_BYTES) return { inline: text, ref: null };
  const ref = `${folder}/${runId}/${name}.json`;
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
/** A key value longer than this is replaced by its hash: a lane is a name, not a payload. */
const MAX_KEY_LENGTH = 200;

/**
 * Which lane a run waits in, when its script limits how many run at once: the
 * script's own, or the script's for one value of a key in the input. The key's
 * value is kept on the run, to be shown; a missing one is the empty key, a lane
 * shared by every run without one.
 */
export function laneOf(
  resourceId: string,
  concurrency: ScriptBody["concurrency"],
  input: unknown,
): { group: string; limit: number; key?: string } | undefined {
  if (!concurrency) return undefined;
  if (typeof concurrency === "number") return { group: resourceId, limit: concurrency };
  let value: unknown = { input };
  for (const field of concurrency.key.split(".")) {
    value =
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)[field]
        : undefined;
  }
  let key =
    value === undefined || value === null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  if (key.length > MAX_KEY_LENGTH) {
    key = `sha256:${createHash("sha256").update(key).digest("hex")}`;
  }
  return { group: `${resourceId}:${key}`, limit: concurrency.limit, key };
}

/**
 * What starting a script would refuse, found out without starting it: it is in the bundle, and the
 * input is what its schema takes. A page's action asks this before its data is saved, and a start
 * asks it again.
 */
export async function checkRunStart(kernel: Kernel, trx: Trx | Kernel["db"], request: StartRun) {
  const workspace = await trx
    .selectFrom("workspace")
    .select(["id", "active_bundle_id"])
    .where("id", "=", request.workspaceId)
    .where("tenant_id", "=", request.tenantId)
    .executeTakeFirst();
  if (!workspace) throw notFound("The workspace");
  const bundleId = request.bundleId ?? workspace.active_bundle_id;
  // Asked for by a path it had before it was renamed, it still runs while the alias lasts.
  const found = request.bundleId
    ? undefined
    : await resolveResource(trx, request.workspaceId, request.script, {
        kind: request.relay ? "trigger_source" : "script",
      });
  const alias = found?.alias;
  if (found?.via === "alias") request = { ...request, script: found.resource.path };
  const script =
    found?.resource ??
    (await trx
      .selectFrom("resource")
      .select(["id", "body"])
      .where("workspace_id", "=", request.workspaceId)
      .where("kind", "=", request.relay ? "trigger_source" : "script")
      .where("path", "=", request.script)
      .executeTakeFirst());
  let resource: { id: string } | undefined = script;
  let body = script
    ? asScript({ kind: request.relay ? "trigger_source" : "script", body: script.body })
    : undefined;
  if (request.bundleId) {
    // A step of a flow run uses the script as it was in the flow run's own bundle.
    const bundle = await trx
      .selectFrom("bundle")
      .select(["id", "storage_key"])
      .where("id", "=", request.bundleId)
      .where("workspace_id", "=", request.workspaceId)
      .executeTakeFirst();
    const pinned = bundle
      ? await bundleManifest(kernel, bundle, "script", request.script)
      : undefined;
    body = pinned?.body as unknown as ScriptBody | undefined;
    // The script may have been renamed since that bundle, or its path given to another:
    // the key in the bundle says which resource it is.
    if (pinned) {
      resource = await trx
        .selectFrom("resource")
        .select("id")
        .where("workspace_id", "=", request.workspaceId)
        .where("kind", "=", "script")
        .where("key", "=", keyOf(pinned))
        .executeTakeFirst();
    }
  }
  if (!body || !bundleId) {
    throw notFound(`The script ${request.script}`);
  }
  // A script that is no longer in the registry still runs, from its bundle, and waits in a lane of its own.
  const resourceId = resource?.id ?? null;

  const issues = validateJson(body.input, request.input ?? {}, "/input");
  if (issues.length > 0) throw badRequest("The input does not match the script's schema.", issues);
  return { request, body, bundleId, resourceId, alias };
}

export async function startRun(kernel: Kernel, trx: Trx, startRequest: StartRun) {
  const { request, body, bundleId, resourceId, alias } = await checkRunStart(
    kernel,
    trx,
    startRequest,
  );
  const key = request.idempotencyKey ?? randomUUID();
  if (request.idempotencyKey !== undefined) {
    const earlier = await trx
      .selectFrom("run")
      .selectAll()
      .where("workspace_id", "=", request.workspaceId)
      // The same request sent again after the script was renamed finds its first run.
      .where("script_path", "in", [
        request.script,
        ...(resourceId ? await formerPaths(trx, resourceId) : []),
      ])
      .where("idempotency_key", "=", key)
      .executeTakeFirst();
    if (earlier) return { created: false, run: earlier, alias };
  }

  const lane = laneOf(resourceId ?? bundleId, body.concurrency, request.input ?? {});
  const id = newId();
  // A step's run is part of its flow run's trace; any other, of the request that asked for it.
  const flowRun = request.step
    ? await trx
        .selectFrom("flow_run")
        .select("trace_id")
        .where("id", "=", request.step.flowRunId)
        .executeTakeFirst()
    : undefined;
  const trace = traceFor(
    request.step ? { traceId: flowRun?.trace_id ?? null, ...request.step } : undefined,
  );
  refuseUnstorable(request.input);
  const input = await storePayload(kernel, id, "input", request.input ?? {});
  const jobId = await kernel.queue.enqueue(
    queueName(request.workspaceId, body.worker),
    { runId: id, limitSeconds: body.timeoutSeconds },
    {
      priority: request.priority ?? 0,
      retryLimit: body.retries.limit,
      retryDelaySeconds: body.retries.delaySeconds,
      backoff: body.retries.backoff,
      // The worker ends a run at its limit and says so. The queue gives up on the job only later,
      // for a worker that is gone: had it given up at the limit itself, the two raced, and when the
      // queue won the worker's report was refused and the run was failed for a reason not its own.
      timeoutSeconds: body.timeoutSeconds + LIMIT_GRACE_SECONDS,
      ...(request.startAfter ? { startAfter: request.startAfter } : {}),
      ...(lane ? { group: { id: lane.group, limit: lane.limit } } : {}),
    },
    trx,
  );
  const run = await trx
    .insertInto("run")
    .values({
      id,
      tenant_id: request.tenantId,
      workspace_id: request.workspaceId,
      resource_id: resourceId,
      pool: body.worker ?? null,
      script_path: request.script,
      bundle_id: bundleId,
      flow_run_id: request.step?.flowRunId ?? null,
      step_node: request.step?.node ?? null,
      step_item: request.step?.item ?? null,
      status: "queued",
      max_attempts: body.retries.limit + 1,
      queue_job_id: jobId,
      priority: request.priority ?? 0,
      trigger_type: request.trigger.type,
      trigger_detail: JSON.stringify({
        ...(request.trigger.detail ?? {}),
        ...(request.relay ? { relay: request.relay } : {}),
      }),
      started_by_type: request.startedBy.type,
      started_by_id: request.startedBy.id,
      idempotency_key: key,
      input: input.inline,
      input_ref: input.ref,
      scheduled_for: request.startAfter ?? null,
      tags: [...new Set(request.tags ?? [])].slice(0, MAX_TAGS),
      concurrency_key: lane?.key ?? null,
      ...trace,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return { created: true, run, alias };
}

export interface WorkerScope {
  credentialId: string;
  tenantId: string;
  workspaceId: string | null;
  /** The pool this worker serves. Null for the default pool. */
  pool: string | null;
  /** Whether the control plane or a worker host started this worker and named its machine. */
  managed?: boolean;
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
  /** The machine the worker shares with others, whose slots it must keep within. */
  machine?: MachineClaim,
) {
  // A machine that says what memory it has is handed a script only where one more fits.
  if (machine && machineShortOfMemory(machine)) return null;
  const run =
    (await onMachine(
      machine,
      async (noteFull, noteShare) => {
        if (machine && machineShortOfMemory(machine)) return undefined;
        const claimed = await claimNext(
          kernel,
          scope,
          workerId,
          abandoned,
          machine,
          noteFull,
          noteShare,
        );
        if (machine && claimed) {
          await rememberPeaks(kernel, claimed.run);
          noteStarted(machine, claimed.run.id, Date.now(), scriptKey(claimed.run), workerId);
        }
        return claimed;
      },
      scope.tenantId,
    )) ?? null;
  return run;
}

/**
 * How much longer than a run's limit the queue holds its job: the worker's own ending of the run
 * (a signal, three seconds before it is killed, its logs, its report) comes first.
 */
export const LIMIT_GRACE_SECONDS = 30;

async function claimNext(
  kernel: Kernel,
  scope: WorkerScope,
  workerId: string,
  abandoned: () => boolean,
  machine: MachineClaim | undefined,
  noteFull: () => void,
  noteShare: () => void = () => {},
) {
  let query = kernel.db
    .selectFrom("workspace")
    .select(["id", "concurrency_limit"])
    .where("tenant_id", "=", scope.tenantId)
    // A workspace runs what it deployed; one with nothing deployed yet may still have test
    // runs of drafts or of a local build, which run from a bundle of their own.
    .where((eb) =>
      eb.or([
        eb("active_bundle_id", "is not", null),
        eb.exists(
          eb
            .selectFrom("run")
            .select(sql`1`.as("one"))
            .whereRef("run.workspace_id", "=", "workspace.id")
            .where("run.status", "=", "queued"),
        ),
      ]),
    );
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
          // A claim holds its machine's turn while it waits. Whatever it waits for, it does
          // not wait for long: one that could not get a lock is asked again by its worker.
          await sql`set local lock_timeout = '15s'`.execute(trx);
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
          if (machine) {
            const room = await machineHasRoom(trx, machine, scope.tenantId);
            if (room === "full") noteFull();
            if (room === "share") noteShare();
            if (room !== "room") return "machine" as const;
          }

          const queue = queueName(workspace.id, scope.pool);
          const job = await kernel.queue.claim<{ runId: string; limitSeconds?: number }>(
            queue,
            trx,
          );
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
            await kernel.queue.complete(queue, job.id, undefined, trx);
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
          // A first attempt waited from when it was due; a retry's wait is its backoff.
          if (!run.started_at) {
            observe.runClaimed(kernel.metrics, {
              workspace_id: run.workspace_id,
              due: run.scheduled_for ?? run.created_at,
            });
          }
          // A job queued before its limit was carried in its data has its limit as its expiry.
          return { run: updated, timeoutSeconds: job.data.limitSeconds ?? job.timeoutSeconds };
        })
        .catch((error) => {
          if (error instanceof ClaimAbandoned) return "abandoned" as const;
          // lock_not_available: nothing is handed out this time.
          if ((error as { code?: string }).code === "55P03") {
            kernel.log.warn({ workspaceId: workspace.id }, "a claim gave up waiting for a lock");
            return "empty" as const;
          }
          throw error;
        });
      if (outcome === "abandoned") return null;
      // The machine is full whichever workspace the job would come from.
      if (outcome === "machine") return null;
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
  await mustHold(db, scope, run.worker_id);
  return run;
}

export async function completeRun(
  kernel: Kernel,
  scope: WorkerScope,
  runId: string,
  attempt: number,
  output: unknown,
  peakMb?: number,
) {
  const run = await activeRun(kernel.db, scope, runId, attempt);
  runEnded(runId);
  await keepPeak(kernel, run, peakMb);
  const taken = await kernel.queue.complete(
    queueName(run.workspace_id, run.pool),
    run.queue_job_id as string,
  );
  if (!taken) throw conflict("This attempt is no longer in progress. Its result is not recorded.");
  const stored = await storePayload(kernel, run.id, "output", output);
  const schemas = await payloadSchemas(kernel, run.bundle_id, run.script_path);
  const known = await servedValues(kernel, kernel.db, run);
  const finishedAt = new Date();
  await kernel.db
    .updateTable("run")
    .set({
      status: "succeeded",
      output: stored.inline,
      output_ref: stored.ref,
      output_summary: summarize(output, schemas.output, 200, known),
      error: null,
      finished_at: finishedAt,
    })
    .where("id", "=", run.id)
    .execute();
  // Passing a trigger source's answer on may fail the run, so what it came to is counted and
  // traced once that is known: never "succeeded" for a run that then failed.
  await afterRun(kernel, run, "succeeded", output, (status, message) => {
    observe.runEnded(kernel.metrics, { ...run, finished_at: finishedAt }, status);
    traceRun(kernel, { ...run, finished_at: finishedAt }, status, message);
  });
}

export interface EndedRun {
  id: string;
  tenant_id: string;
  workspace_id: string;
  script_path: string;
  flow_run_id: string | null;
  trigger_detail: Record<string, unknown>;
}

/** What follows a run reaching its end: its flow moves on, and the platform says so. */
async function afterRun(
  kernel: Kernel,
  run: EndedRun,
  reportedStatus: "succeeded" | "failed",
  reportedDetail: unknown,
  /** Called once the run's end is known, after a trigger source's answer was passed on. */
  settled?: (status: "succeeded" | "failed", message?: string) => void,
) {
  let status = reportedStatus;
  let detail = reportedDetail;
  const { kickFlow } = await import("../flows/engine.js");
  if (run.flow_run_id) kickFlow(kernel, run.flow_run_id);
  // What a trigger source gave back is what starts the trigger's script or flow. It is passed on
  // before the run is announced, because passing it on may fail the run, and the platform says
  // what the run came to, not what it was a moment before.
  if (status === "succeeded" && run.trigger_detail?.relay) {
    const { relaySource } = await import("./triggers.js");
    await relaySource(kernel, run, detail).catch((error: Error) =>
      kernel.log.warn(
        { run: run.id, reason: error.message },
        "a trigger source's answer could not be passed on",
      ),
    );
    const now = await kernel.db
      .selectFrom("run")
      .select(["status", "error"])
      .where("id", "=", run.id)
      .executeTakeFirst();
    if (now?.status === "failed") {
      status = "failed";
      detail = {
        message: (now.error as { message?: string } | null)?.message ?? "The run failed.",
      };
    }
  }
  settled?.(status, status === "failed" ? (detail as { message?: string }).message : undefined);
  const error = status === "failed" ? { error: (detail as { message: string }).message } : {};
  // The two events for a run that ended well or badly stay. The third says how any run ended,
  // including one that was canceled.
  await publishRunEvent(
    kernel,
    run,
    status === "succeeded" ? "platform/run-succeeded" : "platform/run-failed",
    error,
  );
  await publishRunEvent(kernel, run, "platform/run-finished", { status, ...error });
}

async function publishRunEvent(
  kernel: Kernel,
  run: EndedRun,
  name: PlatformEventName,
  more: Record<string, unknown>,
) {
  const { publishPlatformEvent } = await import("../flows/events.js");
  await publishPlatformEvent(kernel, {
    tenantId: run.tenant_id,
    workspaceId: run.workspace_id,
    name,
    payload: { runId: run.id, script: run.script_path, ...more },
    sourceId: run.id,
    depth: Number(run.trigger_detail.depth ?? 0),
  }).catch((error) =>
    kernel.log.error({ err: error, runId: run.id }, "a platform event could not be published"),
  );
}

/** Runs canceled inside a transaction, kept until it has committed and they can be announced. */
const canceledIn = new WeakMap<object, EndedRun[]>();

/** The runs this transaction canceled so far, handed over once, to be announced after it commits. */
export function takeCanceled(trx: Trx): EndedRun[] {
  const runs = canceledIn.get(trx) ?? [];
  canceledIn.delete(trx);
  return runs;
}

/** Says that runs ended as canceled: `platform/run-finished` with `status: "cancelled"`. */
export async function announceCanceled(kernel: Kernel, runs: EndedRun[]) {
  for (const run of runs) {
    await publishRunEvent(kernel, run, "platform/run-finished", { status: "cancelled" });
  }
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
  reported: RunFailure,
  /** False when another attempt would repeat work that was done: the run ends here. */
  retry = true,
  peakMb?: number,
) {
  const run = await activeRun(kernel.db, scope, runId, attempt);
  runEnded(runId);
  await keepPeak(kernel, run, peakMb);
  // What the script was given never reaches the record, the alerts or the handler: an error
  // that quotes a URL with its key, or a header, is stored without it.
  const error = redactError(reported, await servedValues(kernel, kernel.db, run));
  const queue = queueName(run.workspace_id, run.pool);
  // A failure that must not be retried ends the job as done, and the run as failed.
  const taken = retry
    ? await kernel.queue.fail(queue, run.queue_job_id as string, { message: error.message })
    : await kernel.queue.complete(queue, run.queue_job_id as string);
  if (!taken) throw conflict("This attempt is no longer in progress. Its result is not recorded.");
  const state = retry ? await kernel.queue.state(queue, run.queue_job_id as string) : "failed";
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
  observe.runEnded(kernel.metrics, run, "failed");
  traceRun(kernel, run, "failed", error.message);
  await afterRun(kernel, run, "failed", error);
  // Inside a flow, the flow decides what a failed step means.
  if (run.flow_run_id) return;
  const { sendAlerts } = await import("./alerts.js");
  await sendAlerts(kernel, run).catch((failure) =>
    kernel.log.error({ err: failure, runId }, "failure alert could not be sent"),
  );
}

/** What cancel says of a run or flow run that has ended: a sentence, in American spelling. */
export function alreadyEnded(what: "run" | "flow run", status: string): string {
  const said = status === "cancelled" ? "was already canceled" : `already ${status}`;
  return `This ${what} ${said}.`;
}

/** Stops a run that is waiting or in progress. A running script hears on its next heartbeat. */
export async function cancelRun(kernel: Kernel, trx: Trx, workspaceId: string, runId: string) {
  // The job first, then the run: the order a claim takes them in. A cancel that held the run
  // and then asked for the job, on a connection of the queue's own, waited for a claim that
  // held the job and waited for the run. Postgres saw no deadlock, the claim kept its
  // machine's turn, and no run on the instance was claimed again (STR-06 of phase 35).
  const seen = await trx
    .selectFrom("run")
    .select(["status", "pool", "queue_job_id"])
    .where("id", "=", runId)
    .where("workspace_id", "=", workspaceId)
    .executeTakeFirst();
  if (!seen) throw notFound("The run");
  if (seen.status !== "queued" && seen.status !== "running") {
    throw conflict(alreadyEnded("run", seen.status));
  }
  if (seen.queue_job_id) {
    await kernel.queue.cancel(queueName(workspaceId, seen.pool), seen.queue_job_id, trx);
  }
  const run = await trx
    .selectFrom("run")
    .selectAll()
    .where("id", "=", runId)
    .where("workspace_id", "=", workspaceId)
    .forUpdate()
    .executeTakeFirst();
  if (!run) throw notFound("The run");
  if (run.status !== "queued" && run.status !== "running") {
    throw conflict(alreadyEnded("run", run.status));
  }
  // A job the run took on between the two reads. Rare, and still in this transaction.
  if (run.queue_job_id && run.queue_job_id !== seen.queue_job_id) {
    await kernel.queue.cancel(queueName(workspaceId, run.pool), run.queue_job_id, trx);
  }
  const cancelled = await trx
    .updateTable("run")
    .set({ status: "cancelled", finished_at: new Date() })
    .where("id", "=", runId)
    .returningAll()
    .executeTakeFirstOrThrow();
  observe.runEnded(kernel.metrics, cancelled, "cancelled");
  traceRun(kernel, cancelled, "cancelled");
  canceledIn.set(trx, [...(canceledIn.get(trx) ?? []), cancelled]);
  return cancelled;
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
 * Counts every run in progress as heard from now. Called before the queue is supervised again
 * after a time in which nothing could be written, a database that took no writes or was away:
 * the workers' heartbeats were refused all that time. Without it, the scripts in progress when
 * a disk filled were failed as not heard from eight seconds after it was freed, each with its
 * worker waiting to say it had ended (phase 35).
 */
export async function forgiveSilentRuns(kernel: Kernel): Promise<void> {
  await kernel.queue.forgiveSilence();
  await kernel.db
    .updateTable("run")
    .set({ last_heartbeat_at: new Date() })
    .where("status", "=", "running")
    .execute();
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
    .select(["id", "workspace_id", "queue_job_id", "pool"])
    .where("status", "=", "running")
    .where("last_heartbeat_at", "<", silentSince)
    .limit(100)
    .execute();
  let requeued = 0;
  for (const run of silent) {
    if (!run.queue_job_id) continue;
    const state = await kernel.queue.state(queueName(run.workspace_id, run.pool), run.queue_job_id);
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

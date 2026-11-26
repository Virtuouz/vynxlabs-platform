/**
 * Tasks: work the tenant's execution context does for the platform that is not
 * a run of a script (decision 0001). The control plane never runs a tenant's
 * code, and does not reach a tenant's systems, to do these: it queues a task,
 * and a worker that takes that kind claims it, does it in a process of its own,
 * and reports what it found.
 */
import { newId, sql } from "@volvel/db";
import type { Db, Trx } from "../audit.js";
import { conflict, notFound } from "../errors.js";
import type { Kernel } from "../kernel.js";
import type { WorkerScope } from "./runs.js";
import { type MachineClaim, machineHasRoom, mustHold, onMachine } from "./workers.js";

export const TASK_KINDS = ["describe", "deliver", "test-connection"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

/** How long a task may wait for a worker before whoever asked is told nobody took it. */
const WAIT: Record<TaskKind, number> = {
  describe: 10 * 60_000,
  deliver: 60 * 60_000,
  "test-connection": 2 * 60_000,
};
/** A running task whose worker has said nothing for this long is failed. */
const SILENT_MS = 60_000;
/** The largest result a task may report. */
export const MAX_RESULT_BYTES = 256 * 1024;

export interface TaskRow {
  id: string;
  tenant_id: string;
  workspace_id: string;
  pool: string | null;
  kind: TaskKind;
  request: Record<string, unknown>;
  subject: string | null;
  status: "queued" | "running" | "succeeded" | "failed";
  result: unknown;
  error: { message: string } | null;
  attempt: number;
  worker_id: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

export type TaskOutcome = { result: unknown } | { error: { message: string } };

/** What happens when a task of a kind ends, however it ends. */
type Ended = (kernel: Kernel, task: TaskRow, outcome: TaskOutcome) => Promise<void>;
const ended = new Map<TaskKind, Ended>();

/** Says what to do when a task of `kind` ends. One per kind. */
export function onTaskEnded(kind: TaskKind, handler: Ended) {
  ended.set(kind, handler);
}

/** Queues a task for the tenant's workers. */
export async function queueTask(
  db: Db | Trx,
  task: {
    tenantId: string;
    workspaceId: string;
    pool?: string | null;
    kind: TaskKind;
    request: Record<string, unknown>;
    subject?: string;
  },
): Promise<TaskRow> {
  return (await db
    .insertInto("task")
    .values({
      id: newId(),
      tenant_id: task.tenantId,
      workspace_id: task.workspaceId,
      pool: task.pool ?? null,
      kind: task.kind,
      request: JSON.stringify(task.request),
      subject: task.subject ?? null,
      expires_at: new Date(Date.now() + WAIT[task.kind]),
    })
    .returningAll()
    .executeTakeFirstOrThrow()) as TaskRow;
}

/**
 * The worker pool that can reach a connection: the pool a script that uses it runs on (the first
 * by path, when several name one), or the default pool when none names a pool. A Test, or a test
 * alert, then speaks for the network a script would.
 */
export async function poolOfConnection(
  db: Db | Trx,
  workspaceId: string,
  connection: string,
): Promise<string | null> {
  const found = await sql<{ pool: string }>`
    select body->>'worker' as pool from resource
    where workspace_id = ${workspaceId} and kind in ('script', 'trigger_source')
      and body->>'worker' is not null
      and (
        coalesce(body->'uses'->'connections', '[]'::jsonb) @> to_jsonb(${connection}::text)
        or body->'onFailure'->>'notify' = ${connection}
      )
    order by path limit 1
  `.execute(db);
  return found.rows[0]?.pool ?? null;
}

/** The oldest queued task a worker may take, now its own; or nothing. */
export async function claimTask(
  kernel: Kernel,
  scope: WorkerScope,
  workerId: string,
  kinds: readonly string[],
  /** The machine the worker shares with others, whose slots it must keep within. */
  machine?: MachineClaim,
): Promise<TaskRow | undefined> {
  const wanted = kinds.filter((kind): kind is TaskKind =>
    (TASK_KINDS as readonly string[]).includes(kind),
  );
  if (wanted.length === 0) return undefined;
  if (!machine) return takeTask(kernel.db, scope, workerId, wanted);
  // A worker that shares its machine takes a task only when the machine has room.
  return onMachine(
    machine,
    (noteFull, noteShare) =>
      kernel.db.transaction().execute(async (trx) => {
        const room = await machineHasRoom(trx, machine, scope.tenantId);
        if (room === "full") noteFull();
        if (room === "share") noteShare();
        return room === "room" ? takeTask(trx, scope, workerId, wanted) : undefined;
      }),
    scope.tenantId,
  );
}

async function takeTask(
  db: Db | Trx,
  scope: WorkerScope,
  workerId: string,
  wanted: TaskKind[],
): Promise<TaskRow | undefined> {
  const claimed = await sql<TaskRow>`
    update task set status = 'running', worker_id = ${workerId}, started_at = now(),
      last_heartbeat_at = now(), attempt = attempt + 1
    where id = (
      select id from task
      where tenant_id = ${scope.tenantId} and status = 'queued' and expires_at > now()
        and kind in (${sql.join(wanted)})
        ${scope.workspaceId ? sql`and workspace_id = ${scope.workspaceId}` : sql``}
        and pool is not distinct from ${scope.pool}
      order by created_at
      limit 1
      for update skip locked
    )
    returning *
  `.execute(db);
  return claimed.rows[0];
}

/** A task the worker holds, or an error saying why it may not touch it. */
export async function heldTask(db: Db | Trx, scope: WorkerScope, id: string): Promise<TaskRow> {
  let query = db
    .selectFrom("task")
    .selectAll()
    .where("id", "=", id)
    .where("tenant_id", "=", scope.tenantId);
  if (scope.workspaceId) query = query.where("workspace_id", "=", scope.workspaceId);
  const task = (await query.executeTakeFirst()) as TaskRow | undefined;
  if (!task) throw notFound("The task");
  if (task.status !== "running") {
    throw conflict("This task is no longer in progress. Its result is not recorded.");
  }
  await mustHold(db, scope, task.worker_id);
  return task;
}

/** Records that the worker holding a task is still at it. */
export async function beatTask(kernel: Kernel, scope: WorkerScope, id: string) {
  await heldTask(kernel.db, scope, id);
  await kernel.db
    .updateTable("task")
    .set({ last_heartbeat_at: new Date() })
    .where("id", "=", id)
    .execute();
}

/** Ends a task with what the worker found, or why it could not, and does what its kind does then. */
export async function endTask(
  kernel: Kernel,
  scope: WorkerScope | undefined,
  id: string,
  outcome: TaskOutcome,
) {
  const task = scope
    ? await heldTask(kernel.db, scope, id)
    : ((await kernel.db
        .selectFrom("task")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirstOrThrow()) as TaskRow);
  const succeeded = "result" in outcome;
  const finished = await kernel.db
    .updateTable("task")
    .set({
      status: succeeded ? "succeeded" : "failed",
      result: succeeded ? JSON.stringify(outcome.result ?? null) : null,
      error: succeeded ? null : JSON.stringify(outcome.error),
      finished_at: new Date(),
    })
    .where("id", "=", id)
    .where("status", "in", ["queued", "running"])
    .returningAll()
    .executeTakeFirst();
  // Another ended it first: what it did stands.
  if (!finished) return;
  const handler = ended.get(task.kind);
  if (handler) {
    await handler(kernel, finished as TaskRow, outcome).catch((error) =>
      kernel.log.error({ err: error, taskId: id, kind: task.kind }, "a task's ending failed"),
    );
  }
}

/**
 * Fails tasks nobody will finish: one whose worker went silent, and one that
 * waited longer than its kind allows for a worker to take it.
 */
export async function sweepTasks(kernel: Kernel): Promise<number> {
  const stuck = await sql<{ id: string; status: string }>`
    select id, status from task
    where (status = 'running' and last_heartbeat_at < now() - make_interval(secs => ${SILENT_MS / 1000}))
       or (status = 'queued' and expires_at <= now())
    limit 200
  `.execute(kernel.db);
  for (const task of stuck.rows) {
    await endTask(kernel, undefined, task.id, {
      error: {
        message:
          task.status === "queued"
            ? "No worker took it in time. Start a worker for this workspace, or let the instance start one."
            : "Its worker stopped responding.",
      },
    });
  }
  return stuck.rows.length;
}

/** A task as the API shows it. */
export function toTask(row: TaskRow) {
  return {
    id: row.id,
    kind: row.kind,
    subject: row.subject,
    status: row.status,
    result: row.result ?? null,
    error: row.error ? { message: row.error.message } : null,
    createdAt: row.created_at.toISOString(),
    finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
  };
}

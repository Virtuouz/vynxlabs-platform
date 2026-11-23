import { randomBytes } from "node:crypto";
import { newId, sql } from "@volvel/db";
import type { FastifyRequest } from "fastify";
import type { Db, Trx } from "../audit.js";
import { badRequest, unauthenticated } from "../errors.js";
import type { Kernel } from "../kernel.js";
import { hashApiKey } from "../principal.js";
import type { WorkerScope } from "./runs.js";

export const WORKER_TOKEN_PREFIX = "vxw_";

export interface NewCredential {
  tenantId: string;
  workspaceId?: string | null;
  name: string;
  managed?: boolean;
  /** The pool the credential's workers serve. */
  pool?: string | null;
  expiresAt?: Date | null;
}

/** Creates a worker credential. The token is returned once and only its hash is stored. */
export async function createWorkerCredential(db: Db | Trx, input: NewCredential) {
  const token = `${WORKER_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const row = await db
    .insertInto("worker_credential")
    .values({
      id: newId(),
      tenant_id: input.tenantId,
      workspace_id: input.workspaceId ?? null,
      name: input.name,
      prefix: token.slice(0, 12),
      token_hash: hashApiKey(token),
      managed: input.managed ?? false,
      pool: input.pool ?? null,
      expires_at: input.expiresAt ?? null,
      revoked_at: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return { row, token };
}

/** Works out which worker is calling, from its credential. */
export async function resolveWorker(kernel: Kernel, request: FastifyRequest): Promise<WorkerScope> {
  const [scheme, token] = (request.headers.authorization ?? "").split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token?.startsWith(WORKER_TOKEN_PREFIX)) {
    throw unauthenticated("Send a worker credential: Authorization: Bearer <credential>.");
  }
  const credential = await kernel.db
    .selectFrom("worker_credential")
    .select(["id", "tenant_id", "workspace_id", "pool", "revoked_at", "expires_at"])
    .where("token_hash", "=", hashApiKey(token))
    .executeTakeFirst();
  if (
    !credential ||
    credential.revoked_at ||
    (credential.expires_at && credential.expires_at <= new Date())
  ) {
    throw unauthenticated("The worker credential is not valid.");
  }
  return {
    credentialId: credential.id,
    tenantId: credential.tenant_id,
    workspaceId: credential.workspace_id,
    pool: credential.pool,
  };
}

/** Records that a worker is alive. */
export async function seeWorker(
  kernel: Kernel,
  scope: WorkerScope,
  workerId: string,
  version?: string,
  machine?: MachineClaim,
) {
  const now = new Date();
  await kernel.db
    .insertInto("worker")
    .values({
      id: workerId,
      credential_id: scope.credentialId,
      tenant_id: scope.tenantId,
      version: version ?? null,
      machine: machine?.name ?? null,
      last_seen_at: now,
    })
    .onConflict((oc) =>
      oc
        .column("id")
        .doUpdateSet({ last_seen_at: now, ...(machine ? { machine: machine.name } : {}) }),
    )
    .execute();
}

/** The machine a worker says it shares with others, and how many scripts it takes at once. */
export interface MachineClaim {
  name: string;
  slots: number;
}

/** A worker that has not been heard from for this long no longer counts as on its machine. */
const MACHINE_PRESENCE = "60 seconds";

/**
 * Whether a machine has room for another job: `room`; `full`, its slots all taken;
 * or `share`, this tenant has had its share while others wait.
 */
export type MachineRoom = "room" | "full" | "share";

/** How long a machine found full is not asked again. A slot freed meanwhile waits that long. */
const FULL_FOR_MS = 250;
/** Claims for each machine in this process, one after another. */
const turns = new Map<string, Promise<void>>();
/** Until when each machine was last found full. */
const fullUntil = new Map<string, number>();

/** Whether this machine was found full a moment ago, so a claim need not ask the database. */
export function machineFull(machine: MachineClaim | undefined): boolean {
  return machine !== undefined && (fullUntil.get(machine.name) ?? 0) > Date.now();
}

/**
 * Runs a claim for a machine once the claims before it in this process are done.
 * A machine's claims are decided one at a time under a database lock; waiting for
 * that lock holds a connection, so dozens of workers waiting for it at once would
 * take every connection the control plane has. Waiting here holds none. A claim
 * that finds the machine full says so, and those after it return without asking.
 */
export async function onMachine<T>(
  machine: MachineClaim | undefined,
  claim: (noteFull: () => void) => Promise<T>,
): Promise<T | undefined> {
  const noteFull = () => {
    if (machine) fullUntil.set(machine.name, Date.now() + FULL_FOR_MS);
  };
  if (!machine) return claim(noteFull);
  if (machineFull(machine)) return undefined;
  const previous = turns.get(machine.name) ?? Promise.resolve();
  let release = () => {};
  const mine = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => mine);
  turns.set(machine.name, tail);
  await previous;
  try {
    if (machineFull(machine)) return undefined;
    return await claim(noteFull);
  } finally {
    release();
    if (turns.get(machine.name) === tail) turns.delete(machine.name);
  }
}

/**
 * Whether a worker on this machine may take another job for this tenant. Workers
 * on one machine share its slots: the scripts running there, across all of them,
 * never go past it. While others on the machine have work waiting, a tenant takes
 * no more than its fair share, so one busy tenant cannot keep the rest waiting.
 * Decided under a lock per machine, inside the claim's own transaction.
 */
export async function machineHasRoom(
  trx: Trx,
  machine: MachineClaim,
  tenantId: string,
): Promise<MachineRoom> {
  await sql`select pg_advisory_xact_lock(hashtextextended(${`machine:${machine.name}`}, 0))`.execute(
    trx,
  );
  const busy = await sql<{ tenant_id: string; n: number }>`
    select w.tenant_id, count(*)::int as n
    from (
      select worker_id from run where status = 'running'
      union all
      select worker_id from task where status = 'running'
    ) busy
    join worker w on w.id = busy.worker_id
    where w.machine = ${machine.name}
    group by w.tenant_id
  `.execute(trx);
  const total = busy.rows.reduce((sum, row) => sum + row.n, 0);
  if (total >= machine.slots) return "full";
  const mine = busy.rows.find((row) => row.tenant_id === tenantId)?.n ?? 0;
  const present = await sql<{ n: number }>`
    select count(distinct tenant_id)::int as n from worker
    where machine = ${machine.name}
      and last_seen_at > now() - ${sql.lit(MACHINE_PRESENCE)}::interval
  `.execute(trx);
  const share = Math.max(1, Math.floor(machine.slots / Math.max(1, present.rows[0]?.n ?? 1)));
  if (mine < share) return "room";
  // Past its share, a tenant may still take a free slot nobody else here is waiting for.
  const othersWaiting = await sql<{ waiting: boolean }>`
    select exists (
      select 1 from worker w
      where w.machine = ${machine.name} and w.tenant_id <> ${tenantId}
        and w.last_seen_at > now() - ${sql.lit(MACHINE_PRESENCE)}::interval
        and (
          exists (
            select 1 from run r
            where r.tenant_id = w.tenant_id and r.status = 'queued'
              and coalesce(r.scheduled_for, r.created_at) <= now()
          )
          or exists (select 1 from task t where t.tenant_id = w.tenant_id and t.status = 'queued')
        )
    ) as waiting
  `.execute(trx);
  return othersWaiting.rows[0]?.waiting ? "share" : "room";
}

/** A worker not heard from for this long is no longer listed. */
export const WORKER_STALE_SECONDS = 90;

/** The queue of scripts that name no pool is shown as this. A pool of that name would look the same. */
export const DEFAULT_POOL_NAME = "default";

/** Whether a pool may be called this: `default` is the pool that is not a record. */
export function assertPoolNameFree(name: string) {
  if (name === DEFAULT_POOL_NAME) {
    throw badRequest(
      `A pool cannot be called ${DEFAULT_POOL_NAME}: that is the name of the queue for scripts that name no pool. Choose another name.`,
    );
  }
}

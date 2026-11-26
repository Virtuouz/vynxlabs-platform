import { randomBytes } from "node:crypto";
import { newId, sql } from "@volvel/db";
import {
  type MachineProbe,
  machineName,
  PLANNED_START_MB,
  procProbe,
  Reservations,
} from "@volvel/worker";
import type { FastifyRequest } from "fastify";
import type { Db, Trx } from "../audit.js";
import { badRequest, conflict, unauthenticated } from "../errors.js";
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
    .select(["id", "tenant_id", "workspace_id", "pool", "managed", "revoked_at", "expires_at"])
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
    managed: credential.managed,
  };
}

/**
 * The machine a worker names, as the control plane keeps it. A worker that was started by the
 * control plane or a worker host was told its machine's name and is believed. Any other
 * worker's word is kept apart under its tenant, so that it can only ever speak of machines
 * of its own tenant: it cannot fill, mark full or reserve the memory of one that is shared.
 */
export function machineOf(scope: WorkerScope, machine: MachineClaim): MachineClaim;
export function machineOf(scope: WorkerScope, machine?: MachineClaim): MachineClaim | undefined;
export function machineOf(scope: WorkerScope, machine?: MachineClaim): MachineClaim | undefined {
  if (!machine || scope.managed) return machine;
  return { ...machine, name: `tenant:${scope.tenantId}/${machine.name}` };
}

/**
 * Refuses a worker credential that does not hold the job. A job is handed to one worker, and
 * only the credential that worker called with may report on it: another credential of the
 * same tenant cannot finish, fail or read what it was not given. A job whose worker is no
 * longer known is left to whoever the tenant check lets through.
 */
export async function mustHold(db: Db | Trx, scope: WorkerScope, workerId: string | null) {
  if (!workerId) return;
  const holder = await db
    .selectFrom("worker")
    .select("credential_id")
    .where("id", "=", workerId)
    .executeTakeFirst();
  if (holder && holder.credential_id !== scope.credentialId) {
    throw conflict("This job was given to another worker. Its result is not recorded.");
  }
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
  /** Free memory as the worker read it when it asked, and the floor it keeps. */
  availableMb?: number | undefined;
  floorMb?: number | undefined;
  /** What each script the worker is running holds now. */
  scripts?: readonly { runId: string; rssMb: number }[] | undefined;
}

/** What was started on each machine a moment ago, script or worker, whose memory does not show yet. */
const starting = new Map<string, Reservations>();
const OWN_MACHINE = machineName();
/**
 * A script nobody says anything about is counted until it ends, or for this long: by then what
 * it holds can mostly be seen in the machine's free memory.
 */
const SCRIPT_HOLD_MS = 8000;
/**
 * One whose worker says what it holds is counted for what it has yet to take, this long after it
 * was last said: two heartbeats and a little.
 */
const SEEN_HOLD_MS = 25_000;
const WORKER_HOLD_MS = 10_000;

function startingOn(name: string): Reservations {
  let held = starting.get(name);
  if (!held) {
    held = new Reservations(SCRIPT_HOLD_MS);
    starting.set(name, held);
  }
  return held;
}

/** Memory on a machine spoken for by what has just started there. */
export function machineReservedMb(name: string, now = Date.now()): number {
  return starting.get(name)?.mb(now) ?? 0;
}

/**
 * Whether one more script would take the machine below its memory floor, counting what was
 * started there in the last seconds. Every worker of a machine reads the same free memory, so
 * without the count a burst of claims was all granted on the same reading. On the control
 * plane's own machine the memory is read now; elsewhere it is what the worker said.
 */
export function machineShortOfMemory(
  machine: MachineClaim,
  probe: MachineProbe = procProbe,
  now = Date.now(),
): boolean {
  if (machine.floorMb === undefined) return false;
  const own = machine.name === OWN_MACHINE ? probe.memory()?.availableMb : undefined;
  const available = own ?? machine.availableMb;
  if (available === undefined) return false;
  return available - machineReservedMb(machine.name, now) < machine.floorMb;
}

/** The least a script is planned at: a Node process that does nothing holds about this much. */
const LEAST_START_MB = 48;
/** How many scripts' memory is remembered. The oldest is forgotten first. */
const PEAKS_KEPT = 5000;
/** What each script's process held at most in its last runs, as its workers reported it. */
const peaks = new Map<string, number[]>();

/**
 * A script's process held this much at most. A flat 160 MB for every start let two or three
 * scripts run on a machine that had room for six: in the soak of phase 35 a script that slept
 * five seconds in 50 MB was counted at 160 for all five.
 */
export function notePeak(script: string, mb: number | undefined): void {
  if (mb === undefined || !Number.isFinite(mb) || mb <= 0) return;
  const seen = peaks.get(script) ?? [];
  peaks.delete(script);
  peaks.set(script, [...seen.slice(-3), mb]);
  if (peaks.size > PEAKS_KEPT) peaks.delete(peaks.keys().next().value as string);
}

/** Forgets what every script held, as a restart does. For tests. */
export function forgetPeaks(): void {
  peaks.clear();
}

/** Whether anything is remembered of a script: one that is not is looked up among its past runs. */
export function peakKnown(script: string): boolean {
  return peaks.has(script);
}

/** What past runs of a script held, oldest first, as the database kept it. None is remembered as none. */
export function recallPeaks(script: string, mbs: readonly number[]): void {
  if (peaks.has(script)) return;
  peaks.set(script, mbs.filter((mb) => Number.isFinite(mb) && mb > 0).slice(-4));
  if (peaks.size > PEAKS_KEPT) peaks.delete(peaks.keys().next().value as string);
}

/**
 * What one more start of a script is planned at: a quarter over the most its last four runs
 * held, and `PLANNED_START_MB` for one never seen. A worker's word can only lower it to
 * `LEAST_START_MB`, and the memory floor and the guard stand whatever was planned.
 */
export function plannedStartMb(script: string | undefined): number {
  const seen = script === undefined ? undefined : peaks.get(script);
  if (!seen?.length) return PLANNED_START_MB;
  return Math.max(LEAST_START_MB, Math.ceil(Math.max(...seen) * 1.25));
}

/** What each script in progress was planned at, and where, so that what it is seen to hold can be taken off. */
const planned = new Map<
  string,
  { machine: string; mb: number; script?: string; worker?: string }
>();

/** A script was handed to this machine. It is counted until `runEnded`, or until it shows. */
export function noteStarted(
  machine: MachineClaim,
  runId?: string,
  now = Date.now(),
  script?: string,
  workerId?: string,
): void {
  const mb = plannedStartMb(script);
  startingOn(machine.name).add(mb, now, runId);
  if (runId) {
    planned.set(runId, {
      machine: machine.name,
      mb,
      ...(script ? { script } : {}),
      ...(workerId ? { worker: workerId } : {}),
    });
  }
}

/**
 * A worker says what its scripts hold now. What a script holds already shows in the machine's
 * free memory, so only the rest of its plan stays counted: counting all of it for a fixed time
 * was too long for a script that sleeps in 50 MB, which kept others waiting, and too short for
 * one that takes ten seconds to reach 300 MB, whose room was given away while it grew (phase 35:
 * fifteen of 24 such scripts were stopped for the machine's memory). One that holds more than
 * its plan raises what the next start of that script is planned at, at once.
 */
export function noteScriptsSeen(
  workerId: string,
  scripts: readonly { runId: string; rssMb: number }[] | undefined,
  now = Date.now(),
): void {
  for (const seen of scripts ?? []) {
    const plan = planned.get(seen.runId);
    // Only the worker a run was handed to speaks for it.
    if (!plan || plan.worker !== workerId || !Number.isFinite(seen.rssMb) || seen.rssMb < 0) {
      continue;
    }
    if (plan.script && seen.rssMb * 1.25 > plan.mb) notePeak(plan.script, seen.rssMb);
    const held = startingOn(plan.machine);
    held.release(seen.runId);
    const left = plan.mb - seen.rssMb;
    if (left > 0) held.add(left, now, seen.runId, SEEN_HOLD_MS);
  }
}

/** A run ended: what was held for it is free again. A script that ends at once holds nothing back. */
export function runEnded(runId: string): void {
  for (const held of starting.values()) held.release(runId);
  planned.delete(runId);
  slotFreed();
}

/** A worker was started on this machine by the control plane. */
export function noteWorkerStarted(name: string, mb: number, now = Date.now()): void {
  startingOn(name).add(mb, now, undefined, WORKER_HOLD_MS);
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

/**
 * How long a tenant found to have had its share of a machine is not asked about again, unless a
 * run ends first. Each of a worker's claims looks once a second, and each look took the machine's
 * turn and a transaction to be told the same: in the soak of phase 35 twelve tenants' workers
 * kept a claim that had room waiting about six seconds behind those that had none.
 */
const SHARE_FOR_MS = 500;
/** Until when each tenant was last found to have had its share of each machine. */
const shareUntil = new Map<string, number>();
const shareKey = (machine: MachineClaim, tenantId: string) => `${machine.name}\n${tenantId}`;

/** Whether this machine was found full a moment ago, so a claim need not ask the database. */
export function machineFull(machine: MachineClaim | undefined, tenantId?: string): boolean {
  if (machine === undefined) return false;
  const now = Date.now();
  if ((fullUntil.get(machine.name) ?? 0) > now) return true;
  if (tenantId === undefined) return false;
  const key = shareKey(machine, tenantId);
  const until = shareUntil.get(key);
  if (until === undefined) return false;
  if (until > now) return true;
  shareUntil.delete(key);
  return false;
}

/** A slot came free somewhere: who had had their share may have room again. */
export function slotFreed(): void {
  shareUntil.clear();
}

/**
 * Runs a claim for a machine once the claims before it in this process are done.
 * A machine's claims are decided one at a time under a database lock; waiting for
 * that lock holds a connection, so dozens of workers waiting for it at once would
 * take every connection the control plane has. Waiting here holds none. A claim
 * that finds the machine full says so, and those after it return without asking;
 * one that finds its tenant has had its share says that, and that tenant's claims do.
 */
export async function onMachine<T>(
  machine: MachineClaim | undefined,
  claim: (noteFull: () => void, noteShare: () => void) => Promise<T>,
  tenantId?: string,
): Promise<T | undefined> {
  const noteFull = () => {
    if (machine) fullUntil.set(machine.name, Date.now() + FULL_FOR_MS);
  };
  const noteShare = () => {
    if (machine && tenantId) {
      shareUntil.set(shareKey(machine, tenantId), Date.now() + SHARE_FOR_MS);
    }
  };
  if (!machine) return claim(noteFull, noteShare);
  if (machineFull(machine, tenantId)) return undefined;
  const previous = turns.get(machine.name) ?? Promise.resolve();
  let release = () => {};
  const mine = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => mine);
  turns.set(machine.name, tail);
  await previous;
  try {
    if (machineFull(machine, tenantId)) return undefined;
    return await claim(noteFull, noteShare);
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

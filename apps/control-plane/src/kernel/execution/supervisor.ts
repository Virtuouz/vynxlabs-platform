import { type ChildProcess, spawn } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { sql } from "@volvel/db";
import {
  formatMachine,
  type MachineProbe,
  type MachineShare,
  MemoryGuard,
  machineShare,
  PLANNED_WORKER_MB,
  procProbe,
} from "@volvel/worker";
import type { Kernel } from "../kernel.js";
import {
  hasOutsideCodeWriters,
  setWorkerUserMode,
  type WorkerUserMode,
  workerUserMode,
} from "./isolation.js";
import { createWorkerCredential } from "./workers.js";

export interface SupervisorOptions {
  /** The address managed workers call. The control plane's own, on this machine. */
  url: string;
  /** A managed worker exits after this long with nothing to do. */
  idleExitSeconds?: number;
  /**
   * The user managed workers run as. `same` runs them as the control plane's own
   * user, by the operator's choice; the default for code that does not say.
   */
  user?: { uid: number; gid: number } | "same";
  /**
   * Starts workers only for tenants whose code only the operator writes: a
   * worker beside the control plane shares its network, and so can reach what
   * the control plane reaches (decision 0001). On unless `user` is `same`, by
   * which the operator says everyone who writes code works for them.
   */
  operatorCodeOnly?: boolean;
  /** Scripts running at once on this machine, across all managed workers. Default: from memory. */
  runSlots?: number;
  /** Free memory, in MB, below which no managed worker takes more work. Default: from memory. */
  memoryFloorMb?: number;
  /**
   * Managed workers alive at once. Default: twice the run slots. A worker waiting
   * for a slot costs far less than a script, and a tenant without one cannot even
   * wait its turn.
   */
  maxWorkers?: number;
  /** Where memory is read from. Replaced in tests. */
  probe?: MachineProbe;
  /** How a worker's process is started. Replaced in tests. */
  spawn?: typeof spawn;
  /** Which tenants have work waiting. Replaced in tests. */
  waiting?: (kernel: Kernel) => Promise<{ tenant_id: string }[]>;
}

interface Managed {
  child: ChildProcess;
  credentialId: string;
}

/** What a managed worker's environment may contain. Nothing that belongs to the instance. */
const PASSED_THROUGH = ["PATH", "HOME", "TMPDIR", "TZ", "LANG", "NODE_ENV", "NODE_EXTRA_CA_CERTS"];

/** A managed worker's credential outlives its process by design, but not by much. */
const CREDENTIAL_HOURS = 24;

/** How long the answer to "who writes this tenant's code" is kept. */
const WRITERS_CACHE_MS = 60_000;

/** Tenants with runs that a worker started by the instance should take. */
export async function tenantsNeedingWorkers(kernel: Kernel): Promise<{ tenant_id: string }[]> {
  const waiting = await sql<{ tenant_id: string }>`
    select distinct run.tenant_id from run
    join tenant on tenant.id = run.tenant_id
    where run.status = 'queued' and coalesce(run.scheduled_for, run.created_at) <= now()
      -- A run for a named pool waits for that pool's own worker, wherever it is.
      and run.pool is null
      -- And a tenant may run everything on workers of its own.
      and tenant.managed_workers
    union
    select distinct task.tenant_id from task
    join tenant on tenant.id = task.tenant_id
    where task.status = 'queued' and task.pool is null and tenant.managed_workers
  `.execute(kernel.db);
  return waiting.rows;
}

/**
 * Makes the credential for a new managed worker, unless one is already alive
 * for the tenant, started by this replica, another, or a worker host. Decided
 * under a lock per tenant, so no two can both start one.
 */
export async function claimManagedSlot(kernel: Kernel, tenantId: string) {
  return kernel.db.transaction().execute(async (trx) => {
    await sql`select pg_advisory_xact_lock(hashtext(${`managed-worker:${tenantId}`}))`.execute(trx);
    const alive = await sql<{ id: string }>`
      select c.id from worker_credential c
      where c.tenant_id = ${tenantId} and c.managed and c.revoked_at is null
        and (c.expires_at is null or c.expires_at > now())
        and (
          -- Just made, and its worker not yet heard from.
          c.created_at > now() - interval '30 seconds'
          or exists (
            select 1 from worker w
            where w.credential_id = c.id and w.last_seen_at > now() - interval '60 seconds'
          )
        )
      limit 1
    `.execute(trx);
    if (alive.rows.length > 0) return undefined;
    return createWorkerCredential(trx, {
      tenantId,
      name: "managed worker",
      managed: true,
      expiresAt: new Date(Date.now() + CREDENTIAL_HOURS * 3600_000),
    });
  });
}

/** A managed worker exited: its credential is of no further use. */
export async function endManagedSlot(kernel: Kernel, credentialId: string) {
  return kernel.db
    .updateTable("worker_credential")
    .set({ revoked_at: new Date() })
    .where("id", "=", credentialId)
    .where("managed", "=", true)
    .executeTakeFirst();
}

/**
 * The node that workers run on. The control plane may run on a copy that holds
 * the right to switch users; a worker must never hold it, or a script could
 * switch back.
 */
export function plainNode(execPath = process.execPath): string {
  return basename(execPath) === "node-cp" ? join(dirname(execPath), "node") : execPath;
}

/**
 * Starts one worker process per tenant that has work, so the smallest client
 * needs no deployment of its own. Each worker is an ordinary worker: it gets a
 * credential for its tenant on its standard input and talks to the control
 * plane over the worker protocol, with none of the instance's secrets in its
 * environment. Where it can, it runs as a user of its own.
 */
export class WorkerSupervisor {
  readonly #kernel: Kernel;
  readonly #options: SupervisorOptions;
  readonly #workers = new Map<string, Managed>();
  readonly #bin = fileURLToPath(import.meta.resolve("@volvel/worker/bin"));
  readonly #node = plainNode();
  readonly #writers = new Map<string, { outside: boolean; at: number }>();
  /** Tenants refused a managed worker, each told once in the log. */
  readonly #refused = new Set<string>();
  /** Revocations of exited workers' credentials still being written. */
  readonly #revoking = new Set<Promise<unknown>>();
  readonly #memory: MachineProbe;
  readonly #guard: MemoryGuard;
  /** What the managed workers on this machine share. */
  readonly machine: MachineShare;
  #mode: Promise<WorkerUserMode> | undefined;
  #stopped = false;
  /** Whether "too many workers" or "short of memory" was last said, so each is said once. */
  #held: "workers" | "memory" | undefined;

  constructor(kernel: Kernel, options: SupervisorOptions) {
    this.#kernel = kernel;
    this.#options = options;
    this.#memory = options.probe ?? procProbe;
    this.machine = machineShare(
      {
        ...(options.runSlots ? { slots: options.runSlots } : {}),
        ...(options.memoryFloorMb !== undefined ? { floorMb: options.memoryFloorMb } : {}),
      },
      this.#memory,
    );
    this.#guard = new MemoryGuard({
      probe: this.#memory,
      log: (level, message, fields) => kernel.log[level](fields ?? {}, message),
    });
  }

  /** Managed workers alive at once on this machine. */
  get maxWorkers(): number {
    return this.#options.maxWorkers ?? this.machine.slots * 2;
  }

  /** Why no more workers may start now, if none may. */
  #full(): "workers" | "memory" | undefined {
    if (this.#workers.size >= this.maxWorkers) return "workers";
    const memory = this.#memory.memory();
    // One more worker must leave the floor standing: a worker is memory too.
    if (memory && memory.availableMb < this.machine.floorMb + PLANNED_WORKER_MB) return "memory";
    return undefined;
  }

  /** Tenants that currently have a managed worker. */
  get tenants(): string[] {
    return [...this.#workers.keys()];
  }

  /** The environment a managed worker starts with. The credential is not in it. */
  environment(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const name of PASSED_THROUGH) {
      const value = process.env[name];
      if (value !== undefined) env[name] = value;
    }
    return {
      ...env,
      VOLVEL_URL: this.#options.url,
      VOLVEL_WORKER_IDLE_EXIT: String(this.#options.idleExitSeconds ?? 60),
      VOLVEL_WORKER_MACHINE: formatMachine(this.machine),
    };
  }

  /** Whether workers can be started as their own user, found out once. */
  mode(): Promise<WorkerUserMode> {
    this.#mode ??= this.#probe().then((found) => {
      setWorkerUserMode(found);
      return found;
    });
    return this.#mode;
  }

  async #probe(): Promise<WorkerUserMode> {
    const user = this.#options.user ?? "same";
    if (user === "same") return "shared";
    const switched = await new Promise<boolean>((resolve) => {
      try {
        const child = spawn(this.#node, ["-e", ""], {
          uid: user.uid,
          gid: user.gid,
          env: {},
          stdio: "ignore",
        });
        child.once("error", () => resolve(false));
        child.once("exit", (code) => resolve(code === 0));
      } catch {
        resolve(false);
      }
    });
    if (switched) {
      this.#kernel.log.info(
        { uid: user.uid, gid: user.gid },
        "managed workers run as their own user",
      );
      return "isolated";
    }
    this.#kernel.log.warn(
      { uid: user.uid, gid: user.gid },
      "managed workers cannot run as their own user: this process may not switch users. " +
        "Tenants whose code is written by anyone outside the operator get no managed worker. " +
        "Give the container CAP_SETUID and CAP_SETGID, or set MANAGED_WORKER_USER=same.",
    );
    return "unable";
  }

  /** Whether a tenant may have a worker started by the instance, as this process starts them. */
  async allowed(tenantId: string): Promise<boolean> {
    const restricted = this.#options.operatorCodeOnly ?? (this.#options.user ?? "same") !== "same";
    if (!restricted && (await this.mode()) !== "unable") return true;
    const known = this.#writers.get(tenantId);
    if (known && Date.now() - known.at < WRITERS_CACHE_MS) return !known.outside;
    const outside = await hasOutsideCodeWriters(this.#kernel, tenantId);
    this.#writers.set(tenantId, { outside, at: Date.now() });
    return !outside;
  }

  /** Starts a worker for each tenant that has runs waiting and no worker of ours. */
  async tick(): Promise<void> {
    if (this.#stopped) return;
    await this.mode();
    this.#guard.start();
    const waiting = { rows: await (this.#options.waiting ?? tenantsNeedingWorkers)(this.#kernel) };
    for (const { tenant_id: tenantId } of waiting.rows) {
      if (this.#workers.has(tenantId)) continue;
      // Past the cap, or short of memory, the work waits for a worker to finish and leave.
      const full = this.#full();
      if (full) {
        if (this.#held !== full) {
          this.#held = full;
          this.#kernel.log.warn(
            { workers: this.#workers.size, max: this.maxWorkers, machine: this.machine },
            full === "workers"
              ? "no more managed workers start until one exits: the machine has its most"
              : "no more managed workers start until memory frees up",
          );
        }
        return;
      }
      this.#held = undefined;
      if (!(await this.allowed(tenantId))) {
        if (!this.#refused.has(tenantId)) {
          this.#refused.add(tenantId);
          this.#kernel.log.warn(
            { tenantId },
            "no managed worker for this tenant: its code is written outside the operator, and a " +
              "worker started beside the control plane shares its network. Run a worker host " +
              "(MANAGED_WORKERS=host), or give the tenant a standalone worker.",
          );
        }
        continue;
      }
      this.#refused.delete(tenantId);
      await this.#start(tenantId);
    }
  }

  async #start(tenantId: string): Promise<void> {
    const { log } = this.#kernel;
    const credential = await claimManagedSlot(this.#kernel, tenantId);
    if (!credential) return;
    const user = this.#options.user;
    let child: ChildProcess;
    try {
      child = (this.#options.spawn ?? spawn)(this.#node, [this.#bin, "--token-stdin"], {
        env: this.environment(),
        stdio: ["pipe", "pipe", "pipe"],
        ...((await this.mode()) === "isolated" && user && user !== "same"
          ? { uid: user.uid, gid: user.gid }
          : {}),
      });
    } catch (error) {
      // Node throws at once when it may not switch users. The credential made for this worker
      // is of no use, and the next tick is not stopped by it.
      log.error({ err: error, tenantId }, "a managed worker could not be started");
      await endManagedSlot(this.#kernel, credential.row.id).catch(() => {});
      return;
    }
    // Handed over once, on a pipe, and kept out of the worker's environment and command line.
    child.stdin?.end(`${credential.token}\n`);
    this.#workers.set(tenantId, { child, credentialId: credential.row.id });
    log.info({ tenantId, pid: child.pid }, "started a managed worker");

    for (const stream of [child.stdout, child.stderr]) {
      if (!stream) continue;
      createInterface({ input: stream }).on("line", (line) => {
        log.info({ tenantId, source: "worker" }, line);
      });
    }
    child.once("exit", (code) => {
      this.#workers.delete(tenantId);
      log.info({ tenantId, code }, "a managed worker exited");
      // Its credential is of no further use.
      const revoking = endManagedSlot(this.#kernel, credential.row.id)
        .catch((error) =>
          log.warn({ err: error }, "a managed worker's credential could not be revoked"),
        )
        .finally(() => this.#revoking.delete(revoking));
      this.#revoking.add(revoking);
    });
    let spawned = false;
    child.once("spawn", () => {
      spawned = true;
    });
    child.on("error", (error) => {
      // A signal that was refused (a worker of its own user, and no CAP_KILL) is reported the
      // same way. The worker is still running and keeps its credential.
      if (spawned) {
        log.error({ err: error, tenantId }, "a signal to a managed worker was refused");
        return;
      }
      this.#workers.delete(tenantId);
      log.error({ err: error, tenantId }, "a managed worker could not be started");
      // It never ran: its credential is of no use either.
      void endManagedSlot(this.#kernel, credential.row.id).catch(() => {});
    });
  }

  /** Asks every managed worker to finish what it is doing and exit. */
  async stop(graceSeconds = 10, giveUpSeconds = 10): Promise<void> {
    this.#stopped = true;
    this.#guard.stop();
    const exits = [...this.#workers.values()].map(
      ({ child }) =>
        new Promise<void>((resolve) => {
          if (child.exitCode !== null) return resolve();
          const force = setTimeout(() => child.kill("SIGKILL"), graceSeconds * 1000);
          // A worker that cannot be signalled is left; the control plane goes on stopping.
          const giveUp = setTimeout(
            () => {
              this.#kernel.log.error(
                { pid: child.pid },
                "a managed worker could not be stopped and is left running",
              );
              resolve();
            },
            (graceSeconds + giveUpSeconds) * 1000,
          );
          child.once("exit", () => {
            clearTimeout(force);
            clearTimeout(giveUp);
            resolve();
          });
          child.kill("SIGTERM");
        }),
    );
    await Promise.all(exits);
    await Promise.all(this.#revoking);
  }
}

export { workerUserMode };

import { type ChildProcess, spawn } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { sql } from "@vynxlabs/db";
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
  `.execute(kernel.db);
  return waiting.rows;
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
  readonly #bin = fileURLToPath(import.meta.resolve("@vynxlabs/worker/bin"));
  readonly #node = plainNode();
  readonly #writers = new Map<string, { outside: boolean; at: number }>();
  /** Tenants refused a managed worker, each told once in the log. */
  readonly #refused = new Set<string>();
  /** Revocations of exited workers' credentials still being written. */
  readonly #revoking = new Set<Promise<unknown>>();
  #mode: Promise<WorkerUserMode> | undefined;
  #stopped = false;

  constructor(kernel: Kernel, options: SupervisorOptions) {
    this.#kernel = kernel;
    this.#options = options;
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
      PLATFORM_URL: this.#options.url,
      PLATFORM_WORKER_IDLE_EXIT: String(this.#options.idleExitSeconds ?? 60),
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
    if ((await this.mode()) !== "unable") return true;
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
    const waiting = { rows: await tenantsNeedingWorkers(this.#kernel) };
    for (const { tenant_id: tenantId } of waiting.rows) {
      if (this.#workers.has(tenantId)) continue;
      if (!(await this.allowed(tenantId))) {
        if (!this.#refused.has(tenantId)) {
          this.#refused.add(tenantId);
          this.#kernel.log.warn(
            { tenantId },
            "no managed worker for this tenant: its code is written outside the operator, " +
              "and workers cannot run as their own user here. It needs a standalone worker.",
          );
        }
        continue;
      }
      this.#refused.delete(tenantId);
      await this.#start(tenantId);
    }
  }

  /**
   * Makes the credential for a new managed worker, unless one is already alive
   * for the tenant, started by this replica or another. Decided under a lock
   * per tenant, so two replicas cannot both start one.
   */
  async #claimSlot(tenantId: string) {
    return this.#kernel.db.transaction().execute(async (trx) => {
      await sql`select pg_advisory_xact_lock(hashtext(${`managed-worker:${tenantId}`}))`.execute(
        trx,
      );
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

  async #start(tenantId: string): Promise<void> {
    const { db, log } = this.#kernel;
    const credential = await this.#claimSlot(tenantId);
    if (!credential) return;
    const user = this.#options.user;
    const child = spawn(this.#node, [this.#bin, "--token-stdin"], {
      env: this.environment(),
      stdio: ["pipe", "pipe", "pipe"],
      ...((await this.mode()) === "isolated" && user && user !== "same"
        ? { uid: user.uid, gid: user.gid }
        : {}),
    });
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
      const revoking = db
        .updateTable("worker_credential")
        .set({ revoked_at: new Date() })
        .where("id", "=", credential.row.id)
        .execute()
        .catch((error) =>
          log.warn({ err: error }, "a managed worker's credential could not be revoked"),
        )
        .finally(() => this.#revoking.delete(revoking));
      this.#revoking.add(revoking);
    });
    child.once("error", (error) => {
      this.#workers.delete(tenantId);
      log.error({ err: error, tenantId }, "a managed worker could not be started");
    });
  }

  /** Asks every managed worker to finish what it is doing and exit. */
  async stop(graceSeconds = 10): Promise<void> {
    this.#stopped = true;
    const exits = [...this.#workers.values()].map(
      ({ child }) =>
        new Promise<void>((resolve) => {
          if (child.exitCode !== null) return resolve();
          const force = setTimeout(() => child.kill("SIGKILL"), graceSeconds * 1000);
          child.once("exit", () => {
            clearTimeout(force);
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

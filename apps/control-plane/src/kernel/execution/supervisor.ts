import { type ChildProcess, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { sql } from "@vynxlabs/db";
import type { Kernel } from "../kernel.js";
import { createWorkerCredential } from "./workers.js";

export interface SupervisorOptions {
  /** The address managed workers call. The control plane's own, on this machine. */
  url: string;
  /** A managed worker exits after this long with nothing to do. */
  idleExitSeconds?: number;
}

interface Managed {
  child: ChildProcess;
  credentialId: string;
}

/** What a managed worker's environment may contain. Nothing that belongs to the instance. */
const PASSED_THROUGH = ["PATH", "HOME", "TMPDIR", "TZ", "LANG", "NODE_ENV", "NODE_EXTRA_CA_CERTS"];

/** A managed worker's credential outlives its process by design, but not by much. */
const CREDENTIAL_HOURS = 24;

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
 * Starts one worker process per tenant that has work, so the smallest client
 * needs no deployment of its own. Each worker is an ordinary worker: it gets a
 * credential for its tenant and talks to the control plane over the worker
 * protocol, with none of the instance's secrets in its environment.
 */
export class WorkerSupervisor {
  readonly #kernel: Kernel;
  readonly #options: SupervisorOptions;
  readonly #workers = new Map<string, Managed>();
  readonly #bin = fileURLToPath(import.meta.resolve("@vynxlabs/worker/bin"));
  #stopped = false;

  constructor(kernel: Kernel, options: SupervisorOptions) {
    this.#kernel = kernel;
    this.#options = options;
  }

  /** Tenants that currently have a managed worker. */
  get tenants(): string[] {
    return [...this.#workers.keys()];
  }

  /** The environment a managed worker starts with. */
  environment(token: string): Record<string, string> {
    const env: Record<string, string> = {};
    for (const name of PASSED_THROUGH) {
      const value = process.env[name];
      if (value !== undefined) env[name] = value;
    }
    return {
      ...env,
      PLATFORM_URL: this.#options.url,
      PLATFORM_WORKER_TOKEN: token,
      PLATFORM_WORKER_IDLE_EXIT: String(this.#options.idleExitSeconds ?? 60),
    };
  }

  /** Starts a worker for each tenant that has runs waiting and no worker of ours. */
  async tick(): Promise<void> {
    if (this.#stopped) return;
    const waiting = { rows: await tenantsNeedingWorkers(this.#kernel) };
    for (const { tenant_id: tenantId } of waiting.rows) {
      if (!this.#workers.has(tenantId)) await this.#start(tenantId);
    }
  }

  async #start(tenantId: string): Promise<void> {
    const { db, log } = this.#kernel;
    const credential = await createWorkerCredential(db, {
      tenantId,
      name: "managed worker",
      managed: true,
      expiresAt: new Date(Date.now() + CREDENTIAL_HOURS * 3600_000),
    });
    const child = spawn(process.execPath, [this.#bin], {
      env: this.environment(credential.token),
      stdio: ["ignore", "pipe", "pipe"],
    });
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
      db.updateTable("worker_credential")
        .set({ revoked_at: new Date() })
        .where("id", "=", credential.row.id)
        .execute()
        .catch((error) =>
          log.warn({ err: error }, "a managed worker's credential could not be revoked"),
        );
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
  }
}

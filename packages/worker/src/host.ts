import { type ChildProcess, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  formatMachine,
  type MachineProbe,
  type MachineShare,
  MemoryGuard,
  machineShare,
  procProbe,
} from "./machine.js";
import type { WorkerLog } from "./worker.js";

/**
 * The worker host (decision 0001). It runs in a container of its own, on a
 * network that reaches the control plane and the internet and nothing else of
 * the instance's, and starts the instance's managed workers there: it asks the
 * control plane for a lease, which names one tenant with work and carries a
 * worker credential for it, and starts an ordinary worker with that credential.
 *
 * It holds the instance's worker host token, which can ask for any tenant's
 * lease. So a worker never runs as the host's own user: a process of the same
 * user could read the token from the host's environment.
 */
export interface WorkerHostOptions {
  /** The control plane's address, as the workers reach it. */
  url: string;
  /** WORKER_HOST_TOKEN. */
  token: string;
  /** The user workers run as. Never the host's own. */
  user: { uid: number; gid: number };
  /** Workers alive at once. Default: twice the machine's run slots, as each costs memory too. */
  maxWorkers?: number;
  /** Scripts running at once on this machine, across all its workers. Default: from its memory. */
  runSlots?: number;
  /** Free memory below which no worker here takes more work, in MB. Default: from its memory. */
  memoryFloorMb?: number;
  /** Where memory is read from. Replaced in tests. */
  probe?: MachineProbe;
  log?: WorkerLog;
  /** The worker to start. Default: the one beside this file. */
  workerBin?: string;
  /** How long one lease request waits. Lower in tests. */
  leaseWaitSeconds?: number;
}

interface Lease {
  id: string;
  tenantId: string;
  token: string;
  idleExitSeconds: number;
}

/** What a worker's environment may hold. Nothing of the host's. */
const PASSED_THROUGH = ["PATH", "TZ", "LANG", "NODE_EXTRA_CA_CERTS"];

/** How often a lease's end is reported before it is left to expire. */
const ENDED_TRIES = 5;

/** The host refused the token. There is no point in going on. */
export class HostTokenRefused extends Error {}

export class WorkerHost {
  readonly #options: WorkerHostOptions;
  readonly #url: string;
  readonly #log: WorkerLog;
  readonly #bin: string;
  readonly #workers = new Map<string, ChildProcess>();
  readonly #probe: MachineProbe;
  readonly #guard: MemoryGuard;
  /** What this machine's workers share. */
  readonly machine: MachineShare;
  #stopping = false;
  #asking: AbortController | undefined;

  constructor(options: WorkerHostOptions) {
    this.#options = options;
    this.#url = options.url.replace(/\/+$/, "");
    this.#log = options.log ?? (() => {});
    this.#bin = options.workerBin ?? fileURLToPath(new URL("./bin.js", import.meta.url));
    this.#probe = options.probe ?? procProbe;
    this.machine = machineShare(
      {
        ...(options.runSlots ? { slots: options.runSlots } : {}),
        ...(options.memoryFloorMb !== undefined ? { floorMb: options.memoryFloorMb } : {}),
      },
      this.#probe,
    );
    this.#guard = new MemoryGuard({ probe: this.#probe, log: this.#log });
  }

  #shortOfMemory(): boolean {
    const memory = this.#probe.memory();
    return memory !== undefined && memory.availableMb < this.machine.floorMb;
  }

  /** Leases in progress, by lease. */
  get running(): number {
    return this.#workers.size;
  }

  /** Asks for leases and starts workers until stopped, or until the token is refused. */
  async run(): Promise<"stopped" | "refused"> {
    const max = this.#options.maxWorkers ?? this.machine.slots * 2;
    this.#log("info", "this machine's share", { ...this.machine, maxWorkers: max });
    this.#guard.start();
    while (!this.#stopping) {
      if (this.#workers.size >= max || this.#shortOfMemory()) {
        await sleep(1000);
        continue;
      }
      try {
        const lease = await this.#lease();
        if (lease) this.#start(lease);
      } catch (error) {
        if (error instanceof HostTokenRefused) {
          this.#log("error", "The control plane refused the worker host token.");
          this.#stopping = true;
          await this.stop();
          return "refused";
        }
        if (this.#stopping) break;
        this.#log("warn", "The control plane could not be reached. Trying again.", {
          error: (error as Error).message,
        });
        await sleep(2000);
      }
    }
    return "stopped";
  }

  /** Stops asking, and asks each worker to finish what it is doing and exit. */
  async stop(graceSeconds = 30): Promise<void> {
    this.#stopping = true;
    this.#asking?.abort();
    this.#guard.stop();
    await Promise.all(
      [...this.#workers.values()].map(
        (child) =>
          new Promise<void>((resolve) => {
            if (child.exitCode !== null || child.signalCode !== null) return resolve();
            const force = setTimeout(() => child.kill("SIGKILL"), graceSeconds * 1000);
            child.once("exit", () => {
              clearTimeout(force);
              resolve();
            });
            child.kill("SIGTERM");
          }),
      ),
    );
  }

  async #call(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    const response = await fetch(`${this.#url}/api/v1/worker-host${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.#options.token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
    if (response.status === 401) throw new HostTokenRefused();
    if (!response.ok) {
      throw new Error(`POST ${path} answered ${response.status}: ${await response.text()}`);
    }
    return response;
  }

  async #lease(): Promise<Lease | null> {
    this.#asking = new AbortController();
    try {
      const response = await this.#call(
        "/lease",
        { waitSeconds: this.#options.leaseWaitSeconds ?? 20 },
        this.#asking.signal,
      );
      return ((await response.json()) as { lease: Lease | null }).lease;
    } catch (error) {
      if (this.#stopping) return null;
      throw error;
    } finally {
      this.#asking = undefined;
    }
  }

  #start(lease: Lease) {
    const env: Record<string, string> = {};
    for (const name of PASSED_THROUGH) {
      const value = process.env[name];
      if (value !== undefined) env[name] = value;
    }
    const { uid, gid } = this.#options.user;
    const child = spawn(process.execPath, [this.#bin, "--token-stdin"], {
      env: {
        ...env,
        HOME: "/tmp",
        VOLVEL_URL: this.#url,
        VOLVEL_WORKER_IDLE_EXIT: String(lease.idleExitSeconds),
        VOLVEL_WORKER_MACHINE: formatMachine(this.machine),
      },
      stdio: ["pipe", "pipe", "pipe"],
      uid,
      gid,
    });
    // Handed over once, on a pipe, and kept out of the worker's environment and command line.
    child.stdin?.end(`${lease.token}\n`);
    this.#workers.set(lease.id, child);
    this.#log("info", "started a worker", { tenantId: lease.tenantId, pid: child.pid });
    for (const stream of [child.stdout, child.stderr]) {
      if (!stream) continue;
      createInterface({ input: stream }).on("line", (line) =>
        this.#log("info", line, { tenantId: lease.tenantId, source: "worker" }),
      );
    }
    let ended = false;
    const end = (code: number | null) => {
      if (ended) return;
      ended = true;
      this.#workers.delete(lease.id);
      this.#log("info", "a worker exited", { tenantId: lease.tenantId, code });
      void this.#ended(lease);
    };
    child.once("exit", end);
    child.once("error", (error) => {
      this.#log("error", "a worker could not be started", {
        tenantId: lease.tenantId,
        error: error.message,
      });
      end(null);
    });
  }

  /** Says the lease is over, so its credential is revoked now rather than when it expires. */
  async #ended(lease: Lease) {
    for (let attempt = 0; attempt < ENDED_TRIES; attempt += 1) {
      try {
        await this.#call(`/leases/${lease.id}/ended`, undefined);
        return;
      } catch {
        await sleep(500 * 2 ** attempt);
      }
    }
    this.#log("warn", "a lease's end could not be reported; its credential expires by itself", {
      tenantId: lease.tenantId,
    });
  }
}

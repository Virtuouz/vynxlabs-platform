import { type ChildProcess, fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { setPriority, tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { type Bundle, type BundleManifest, bundleDigest } from "@volvel/manifest";
import {
  allowedCall,
  type Bound,
  type Claimed,
  isTask,
  type Job,
  type LogEntry,
  TASK_KINDS,
  type TaskJob,
} from "./context.js";
import { type MachineProbe, type MachineShare, NODE_OVERHEAD_MB, procProbe } from "./machine.js";
import type { FromRunner, ToRunner } from "./runner.js";
import { attemptSpan, sendAttemptSpan, type WorkerTelemetry } from "./trace.js";

export type WorkerLog = (
  level: "info" | "warn" | "error",
  message: string,
  fields?: Record<string, unknown>,
) => void;

export interface WorkerOptions {
  /** The control plane's address. */
  url: string;
  /** A worker credential. */
  token: string;
  /** How many runs this worker handles at once. Default 4. */
  concurrency?: number;
  /** Stop after this long with nothing to do. Default: never. */
  idleExitSeconds?: number;
  /** Where downloaded bundles are kept. Default: a new directory under the system's temp directory. */
  cacheDir?: string;
  log?: WorkerLog;
  /** How long one claim waits for work. Lower in tests. */
  claimWaitSeconds?: number;
  /** The runner each attempt is started with. Default: the one beside this file. */
  runner?: string;
  /**
   * The machine this worker shares with others, when the host or control plane that
   * started it says: the control plane holds all of them to its slots, and none
   * claims while the machine is short of memory.
   */
  machine?: MachineShare;
  /** Where memory is read from. Replaced in tests. */
  probe?: MachineProbe;
  /** Where this worker sends a span for each attempt. Without it, it sends none. */
  telemetry?: WorkerTelemetry | undefined;
}

/** A bundle's code on disk, and what it says it contains. */
interface CachedBundle {
  file: string;
  manifests: BundleManifest[];
}

/** The control plane refused the credential. There is no point in going on. */
class CredentialRefused extends Error {}

/** The control plane said this attempt is over: canceled, timed out or taken back. */
class AttemptOver extends Error {}

/** The control plane is busy, and said when to try again. Nothing was done. */
class Busy extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
  }
}

/** How often a script's call is tried again when the control plane is busy. */
const BUSY_RETRIES = 2;
/** The longest a script's call waits before trying again, in seconds. */
const BUSY_WAIT_LIMIT = 5;

const WORKER_VERSION = "0.7.0";

/** Log lines kept while the control plane cannot be reached. Past this, the oldest go. */
const MAX_PENDING_LOGS = 5000;
/** The most lines the control plane takes in one request. */
const LOG_BATCH = 500;
/** How often the last send of an attempt is tried, and the first pause between tries. */
const LOG_FINAL_TRIES = 3;
const LOG_RETRY_MS = 250;

/** Memory for a script that does not say, in MB. */
const DEFAULT_MEMORY_MB = 512;
/** How long a script told to stop has before its process is ended. */
const ABORT_GRACE_MS = 3000;
/** Bundles kept on disk at once. */
const MAX_BUNDLE_FILES = 50;
/** How much of a script process's stderr is kept to explain its end. */
const STDERR_KEPT = 2048;

/** What a script's process may see of the worker's environment. Never the credential. */
const RUNNER_ENVIRONMENT = ["PATH", "TZ", "LANG", "TMPDIR", "NODE_EXTRA_CA_CERTS"];

function runnerEnvironment(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of RUNNER_ENVIRONMENT) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  return env;
}

/**
 * The runner beside this file. Run from its TypeScript source, as in this
 * package's own tests, the built one is used.
 */
function defaultRunner(): string {
  const beside = fileURLToPath(new URL("./runner.js", import.meta.url));
  if (existsSync(beside)) return beside;
  return fileURLToPath(new URL("../dist/runner.js", import.meta.url));
}

/** How often a script's memory is looked at. */
const MEMORY_CHECK_MS = 500;
/** How long a worker waits before claiming again when its machine is short of memory. */
const LOW_MEMORY_WAIT_MS = 2000;

/** Why a script's process ended without saying how its script did. */
function processEnded(
  code: number | null,
  signal: NodeJS.Signals | null,
  stderr: string,
  memoryMb: number,
  /** Who ended it, when it was ended: over its memory, by this worker, or by neither. */
  killed: "memory" | "worker" | undefined,
): Error {
  const error =
    killed === "memory" || /heap out of memory|Allocation failed/i.test(stderr) || code === 134
      ? new Error(`The script ran out of memory (${memoryMb} MB).`)
      : signal === "SIGKILL" && killed === undefined
        ? new Error("The script was stopped: the machine ran low on memory.")
        : new Error(
            `The script's process ended unexpectedly (${signal ? `signal ${signal}` : `code ${code}`}).`,
          );
  if (stderr.trim()) error.stack = `${error.message}\n${stderr.trim()}`;
  return error;
}

/** A script's process, watched: it may hold its `memoryMb` and Node's own beside it, no more. */
interface ScriptProcess {
  child: ChildProcess;
  /** Ends the process now, as this worker's own decision. */
  kill(): void;
  /** Why it ended, once it has. */
  ended(code: number | null, signal: NodeJS.Signals | null): Error;
  dispose(): void;
}

function startScript(runner: string, memoryMb: number, probe: MachineProbe): ScriptProcess {
  const child = fork(runner, [], {
    env: runnerEnvironment(),
    execArgv: [`--max-old-space-size=${memoryMb}`],
    stdio: ["ignore", "inherit", "pipe", "ipc"],
  });
  // Scripts give way to the control plane and to the worker that reports on them.
  if (child.pid !== undefined) {
    try {
      setPriority(child.pid, 10);
    } catch {
      // Not allowed here: they run at the worker's own priority.
    }
  }
  // What the script's process says on stderr goes on to the worker's, and its end is kept
  // to say why the process died, if it does.
  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(chunk);
    stderr = (stderr + chunk.toString("utf8")).slice(-STDERR_KEPT);
  });
  let killed: "memory" | "worker" | undefined;
  // The heap limit covers only what JavaScript holds. Buffers, and what native code holds,
  // are counted here instead, from what the process holds in all.
  const limitMb = memoryMb + NODE_OVERHEAD_MB;
  const watching =
    child.pid !== undefined && probe.rssMb(child.pid) !== undefined
      ? setInterval(() => {
          const held = child.pid === undefined ? undefined : probe.rssMb(child.pid);
          if (held !== undefined && held > limitMb && killed === undefined) {
            killed = "memory";
            child.kill("SIGKILL");
          }
        }, MEMORY_CHECK_MS)
      : undefined;
  return {
    child,
    kill() {
      killed ??= "worker";
      child.kill("SIGKILL");
    },
    ended(code, signal) {
      return processEnded(code, signal, stderr, memoryMb, killed);
    },
    dispose() {
      clearInterval(watching);
    },
  };
}

/** Ends a script's process with its attempt: now, or when the grace already given runs out. */
function endScript(script: ScriptProcess | undefined, killing: NodeJS.Timeout | undefined) {
  if (!script) return;
  const { child } = script;
  if (child.exitCode === null && child.signalCode === null) {
    if (!killing) script.kill();
    child.once("exit", () => {
      clearTimeout(killing);
      script.dispose();
    });
  } else {
    script.dispose();
  }
}

/**
 * Runs a tenant's scripts. It only ever calls the control plane: it claims a
 * job, downloads the bundle the run is pinned to, runs the script in a process
 * of its own, and reports back. The script's process never holds the credential.
 */
export class Worker {
  readonly id = randomUUID();
  readonly #options: WorkerOptions;
  readonly #url: string;
  readonly #log: WorkerLog;
  readonly #cacheDir: string;
  readonly #runner: string;
  readonly #probe: MachineProbe;
  /** Bundles on disk by digest, least recently used first. */
  readonly #bundles = new Map<string, Promise<CachedBundle>>();
  #stopping = false;
  #inFlight = 0;
  #lastWork = Date.now();
  #claims = new Set<AbortController>();

  constructor(options: WorkerOptions) {
    this.#options = options;
    this.#url = options.url.replace(/\/+$/, "");
    this.#log = options.log ?? (() => {});
    this.#cacheDir = options.cacheDir ?? join(tmpdir(), `volvel-worker-${this.id}`);
    this.#runner = options.runner ?? defaultRunner();
    this.#probe = options.probe ?? procProbe;
  }

  /** Whether the machine has too little memory left to start another script. */
  #shortOfMemory(): boolean {
    const floor = this.#options.machine?.floorMb;
    if (!floor) return false;
    const memory = this.#probe.memory();
    return memory !== undefined && memory.availableMb < floor;
  }

  /** Works until `stop()` is called, the credential is refused, or it has been idle long enough. */
  async run(): Promise<"stopped" | "idle" | "refused"> {
    await mkdir(this.#cacheDir, { recursive: true });
    let reason: "stopped" | "idle" | "refused" = "stopped";
    const slots = Array.from({ length: this.#options.concurrency ?? 4 }, async () => {
      while (!this.#stopping) {
        if (this.#shortOfMemory()) {
          // Not idle: the work is there, the memory is not. Wait for it.
          this.#lastWork = Date.now();
          await sleep(LOW_MEMORY_WAIT_MS);
          continue;
        }
        try {
          const job = await this.#claim();
          if (job) {
            this.#inFlight += 1;
            try {
              await (isTask(job) ? this.#task(job) : this.#execute(job));
            } finally {
              this.#inFlight -= 1;
              this.#lastWork = Date.now();
            }
          } else if (this.#idle()) {
            reason = "idle";
            this.#stopping = true;
          }
        } catch (error) {
          if (error instanceof CredentialRefused) {
            reason = "refused";
            this.#stopping = true;
          } else if (!this.#stopping) {
            this.#log("warn", "The control plane could not be reached. Trying again.", {
              error: (error as Error).message,
            });
            await sleep(2000);
          }
        }
      }
    });
    await Promise.all(slots);
    await rm(this.#cacheDir, { recursive: true, force: true });
    return reason;
  }

  /**
   * Stops taking new work and lets runs in progress finish. A claim that is
   * still waiting is dropped: the control plane sees the connection close and
   * hands out nothing for it.
   */
  stop(): void {
    this.#stopping = true;
    for (const claim of this.#claims) claim.abort();
  }

  #idle(): boolean {
    const limit = this.#options.idleExitSeconds;
    return (
      limit !== undefined && this.#inFlight === 0 && Date.now() - this.#lastWork > limit * 1000
    );
  }

  async #call<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${this.#url}/api/v1/worker${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.#options.token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
    if (response.status === 401) throw new CredentialRefused("The worker credential was refused.");
    if (response.status === 409) throw new AttemptOver();
    const text = await response.text();
    if (!response.ok) {
      let detail = text;
      try {
        detail = JSON.parse(text).detail ?? text;
      } catch {
        // Not a problem document.
      }
      const message = `${method} ${path} answered ${response.status}: ${detail}`;
      if (response.status === 503 && response.headers.get("retry-after")) {
        throw new Busy(message, Number(response.headers.get("retry-after")) || 1);
      }
      throw new Error(message);
    }
    return (text === "" ? undefined : JSON.parse(text)) as T;
  }

  async #claim(): Promise<Claimed | null> {
    const abort = new AbortController();
    this.#claims.add(abort);
    try {
      const reply = await this.#call<{ job: Claimed | null }>(
        "POST",
        "/claim",
        {
          workerId: this.id,
          version: WORKER_VERSION,
          waitSeconds: this.#options.claimWaitSeconds ?? 20,
          kinds: ["run", ...TASK_KINDS],
          ...(this.#options.machine
            ? {
                machine: {
                  name: this.#options.machine.name,
                  slots: this.#options.machine.slots,
                },
              }
            : {}),
        },
        abort.signal,
      );
      return reply.job;
    } catch (error) {
      if (this.#stopping) return null;
      throw error;
    } finally {
      this.#claims.delete(abort);
    }
  }

  /**
   * A bundle's code on disk, downloaded and checked once, then reused by every
   * attempt that runs it. Each attempt imports it in a process of its own, so
   * nothing of it stays in the worker's memory. Past `MAX_BUNDLE_FILES` the
   * least recently used are removed.
   */
  #bundleFile(bundle: { id: string; digest: string }): Promise<CachedBundle> {
    let loading = this.#bundles.get(bundle.digest);
    if (loading) {
      // Most recently used goes last.
      this.#bundles.delete(bundle.digest);
      this.#bundles.set(bundle.digest, loading);
      return loading;
    }
    loading = (async () => {
      const content = await this.#call<Bundle>("GET", `/bundles/${bundle.id}`);
      if (bundleDigest(content) !== bundle.digest) {
        throw new Error("The downloaded bundle does not match its digest.");
      }
      const file = join(this.#cacheDir, `${bundle.digest}.mjs`);
      await writeFile(file, content.code);
      return { file, manifests: content.manifests };
    })();
    this.#bundles.set(bundle.digest, loading);
    loading.catch(() => this.#bundles.delete(bundle.digest));
    while (this.#bundles.size > MAX_BUNDLE_FILES) {
      const [oldest] = this.#bundles.keys();
      if (oldest === undefined) break;
      this.#bundles.delete(oldest);
      // An attempt that already started has the module loaded; a new one downloads it again.
      void rm(join(this.#cacheDir, `${oldest}.mjs`), { force: true });
    }
    return loading;
  }

  async #execute(job: Job): Promise<void> {
    const runPath = `/runs/${job.runId}`;
    const began = Date.now();
    /** Why the attempt failed, when it did: said on its span. */
    let failed: string | undefined;
    const abort = new AbortController();
    /** Why the attempt ended early, when the control plane ended it. */
    let ended: AttemptOver | CredentialRefused | undefined;

    // Log lines wait here until the control plane has them. A line that cannot be
    // sent stays for the next try; only past the limit, or at the very end, is it
    // given up, and then it is counted so the run can say so.
    const pending: LogEntry[] = [];
    let lost = 0;
    const bound = () => {
      const excess = pending.length - MAX_PENDING_LOGS;
      if (excess > 0) {
        pending.splice(0, excess);
        lost += excess;
      }
    };
    const send = async () => {
      while (pending.length > 0) {
        const entries = pending.splice(0, LOG_BATCH);
        try {
          await this.#call("POST", `${runPath}/logs`, { attempt: job.attempt, entries });
        } catch (error) {
          pending.unshift(...entries);
          bound();
          throw error;
        }
      }
    };
    // One send at a time, so lines arrive in the order they were written.
    let sending: Promise<void> = Promise.resolve();
    const flush = (tries = 1) => {
      sending = sending.then(async () => {
        for (let attempt = 0; attempt < tries; attempt += 1) {
          try {
            await send();
            return;
          } catch {
            if (attempt + 1 < tries) await sleep(LOG_RETRY_MS * 2 ** attempt);
          }
        }
      });
      return sending;
    };
    /** The last send of the attempt: what still cannot be sent is counted as lost. */
    const settle = async () => {
      await flush(LOG_FINAL_TRIES);
      lost += pending.length;
      pending.length = 0;
      return lost > 0 ? { logsLost: lost } : {};
    };

    const heartbeat = setInterval(async () => {
      await flush();
      try {
        const reply = await this.#call<{ cancelled: boolean }>("POST", `${runPath}/heartbeat`, {
          attempt: job.attempt,
          workerId: this.id,
        });
        if (reply.cancelled) {
          ended = new AttemptOver();
          abort.abort(new Error("The run was canceled."));
        }
      } catch {
        // A missed heartbeat is not fatal. The next one may get through.
      }
    }, Math.max(1, job.heartbeatSeconds) * 1000);
    const timeout = setTimeout(
      () =>
        abort.abort(
          new Error(`The run took longer than its limit of ${job.timeoutSeconds} seconds.`),
        ),
      job.timeoutSeconds * 1000,
    );

    let script: ScriptProcess | undefined;
    let killing: NodeJS.Timeout | undefined;
    try {
      const bundle = await this.#bundleFile(job.bundle);
      const memoryMb = job.memoryMb ?? DEFAULT_MEMORY_MB;
      script = startScript(this.#runner, memoryMb, this.#probe);
      const { child: started } = script;
      const watched = script;

      const outcome = new Promise<unknown>((resolve, reject) => {
        started.on("message", (message: FromRunner) => {
          if (message.t === "log") {
            pending.push(message.entry);
            bound();
          } else if (message.t === "call") {
            void this.#answer(job, started, message).catch((error) => {
              if (error instanceof AttemptOver || error instanceof CredentialRefused) {
                ended = error;
                abort.abort(error);
              }
            });
          } else if (message.t === "done") {
            resolve(message.output);
          } else if (message.t === "failed") {
            const failure = new Error(message.error.message);
            if (message.error.stack) failure.stack = message.error.stack;
            reject(failure);
          }
        });
        started.once("exit", (code, signal) => reject(watched.ended(code, signal)));
        started.once("error", reject);
      });
      started.send({
        t: "start",
        job,
        bundleFile: bundle.file,
        manifests: bundle.manifests,
      } satisfies ToRunner);

      // A script that ignores the signal must not hold the attempt open past its limit:
      // it is told, then its process is ended.
      const aborted = new Promise<never>((_, reject) => {
        const stop = () => {
          if (started.connected)
            started.send({
              t: "abort",
              message: String((abort.signal.reason as Error)?.message ?? abort.signal.reason),
            } satisfies ToRunner);
          killing = setTimeout(() => watched.kill(), ABORT_GRACE_MS);
          reject(abort.signal.reason);
        };
        if (abort.signal.aborted) stop();
        else abort.signal.addEventListener("abort", stop, { once: true });
      });
      const output = await Promise.race([outcome, aborted]);
      const logs = await settle();
      await this.#call("POST", `${runPath}/complete`, { attempt: job.attempt, output, ...logs });
    } catch (error) {
      const logs = await settle();
      if (error instanceof CredentialRefused || ended instanceof CredentialRefused) {
        throw ended ?? error;
      }
      // A canceled or reclaimed attempt has nothing left to report.
      if (ended || error instanceof AttemptOver) return;
      const failure = error instanceof Error ? error : new Error(String(error));
      failed = failure.message;
      await this.#call("POST", `${runPath}/fail`, {
        attempt: job.attempt,
        ...logs,
        error: {
          message: failure.message.slice(0, 8000),
          ...(failure.stack ? { stack: failure.stack.slice(0, 32000) } : {}),
        },
      }).catch((reportError) => {
        if (reportError instanceof CredentialRefused) throw reportError;
        if (!(reportError instanceof AttemptOver)) {
          this.#log("warn", "A failure could not be reported.", {
            runId: job.runId,
            error: reportError.message,
          });
        }
      });
    } finally {
      clearInterval(heartbeat);
      clearTimeout(timeout);
      // Whatever the script left running ends with its attempt. An aborted one had its
      // grace to stop by itself; any other is ended now.
      endScript(script, killing);
      // The worker's own span of the attempt, sent only by a worker told where to send it.
      const telemetry = this.#options.telemetry;
      const span = telemetry
        ? attemptSpan(telemetry, job, this.id, began, Date.now(), failed)
        : undefined;
      if (telemetry && span) void sendAttemptSpan(telemetry, span);
    }
  }

  /**
   * Does a task: in a process of its own, as a run is, with the same limits,
   * but given what it needs at its start and able to ask for nothing more.
   */
  async #task(job: TaskJob): Promise<void> {
    const taskPath = `/tasks/${job.taskId}`;
    const abort = new AbortController();
    let ended: AttemptOver | CredentialRefused | undefined;
    const end = (error: unknown) => {
      if (error instanceof AttemptOver || error instanceof CredentialRefused) {
        ended = error;
        abort.abort(error);
      }
    };
    const heartbeat = setInterval(
      () => void this.#call("POST", `${taskPath}/heartbeat`).catch(end),
      Math.max(1, job.heartbeatSeconds) * 1000,
    );
    const timeout = setTimeout(
      () =>
        abort.abort(
          new Error(`The task took longer than its limit of ${job.timeoutSeconds} seconds.`),
        ),
      job.timeoutSeconds * 1000,
    );
    let script: ScriptProcess | undefined;
    let killing: NodeJS.Timeout | undefined;
    try {
      const bundle = job.request.bundle ? await this.#bundleFile(job.request.bundle) : undefined;
      const bound = job.request.connection
        ? await this.#call<Bound>("GET", `${taskPath}/connection`)
        : undefined;
      const memoryMb = job.memoryMb ?? DEFAULT_MEMORY_MB;
      script = startScript(this.#runner, memoryMb, this.#probe);
      const { child: started } = script;
      const watched = script;
      const outcome = new Promise<unknown>((resolve, reject) => {
        started.on("message", (message: FromRunner) => {
          if (message.t === "call") {
            // A task is given what it needs. It may ask for nothing.
            if (started.connected) {
              started.send({
                t: "reply",
                id: message.id,
                error: "This call is not open to a task.",
              } satisfies ToRunner);
            }
          } else if (message.t === "done") {
            resolve(message.output);
          } else if (message.t === "failed") {
            reject(new Error(message.error.message));
          }
        });
        started.once("exit", (code, signal) => reject(watched.ended(code, signal)));
        started.once("error", reject);
      });
      started.send({
        t: "task",
        job,
        ...(bundle ? { bundleFile: bundle.file, manifests: bundle.manifests } : {}),
        ...(bound ? { bound } : {}),
      } satisfies ToRunner);
      const aborted = new Promise<never>((_, reject) => {
        const stop = () => {
          killing = setTimeout(() => watched.kill(), ABORT_GRACE_MS);
          reject(abort.signal.reason);
        };
        if (abort.signal.aborted) stop();
        else abort.signal.addEventListener("abort", stop, { once: true });
      });
      const result = await Promise.race([outcome, aborted]);
      await this.#call("POST", `${taskPath}/complete`, { result: result ?? null });
    } catch (error) {
      if (error instanceof CredentialRefused || ended instanceof CredentialRefused) {
        throw ended ?? error;
      }
      if (ended || error instanceof AttemptOver) return;
      await this.#call("POST", `${taskPath}/fail`, {
        error: { message: ((error as Error).message ?? String(error)).slice(0, 8000) },
      }).catch((reportError) => {
        if (reportError instanceof CredentialRefused) throw reportError;
        if (!(reportError instanceof AttemptOver)) {
          this.#log("warn", "A task's failure could not be reported.", {
            taskId: job.taskId,
            error: reportError.message,
          });
        }
      });
    } finally {
      clearInterval(heartbeat);
      clearTimeout(timeout);
      endScript(script, killing);
    }
  }

  /** Makes a call a script asked for, if it is one its own run may make, and answers it. */
  async #answer(
    job: Job,
    child: ChildProcess,
    message: Extract<FromRunner, { t: "call" }>,
  ): Promise<void> {
    const reply = (answer: ToRunner) => {
      if (child.connected) child.send(answer);
    };
    if (!allowedCall(job, message.method, message.path)) {
      reply({ t: "reply", id: message.id, error: "This call is not open to a script." });
      return;
    }
    // The attempt is the worker's to say, not the script's.
    let path = message.path;
    let body = message.body;
    if (message.method === "GET") {
      const [base, query = ""] = path.split("?");
      const params = new URLSearchParams(query);
      params.set("attempt", String(job.attempt));
      path = `${base}?${params}`;
    } else if (body && typeof body === "object" && !Array.isArray(body)) {
      body = { ...(body as Record<string, unknown>), attempt: job.attempt };
    }
    try {
      // A busy control plane did nothing with the call, and says when to try again.
      let result: unknown;
      for (let attempt = 0; ; attempt += 1) {
        try {
          result = await this.#call<unknown>(message.method, path, body);
          break;
        } catch (error) {
          if (!(error instanceof Busy) || attempt >= BUSY_RETRIES) throw error;
          await sleep(Math.min(error.retryAfterSeconds, BUSY_WAIT_LIMIT) * 1000);
        }
      }
      reply({ t: "reply", id: message.id, result });
    } catch (error) {
      reply({ t: "reply", id: message.id, error: (error as Error).message ?? String(error) });
      if (error instanceof AttemptOver || error instanceof CredentialRefused) throw error;
    }
  }
}

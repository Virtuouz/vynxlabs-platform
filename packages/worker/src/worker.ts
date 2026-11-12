import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { type Bundle, bundleDigest } from "@vynxlabs/manifest";
import { type Connector, httpConnector, type ScriptContext, type TableClient } from "@vynxlabs/sdk";

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
}

interface Job {
  runId: string;
  attempt: number;
  workspaceId: string;
  script: { path: string; entry: string };
  input: unknown;
  bundle: { id: string; digest: string };
  timeoutSeconds: number;
  heartbeatSeconds: number;
  idempotencyKey: string;
  trigger: { type: string; [detail: string]: unknown };
  /** Absent from a control plane older than 0.4.0. */
  startedBy?: { type: string; id: string | null };
}

interface LogEntry {
  time: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  fields?: Record<string, unknown>;
}

/** The control plane refused the credential. There is no point in going on. */
class CredentialRefused extends Error {}

/** The control plane said this attempt is over: cancelled, timed out or taken back. */
class AttemptOver extends Error {}

const WORKER_VERSION = "0.4.0";

/**
 * Runs a tenant's scripts. It only ever calls the control plane: it claims a
 * job, downloads the bundle the run is pinned to, runs the script, and reports
 * back.
 */
export class Worker {
  readonly id = randomUUID();
  readonly #options: WorkerOptions;
  readonly #url: string;
  readonly #log: WorkerLog;
  readonly #cacheDir: string;
  readonly #modules = new Map<string, Promise<Record<string, unknown>>>();
  readonly #connectors = new Map<string, Connector<unknown, unknown>>([
    ["http", httpConnector as Connector<unknown, unknown>],
  ]);
  #stopping = false;
  #inFlight = 0;
  #lastWork = Date.now();
  #claims = new Set<AbortController>();

  constructor(options: WorkerOptions) {
    this.#options = options;
    this.#url = options.url.replace(/\/+$/, "");
    this.#log = options.log ?? (() => {});
    this.#cacheDir = options.cacheDir ?? join(tmpdir(), `platform-worker-${this.id}`);
  }

  /** Works until `stop()` is called, the credential is refused, or it has been idle long enough. */
  async run(): Promise<"stopped" | "idle" | "refused"> {
    await mkdir(this.#cacheDir, { recursive: true });
    let reason: "stopped" | "idle" | "refused" = "stopped";
    const slots = Array.from({ length: this.#options.concurrency ?? 4 }, async () => {
      while (!this.#stopping) {
        try {
          const job = await this.#claim();
          if (job) {
            this.#inFlight += 1;
            try {
              await this.#execute(job);
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
      throw new Error(`${method} ${path} answered ${response.status}: ${detail}`);
    }
    return (text === "" ? undefined : JSON.parse(text)) as T;
  }

  async #claim(): Promise<Job | null> {
    const abort = new AbortController();
    this.#claims.add(abort);
    try {
      const reply = await this.#call<{ job: Job | null }>(
        "POST",
        "/claim",
        {
          workerId: this.id,
          version: WORKER_VERSION,
          waitSeconds: this.#options.claimWaitSeconds ?? 20,
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

  /** The module of a bundle, downloaded and checked once, then reused. */
  #module(bundle: Job["bundle"]): Promise<Record<string, unknown>> {
    let loading = this.#modules.get(bundle.digest);
    if (!loading) {
      loading = (async () => {
        const content = await this.#call<Bundle>("GET", `/bundles/${bundle.id}`);
        if (bundleDigest(content) !== bundle.digest) {
          throw new Error("The downloaded bundle does not match its digest.");
        }
        const file = join(this.#cacheDir, `${bundle.digest}.mjs`);
        await writeFile(file, content.code);
        return (await import(pathToFileURL(file).href)) as Record<string, unknown>;
      })();
      this.#modules.set(bundle.digest, loading);
      loading.catch(() => this.#modules.delete(bundle.digest));
    }
    return loading;
  }

  async #execute(job: Job): Promise<void> {
    const runPath = `/runs/${job.runId}`;
    const abort = new AbortController();
    let over = false;

    const pending: LogEntry[] = [];
    const flush = async () => {
      if (pending.length === 0) return;
      const entries = pending.splice(0, pending.length);
      await this.#call("POST", `${runPath}/logs`, { attempt: job.attempt, entries }).catch(
        () => {},
      );
    };
    const write =
      (level: LogEntry["level"]) => (message: string, fields?: Record<string, unknown>) => {
        pending.push({
          time: new Date().toISOString(),
          level,
          message: String(message),
          ...(fields ? { fields } : {}),
        });
      };

    const heartbeat = setInterval(async () => {
      await flush();
      try {
        const reply = await this.#call<{ cancelled: boolean }>("POST", `${runPath}/heartbeat`, {
          attempt: job.attempt,
          workerId: this.id,
        });
        if (reply.cancelled) {
          over = true;
          abort.abort(new Error("The run was cancelled."));
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

    const data = async <T>(
      table: string,
      source: string | undefined,
      as: string | undefined,
      op: string,
      args: object,
    ) =>
      (
        await this.#call<{ result: T }>("POST", `${runPath}/data`, {
          attempt: job.attempt,
          table,
          ...(source ? { source } : {}),
          ...(as ? { as } : {}),
          op,
          args,
        })
      ).result;
    const tableClient = <Row, Insert>(
      table: string,
      source: string | undefined,
      as: string | undefined,
    ): TableClient<Row, Insert> => ({
      find: async (options = {}) =>
        (await data<{ items: Row[] }>(table, source, as, "find", options)).items,
      get: (id) => data<Row | null>(table, source, as, "get", { id }),
      insert: async (row) =>
        (await data<Row[]>(table, source, as, "insert", { rows: [row] }))[0] as Row,
      insertMany: (rows) => data<Row[]>(table, source, as, "insert", { rows }),
      update: (id, patch) => data<Row>(table, source, as, "update", { id, patch }),
      delete: async (id) => {
        await data<null>(table, source, as, "delete", { id });
      },
      as: (principalId) => tableClient<Row, Insert>(table, source, principalId),
    });
    const read = async <T>(path: string) =>
      this.#call<T>("GET", `${runPath}${path}?attempt=${job.attempt}`);
    const context: ScriptContext = {
      connection: async <Client>(path: string) => {
        const bound = await read<{ connector: string; config: unknown; credential?: string }>(
          `/connections/${path}`,
        );
        const connector = this.#connectors.get(bound.connector);
        if (!connector) throw new Error(`This worker has no "${bound.connector}" connector.`);
        return connector.create(bound.config, bound.credential, abort.signal) as Client;
      },
      secret: async (name) =>
        (await read<{ value: string }>(`/secrets/${encodeURIComponent(name)}`)).value,
      variable: async (path) => (await read<{ value: string }>(`/variables/${path}`)).value,
      table: <Row, Insert>(table: string | { path: string }) =>
        tableClient<Row, Insert>(
          typeof table === "string" ? table : table.path,
          undefined,
          undefined,
        ),
      source: (source) => ({
        table: (name) =>
          tableClient<Record<string, unknown>, Partial<Record<string, unknown>>>(
            name,
            typeof source === "string" ? source : source.path,
            undefined,
          ),
      }),
      files: {
        put: async (name, content, contentType) => {
          const bytes =
            typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
          const stored = await this.#call<{ id: string }>("POST", `${runPath}/files`, {
            attempt: job.attempt,
            name,
            ...(contentType ? { contentType } : {}),
            base64: bytes.toString("base64"),
          });
          return { id: stored.id };
        },
        get: async (id) => {
          const file = await read<{ name: string; contentType: string; base64: string }>(
            `/files/${id}`,
          );
          return {
            name: file.name,
            contentType: file.contentType,
            content: new Uint8Array(Buffer.from(file.base64, "base64")),
          };
        },
      },
      events: {
        publish: async (event, payload) => {
          await this.#call("POST", `${runPath}/events`, { attempt: job.attempt, event, payload });
        },
      },
      log: {
        debug: write("debug"),
        info: write("info"),
        warn: write("warn"),
        error: write("error"),
      },
      run: {
        id: job.runId,
        attempt: job.attempt,
        idempotencyKey: job.idempotencyKey,
        trigger: job.trigger,
        startedBy: job.startedBy ?? { type: "system", id: null },
      },
      signal: abort.signal,
    };

    try {
      const loaded = await this.#module(job.bundle);
      const script = loaded[job.script.entry] as
        | { execute?: (input: unknown, ctx: ScriptContext) => Promise<unknown> }
        | undefined;
      if (typeof script?.execute !== "function") {
        throw new Error(`The bundle does not export a script named "${job.script.entry}".`);
      }
      // A script that ignores the signal must not hold the attempt open past its limit.
      const aborted = new Promise<never>((_, reject) => {
        abort.signal.addEventListener("abort", () => reject(abort.signal.reason), { once: true });
      });
      const output = await Promise.race([script.execute(job.input, context), aborted]);
      await flush();
      await this.#call("POST", `${runPath}/complete`, { attempt: job.attempt, output });
    } catch (error) {
      await flush();
      if (error instanceof CredentialRefused) throw error;
      // A cancelled or reclaimed attempt has nothing left to report.
      if (over || error instanceof AttemptOver) return;
      const failure = error instanceof Error ? error : new Error(String(error));
      await this.#call("POST", `${runPath}/fail`, {
        attempt: job.attempt,
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
    }
  }
}

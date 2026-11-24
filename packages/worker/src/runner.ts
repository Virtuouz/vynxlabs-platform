/**
 * Runs one attempt of one script, or one task, in a process of its own that the
 * worker can end at any moment. It holds no credential: every call to the
 * control plane is asked of the worker over IPC, and the worker makes it only
 * for this run. A task asks for nothing: what it needs, it is given at start.
 */

import { pathToFileURL } from "node:url";
import { format } from "node:util";
import type { BundleManifest } from "@volvel/manifest";
import type { ScriptContext } from "@volvel/sdk";
import {
  type Bound,
  buildContext,
  connectorFor,
  type Job,
  type Loaded,
  type LogEntry,
  type TaskJob,
} from "./context.js";

/** What the worker sends. */
export type ToRunner =
  | { t: "start"; job: Job; bundleFile: string; manifests: BundleManifest[] }
  | {
      t: "task";
      job: TaskJob;
      bundleFile?: string;
      manifests?: BundleManifest[];
      /** The connection the task is about, read by the worker. */
      bound?: Bound;
    }
  | { t: "reply"; id: number; result?: unknown; error?: string }
  | { t: "abort"; message: string };

/** What the runner sends back. */
export type FromRunner =
  | { t: "call"; id: number; method: "GET" | "POST"; path: string; body?: unknown }
  | { t: "log"; entry: LogEntry }
  | { t: "done"; output: unknown }
  | { t: "failed"; error: { message: string; stack?: string } };

const send = (message: FromRunner) =>
  new Promise<void>((resolve) => {
    if (!process.send) return resolve();
    process.send(message, undefined, {}, () => resolve());
  });

const waiting = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (e: Error) => void }
>();
let next = 0;
const abort = new AbortController();
let finished = false;

async function finish(message: FromRunner) {
  if (finished) return;
  finished = true;
  await send(message);
}

function failure(error: unknown) {
  const caught = error instanceof Error ? error : new Error(String(error));
  return {
    message: caught.message,
    ...(caught.stack ? { stack: caught.stack } : {}),
  };
}

/**
 * `console.log` and its kin write to the run's log, where the control plane masks what the
 * run was given before it is kept or shown. Nothing goes to the process's own output.
 */
function routeConsole(write: (entry: LogEntry) => void) {
  const levels = {
    log: "info",
    info: "info",
    debug: "debug",
    warn: "warn",
    error: "error",
    trace: "debug",
  } as const;
  for (const [method, level] of Object.entries(levels)) {
    (console as unknown as Record<string, unknown>)[method] = (...args: unknown[]) =>
      write({ time: new Date().toISOString(), level, message: format(...args) });
  }
}

async function run(job: Job, bundleFile: string, manifests: BundleManifest[]) {
  try {
    routeConsole((entry) => {
      void send({ t: "log", entry });
    });
    const exports = (await import(pathToFileURL(bundleFile).href)) as Record<string, unknown>;
    const script = exports[job.script.entry] as
      | { execute?: (input: unknown, ctx: ScriptContext) => Promise<unknown> }
      | undefined;
    if (typeof script?.execute !== "function") {
      throw new Error(`The bundle does not export a script named "${job.script.entry}".`);
    }
    const context = buildContext({
      job,
      loaded: { exports, manifests },
      signal: abort.signal,
      write: (entry) => {
        void send({ t: "log", entry });
      },
      call: <T>(method: "GET" | "POST", path: string, body?: unknown) =>
        new Promise<T>((resolve, reject) => {
          next += 1;
          waiting.set(next, { resolve: resolve as (value: unknown) => void, reject });
          void send({ t: "call", id: next, method, path, ...(body === undefined ? {} : { body }) });
        }),
    });
    const output = await script.execute(job.input, context);
    // What crosses back is what the control plane would store: JSON.
    await finish({
      t: "done",
      output: output === undefined ? undefined : JSON.parse(JSON.stringify(output)),
    });
  } catch (error) {
    await finish({ t: "failed", error: failure(error) });
  }
}

/** What `describe` finds in code that declares nothing. */
const NOTHING_DECLARED = {};

async function task(message: Extract<ToRunner, { t: "task" }>) {
  try {
    const { job, bound } = message;
    const loaded: Loaded | undefined = message.bundleFile
      ? {
          exports: (await import(pathToFileURL(message.bundleFile).href)) as Record<
            string,
            unknown
          >,
          manifests: message.manifests ?? [],
        }
      : undefined;
    let result: unknown;
    if (job.kind === "describe") {
      // The bundle's own helper turns the script's `input` and `output` into JSON Schema,
      // with the zod it was built with.
      const describe = loaded?.exports.__vx_describe;
      result =
        typeof describe === "function"
          ? await (describe as (entry: string) => unknown)(String(job.request.entry))
          : NOTHING_DECLARED;
    } else {
      if (!bound) throw new Error("The task names no connection.");
      const connector = connectorFor(loaded, bound.connector);
      if (job.kind === "deliver") {
        if (bound.connector !== "http") {
          throw new Error(
            `A notification goes through an http connection, not a ${bound.connector} one.`,
          );
        }
        const client = connector.create(bound.config, bound.credential, abort.signal) as {
          post(path: string, json: unknown): Promise<{ status: number }>;
        };
        const response = await client.post("", job.request.payload);
        result = { status: response.status };
      } else {
        const started = performance.now();
        const latency = () => Math.round(performance.now() - started);
        try {
          let found: { status?: number; message?: string };
          if (connector.test) {
            found = await connector.test(bound.config, bound.credential, abort.signal);
          } else {
            connector.create(bound.config, bound.credential, abort.signal);
            found = { message: "The connector has no test of its own. Its client was made." };
          }
          result = { ok: true, ...found, latencyMs: latency() };
        } catch (error) {
          const status = (error as { status?: unknown }).status;
          result = {
            ok: false,
            ...(typeof status === "number" ? { status } : {}),
            // A connector's own words are shown. A fault in it is not: it is not a finding about the connection.
            message:
              error instanceof TypeError || error instanceof RangeError
                ? `The ${bound.connector} connector could not read this connection's settings, so it was not tried. Check them and try again.`
                : ((error as Error).message ?? String(error)),
            latencyMs: latency(),
          };
        }
      }
    }
    await finish({
      t: "done",
      output: result === undefined ? null : JSON.parse(JSON.stringify(result)),
    });
  } catch (error) {
    await finish({ t: "failed", error: failure(error) });
  }
}

process.on("message", (message: ToRunner) => {
  if (message.t === "start") {
    void run(message.job, message.bundleFile, message.manifests);
  } else if (message.t === "task") {
    void task(message);
  } else if (message.t === "reply") {
    const pending = waiting.get(message.id);
    if (!pending) return;
    waiting.delete(message.id);
    if (message.error !== undefined) pending.reject(new Error(message.error));
    else pending.resolve(message.result);
  } else if (message.t === "abort") {
    abort.abort(new Error(message.message));
  }
});

// A script's stray failure ends its own attempt, and nothing else.
process.on("uncaughtException", (error) => {
  void finish({ t: "failed", error: failure(error) });
});
process.on("unhandledRejection", (error) => {
  void finish({ t: "failed", error: failure(error) });
});
// Without its worker there is no one to report to.
process.on("disconnect", () => process.exit(1));

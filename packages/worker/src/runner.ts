/**
 * Runs one attempt of one script, in a process of its own that the worker can
 * end at any moment. It holds no credential: every call to the control plane is
 * asked of the worker over IPC, and the worker makes it only for this run.
 */
import { pathToFileURL } from "node:url";
import type { BundleManifest } from "@vynxlabs/manifest";
import type { ScriptContext } from "@vynxlabs/sdk";
import { buildContext, type Job, type LogEntry } from "./context.js";

/** What the worker sends. */
export type ToRunner =
  | { t: "start"; job: Job; bundleFile: string; manifests: BundleManifest[] }
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

async function run(job: Job, bundleFile: string, manifests: BundleManifest[]) {
  try {
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

process.on("message", (message: ToRunner) => {
  if (message.t === "start") {
    void run(message.job, message.bundleFile, message.manifests);
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

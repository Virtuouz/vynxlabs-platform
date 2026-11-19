/**
 * Following a run from a terminal: its log lines as they are written, and for
 * a flow run each step as it goes. The instance's event stream says when to
 * look again; without it, the CLI looks every two seconds.
 */
import type { ApiReply, Io, Settings } from "./cli.js";
import { clock, refusal, request } from "./cli.js";
import { CliError } from "./errors.js";

/** How often to look without the stream, and at the latest with it. */
const POLL_MS = 2000;
const QUIET_MS = 15_000;

export interface StreamEvent {
  event: string;
  data: string;
}

/**
 * Server-sent events, read from text as it arrives: lines until a blank one
 * make an event. Comments and `retry` are skipped; an event may arrive split
 * over any number of chunks.
 */
export class SseParser {
  #buffer = "";
  #event = "message";
  #data: string[] = [];

  push(chunk: string): StreamEvent[] {
    this.#buffer += chunk;
    const events: StreamEvent[] = [];
    for (;;) {
      const end = this.#buffer.search(/\r?\n/);
      if (end < 0) break;
      const line = this.#buffer.slice(0, end);
      this.#buffer = this.#buffer.slice(end + (this.#buffer[end] === "\r" ? 2 : 1));
      if (line === "") {
        if (this.#data.length > 0) events.push({ event: this.#event, data: this.#data.join("\n") });
        this.#event = "message";
        this.#data = [];
        continue;
      }
      if (line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") this.#event = value;
      else if (field === "data") this.#data.push(value);
    }
    return events;
  }
}

/** Something to wait on that an event can cut short. */
class Wake {
  #resolve: (() => void) | undefined;
  #pending = false;
  poke() {
    if (this.#resolve) this.#resolve();
    else this.#pending = true;
  }
  wait(ms: number, signal: AbortSignal): Promise<void> {
    if (this.#pending || signal.aborted) {
      this.#pending = false;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", done);
        this.#resolve = undefined;
        resolve();
      };
      const timer = setTimeout(done, ms);
      signal.addEventListener("abort", done, { once: true });
      this.#resolve = done;
    });
  }
}

/**
 * Reads the tenant's event stream until `signal` aborts, calling `onEvent`
 * for each run event. Resolves false at once when the instance refuses it,
 * and when it drops: the caller looks on its own then.
 */
async function readStream(
  settings: Settings,
  tenantId: string,
  onEvent: (event: { k?: string; id?: string; flow?: string }) => void,
  signal: AbortSignal,
  onOpen: () => void,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(
      `${settings.url.replace(/\/+$/, "")}/api/v1/tenants/${tenantId}/stream`,
      {
        headers: { authorization: `Bearer ${settings.token}`, accept: "text/event-stream" },
        signal,
      },
    );
  } catch {
    return;
  }
  if (response.status !== 200 || !response.body) {
    await response.body?.cancel().catch(() => {});
    return;
  }
  onOpen();
  const parser = new SseParser();
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      for (const event of parser.push(decoder.decode(value, { stream: true }))) {
        if (event.event === "snapshot" || event.event === "ready") {
          onEvent({ k: event.event });
          continue;
        }
        try {
          onEvent(JSON.parse(event.data));
        } catch {
          // Not an event of a run.
        }
      }
    }
  } catch {
    // Aborted, or the connection dropped.
  } finally {
    reader.releaseLock();
  }
}

interface LogLine {
  seq: number;
  time: string;
  level: string;
  message: string;
  fields: Record<string, unknown>;
}

interface StepRow {
  node: string;
  item: string;
  status: string;
  state: string;
  error: { message: string } | null;
  runId: string | null;
  childFlowRunId: string | null;
  startedAt: string;
  finishedAt: string | null;
}

/** How a run ended, as the process says it. */
export const EXIT = { succeeded: 0, failed: 1, cancelled: 3, canceled: 3 } as const;

export interface Followed {
  kind: "script" | "flow";
  status: string;
  output: unknown;
  error: { message: string } | null;
  exitCode: number;
}

const ENDED = new Set(["succeeded", "failed", "cancelled", "canceled"]);
const took = (from: string, to: string | null) => {
  if (!to) return "";
  const ms = Date.parse(to) - Date.parse(from);
  return ms < 1000 ? ` ${ms} ms` : ` ${(ms / 1000).toFixed(1)} s`;
};

/**
 * Prints a run's logs, and with `follow` keeps printing them until it ends.
 * For a flow run: each step as it changes, its script run's logs prefixed
 * with the step's name, and a flow it starts the same way.
 */
export async function followRun(
  settings: Settings,
  where: { base: string; tenantId: string },
  id: string,
  io: Io,
  options: { follow: boolean; signal?: AbortSignal; quiet?: boolean },
): Promise<Followed> {
  const get = (path: string) => request(settings.url, `${where.base}${path}`, settings.token);
  const first = await get(`/runs/${id}`);
  let kind: "script" | "flow";
  if (first.status === 200) kind = "script";
  else if (first.status === 404) {
    const flow = await get(`/flow-runs/${id}`);
    if (flow.status !== 200) {
      if (flow.status === 404)
        throw new CliError(`There is no run or flow run ${id} in that workspace.`);
      throw refusal(flow, "read the flow run");
    }
    kind = "flow";
  } else throw refusal(first, "read the run");

  const stop = new AbortController();
  options.signal?.addEventListener("abort", () => stop.abort(), { once: true });
  const wake = new Wake();
  /** The runs and flow runs being followed: an event about one of them is a reason to look. */
  const watched = new Set<string>([id]);
  let streaming = false;
  const stream = options.follow
    ? readStream(
        settings,
        where.tenantId,
        (event) => {
          if (
            event.k === "snapshot" ||
            event.k === "ready" ||
            (event.id !== undefined && watched.has(event.id)) ||
            (event.flow !== undefined && watched.has(event.flow))
          )
            wake.poke();
        },
        stop.signal,
        () => {
          streaming = true;
        },
      ).finally(() => {
        streaming = false;
      })
    : Promise.resolve();

  const seq = new Map<string, number>();
  /** Prints the lines a run has that were not printed yet. */
  const drain = async (runId: string, prefix: string) => {
    for (;;) {
      const after = seq.get(runId);
      const page: ApiReply = await get(
        `/runs/${runId}/logs?limit=1000${after !== undefined ? `&after=${after}` : ""}`,
      );
      if (page.status !== 200) return;
      const items = (page.body.items ?? []) as LogLine[];
      for (const line of items) {
        const fields =
          Object.keys(line.fields ?? {}).length > 0 ? ` ${JSON.stringify(line.fields)}` : "";
        io.out(`${prefix}${clock(line.time)} ${line.level.padEnd(5)} ${line.message}${fields}`);
        seq.set(runId, line.seq);
      }
      if (items.length < 1000) return;
    }
  };

  try {
    if (kind === "script") {
      for (;;) {
        await drain(id, "");
        const run = (await get(`/runs/${id}`)).body;
        if (ENDED.has(run.status) || !options.follow) {
          await drain(id, "");
          const ended = ENDED.has(run.status);
          if (!options.quiet) {
            io.out(
              run.status === "succeeded"
                ? `Succeeded${took(run.startedAt ?? run.createdAt, run.finishedAt).replace(/^ /, " in ")}.`
                : run.error
                  ? `${capital(run.status)}: ${run.error.message}`
                  : ended
                    ? `${capital(run.status)}.`
                    : `${capital(run.status)}. Add -f to follow it.`,
            );
          }
          return {
            kind,
            status: run.status,
            output: run.output ?? null,
            error: run.error ?? null,
            exitCode: ended ? (EXIT[run.status as keyof typeof EXIT] ?? 1) : 0,
          };
        }
        await wake.wait(streaming ? QUIET_MS : POLL_MS, stop.signal);
        if (stop.signal.aborted) throw new Stopped(id);
      }
    }

    /** What each step was last seen as, by flow run and node: a change is printed once. */
    const seen = new Map<string, string>();
    const prefixes = new Map<string, string>([[id, ""]]);
    for (;;) {
      let root:
        | { status: string; state: string; output: unknown; error: { message: string } | null }
        | undefined;
      for (const [flowRunId, prefix] of [...prefixes]) {
        const reply = await get(`/flow-runs/${flowRunId}`);
        if (reply.status !== 200) continue;
        const flowRun = reply.body as {
          status: string;
          state: string;
          output: unknown;
          error: { message: string } | null;
          steps: StepRow[];
        };
        if (flowRunId === id) root = flowRun;
        // A foreach's items each run the script: their lines come under the step, by item.
        for (const item of flowRun.steps.filter((one) => one.item !== "" && one.runId)) {
          watched.add(item.runId as string);
          await drain(item.runId as string, `[${prefix}${item.node} #${item.item}] `);
        }
        for (const step of flowRun.steps.filter((one) => one.item === "")) {
          const key = `${flowRunId}:${step.node}`;
          const label = `${prefix}${step.node}`;
          if (step.runId && !watched.has(step.runId)) watched.add(step.runId);
          if (step.childFlowRunId && !prefixes.has(step.childFlowRunId)) {
            prefixes.set(step.childFlowRunId, `${label} › `);
            watched.add(step.childFlowRunId);
          }
          if (step.runId) await drain(step.runId, `[${label}] `);
          if (seen.get(key) !== step.state) {
            seen.set(key, step.state);
            io.out(stepLine(label, step));
          }
        }
      }
      if (!root) throw new CliError(`The flow run ${id} could not be read.`);
      if (ENDED.has(root.status) || !options.follow) {
        const ended = ENDED.has(root.status);
        if (!options.quiet) {
          io.out(
            root.status === "succeeded"
              ? "The flow run succeeded."
              : root.error
                ? `The flow run ${root.status}: ${root.error.message}`
                : `The flow run is ${root.state.replace("_", " ")}.${ended ? "" : " Add -f to follow it."}`,
          );
        }
        return {
          kind,
          status: root.status,
          output: root.output ?? null,
          error: root.error,
          exitCode: ended ? (EXIT[root.status as keyof typeof EXIT] ?? 1) : 0,
        };
      }
      await wake.wait(streaming ? QUIET_MS : POLL_MS, stop.signal);
      if (stop.signal.aborted) throw new Stopped(id);
    }
  } finally {
    stop.abort();
    await stream;
  }
}

/** Following was stopped, by Ctrl+C: the run goes on. */
export class Stopped extends CliError {
  constructor(id: string) {
    super(`Stopped following. The run goes on: volvel logs ${id} -f to follow it again.`);
  }
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function stepLine(label: string, step: StepRow): string {
  switch (step.state) {
    case "running":
    case "queued":
      return `▸ ${label} ${step.state}`;
    case "succeeded":
      return `✓ ${label} succeeded${took(step.startedAt, step.finishedAt)}`;
    case "failed":
      return `✗ ${label} failed${step.error ? `: ${step.error.message}` : ""}`;
    case "skipped":
      return `- ${label} skipped`;
    case "waiting_approval":
      return `… ${label} waits for an approval`;
    case "waiting_time":
      return `… ${label} waits`;
    default:
      return `  ${label} ${step.state.replace("_", " ")}`;
  }
}

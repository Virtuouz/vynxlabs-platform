import type { Database, Listener } from "@volvel/db";
import type { FastifyBaseLogger } from "fastify";

/** What a browser is told: something changed, and what. Never the data itself. */
export interface RunEvent {
  /** `run`, `flow_run`, `step`, `log`, or `task`: something a worker does for the platform. */
  k: "run" | "flow_run" | "step" | "log" | "task";
  /** The workspace. */
  w: string;
  /** The run's or the flow run's ID. */
  id: string;
  /** The flow run a script run or log line belongs to, if any. */
  flow?: string | null;
  /** A step's node. */
  node?: string;
  /** The status it moved to. Absent for log lines. */
  s?: string;
  /** The script's or the flow's path. */
  p?: string;
}

/** As Postgres announces it: with the tenant, and who started the run, which are never passed on. */
interface Announced extends RunEvent {
  t: string;
  /** `<principal type>:<id>` of whoever started the run or flow run. */
  by?: string;
}

/** What one subscriber may see, decided when it connected. */
export interface Subscriber {
  tenantId: string;
  /** Per workspace: whether script runs, and flow runs, may be read there. */
  may: Map<string, { scripts: boolean; flows: boolean }>;
  /** Who it is, for the limit on open streams. */
  principal: string;
  /**
   * Whoever it is (`<principal type>:<id>`), when it has an ID. The events of the runs
   * and flow runs they started are sent wherever they are, besides what `may` allows.
   */
  own?: string;
  /**
   * Set for someone who may read only the runs they started, such as an end user of an
   * app. `may` is empty and they are limited to `MAX_OWN_STREAMS`.
   */
  ownOnly?: boolean;
  send(event: string, data: unknown): void;
  /** Ends the stream from this side. */
  close?(): void;
}

/** Every hub in this process, so that ending someone's sign-in can end their open streams. */
const hubs = new Set<StreamHub>();

/** Closes the open streams of `principal` (`member:<id>`), in one tenant or in all. This replica only. */
export function endStreamsOf(principal: string, tenantId?: string) {
  for (const hub of hubs) hub.endFor(principal, tenantId);
}

/** Streams one principal may hold open at once, on one replica. */
export const MAX_STREAMS = 5;
/** The same for someone following only their own runs: an app needs one, and a second tab. */
export const MAX_OWN_STREAMS = 2;
/** Log pings for one run are sent at most this often. */
const LOG_PING_MS = 500;

/**
 * Passes on what Postgres announces about runs to the browsers that may see it.
 * One listening connection per replica, made on the first subscriber. A run
 * changed through any replica reaches subscribers on every replica.
 */
export class StreamHub {
  readonly #database: Database;
  readonly #log: FastifyBaseLogger;
  readonly #subscribers = new Map<string, Set<Subscriber>>();
  readonly #open = new Map<string, number>();
  /** When each run's last log ping went out, and whether one is held back. */
  readonly #pings = new Map<string, { at: number; timer?: NodeJS.Timeout }>();
  #listener: Promise<Listener> | undefined;
  #closed = false;
  /** Claims waiting for work, by tenant: woken by any change to its runs or tasks. */
  readonly #waiting = new Map<string, Set<() => void>>();

  constructor(database: Database, log: FastifyBaseLogger) {
    this.#database = database;
    this.#log = log;
    hubs.add(this);
  }

  /** Closes the streams a principal holds open. */
  endFor(principal: string, tenantId?: string) {
    for (const [tenant, set] of this.#subscribers) {
      if (tenantId !== undefined && tenant !== tenantId) continue;
      for (const subscriber of [...set]) {
        if (subscriber.principal === principal) subscriber.close?.();
      }
    }
  }

  /** The listening connection's server process. For tests. */
  async listenerPid(): Promise<number | undefined> {
    return (await this.#listen()).pid;
  }

  #listen(): Promise<Listener> {
    this.#listener ??= this.#database.listen({
      channels: ["vx_runs", "vx_logs"],
      onMessage: (_channel, payload) => this.#receive(payload),
      onReconnect: () => {
        this.#log.info("the run event stream reconnected; subscribers are told to refresh");
        for (const set of this.#subscribers.values()) {
          for (const subscriber of set) subscriber.send("snapshot", {});
        }
      },
      onError: (error) =>
        this.#log.warn({ err: error }, "the run event stream lost its connection"),
    });
    return this.#listener;
  }

  /**
   * Adds a subscriber, or refuses it with `false` when its principal already has
   * `MAX_STREAMS` open. Returns the function that removes it.
   */
  async subscribe(subscriber: Subscriber): Promise<(() => void) | false> {
    const open = this.#open.get(subscriber.principal) ?? 0;
    if (open >= (subscriber.ownOnly ? MAX_OWN_STREAMS : MAX_STREAMS)) return false;
    await this.#listen();
    this.#open.set(subscriber.principal, open + 1);
    let set = this.#subscribers.get(subscriber.tenantId);
    if (!set) {
      set = new Set();
      this.#subscribers.set(subscriber.tenantId, set);
    }
    set.add(subscriber);
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      set.delete(subscriber);
      if (set.size === 0) this.#subscribers.delete(subscriber.tenantId);
      const left = (this.#open.get(subscriber.principal) ?? 1) - 1;
      if (left <= 0) this.#open.delete(subscriber.principal);
      else this.#open.set(subscriber.principal, left);
    };
  }

  /**
   * Waits until a run or task of the tenant changes, such as one being queued or
   * ending, or until `ms` pass: a worker's claim then looks again at once rather
   * than on its next poll. Without the listening connection, it only waits.
   */
  async waitForWork(tenantId: string, ms: number): Promise<void> {
    try {
      await this.#listen();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return;
    }
    let set = this.#waiting.get(tenantId);
    if (!set) {
      set = new Set();
      this.#waiting.set(tenantId, set);
    }
    const waiting = set;
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        waiting.delete(done);
        if (waiting.size === 0 && this.#waiting.get(tenantId) === waiting) {
          this.#waiting.delete(tenantId);
        }
        resolve();
      };
      const timer = setTimeout(done, ms);
      waiting.add(done);
    });
  }

  #receive(payload: string) {
    let event: Announced;
    try {
      event = JSON.parse(payload);
    } catch {
      return;
    }
    if (event.k === "run" || event.k === "task") {
      const waiting = this.#waiting.get(event.t);
      if (waiting) for (const wake of [...waiting]) wake();
    }
    const set = this.#subscribers.get(event.t);
    if (!set || set.size === 0) return;
    const { t: _tenant, by, ...shown } = event;
    if (event.k === "log") {
      this.#ping(event.id, () => this.#deliver(set, shown, by));
      return;
    }
    this.#deliver(set, shown, by);
  }

  /** Sends a run's log ping now, or once its last one is old enough, but never twice in a row. */
  #ping(runId: string, send: () => void) {
    const last = this.#pings.get(runId);
    const now = Date.now();
    if (!last || now - last.at >= LOG_PING_MS) {
      this.#pings.set(runId, { at: now });
      send();
      return;
    }
    if (last.timer) return;
    last.timer = setTimeout(
      () => {
        this.#pings.set(runId, { at: Date.now() });
        send();
      },
      LOG_PING_MS - (now - last.at),
    );
    last.timer.unref?.();
    // Old entries are dropped now and then, so the map holds only runs still logging.
    if (this.#pings.size > 10_000) {
      for (const [id, entry] of this.#pings) {
        if (!entry.timer && now - entry.at > LOG_PING_MS) this.#pings.delete(id);
      }
    }
  }

  #deliver(set: Set<Subscriber>, event: RunEvent, by: string | undefined) {
    // A script run that is a step of a flow is the flow's to show.
    const flows = event.k === "flow_run" || event.k === "step" || Boolean(event.flow);
    for (const subscriber of set) {
      const may = subscriber.may.get(event.w);
      if (may && (flows ? may.flows : may.scripts)) {
        subscriber.send(event.k, event);
        continue;
      }
      // Their own run, its log, their own flow run and its steps, where they may not read
      // runs. Never the work of others.
      if (subscriber.own !== undefined && by === subscriber.own && event.k !== "task") {
        subscriber.send(event.k, event);
      }
    }
  }

  async close() {
    this.#closed = true;
    hubs.delete(this);
    for (const entry of this.#pings.values()) if (entry.timer) clearTimeout(entry.timer);
    const listener = this.#listener;
    this.#listener = undefined;
    if (listener) await (await listener.catch(() => undefined))?.close();
  }

  get closed() {
    return this.#closed;
  }
}

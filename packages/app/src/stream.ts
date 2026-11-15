import { appContext } from "./client.ts";

/** What the stream says changed: a run, a flow run, one of its steps, or a run's log. */
export interface RunChange {
  k: "run" | "flow_run" | "step" | "log";
  id: string;
  /** The status it moved to. */
  s?: string;
  node?: string;
}

type Listener = (change: RunChange | "refresh") => void;

/**
 * One stream per page, shared by everything that follows a run, opened on the
 * first listener and closed shortly after the last one leaves. Someone who may
 * read only their own runs, as most people using an app, is sent only those.
 */
class Stream {
  #source: EventSource | undefined;
  readonly #listeners = new Map<string, Set<Listener>>();
  #connected = false;
  /** Set when the stream cannot be had at all: callers poll instead. */
  #failed = false;
  #closing: ReturnType<typeof setTimeout> | undefined;

  /** Whether changes are arriving now. When not, callers poll. */
  get connected(): boolean {
    return this.#connected;
  }

  /** Calls `listener` when the run or flow run `id` changes, or when anything may have been missed. */
  listen(id: string, listener: Listener): () => void {
    let set = this.#listeners.get(id);
    if (!set) {
      set = new Set();
      this.#listeners.set(id, set);
    }
    set.add(listener);
    this.#open();
    return () => {
      set.delete(listener);
      if (set.size === 0) this.#listeners.delete(id);
      if (this.#listeners.size === 0) this.#closeSoon();
    };
  }

  #open() {
    if (this.#closing) {
      clearTimeout(this.#closing);
      this.#closing = undefined;
    }
    if (this.#source || this.#failed) return;
    const EventSourceImpl = globalThis.EventSource;
    if (!EventSourceImpl) {
      this.#failed = true;
      return;
    }
    const { api, tenant } = appContext();
    const source = new EventSourceImpl(`${api}/tenants/${tenant.id}/stream`);
    this.#source = source;
    const ready = () => {
      this.#connected = true;
      this.#all("refresh");
    };
    source.addEventListener("ready", ready);
    // Events may have been missed: everything followed is read again.
    source.addEventListener("snapshot", ready);
    for (const kind of ["run", "flow_run", "step", "log"] as const) {
      source.addEventListener(kind, (event) => {
        let change: RunChange;
        try {
          change = JSON.parse((event as MessageEvent).data);
        } catch {
          return;
        }
        for (const listener of this.#listeners.get(change.id) ?? []) listener(change);
      });
    }
    source.addEventListener("error", () => {
      this.#connected = false;
      // A refused stream is not tried again; one that dropped is, by the browser.
      if (source.readyState === EventSourceImpl.CLOSED) {
        this.#failed = true;
        this.#source = undefined;
      }
      this.#all("refresh");
    });
  }

  #all(change: "refresh") {
    for (const set of this.#listeners.values()) for (const listener of set) listener(change);
  }

  #closeSoon() {
    if (this.#closing) return;
    // Kept a moment, for the next run a page starts right after one ends.
    this.#closing = setTimeout(() => {
      this.#closing = undefined;
      if (this.#listeners.size > 0) return;
      this.#source?.close();
      this.#source = undefined;
      this.#connected = false;
    }, 5000);
  }

  /** Forgets everything, so the next listener opens a new stream. For tests. */
  reset() {
    if (this.#closing) clearTimeout(this.#closing);
    this.#closing = undefined;
    this.#source?.close();
    this.#source = undefined;
    this.#listeners.clear();
    this.#connected = false;
    this.#failed = false;
  }
}

export const runStream = new Stream();

/**
 * Waits until the run or flow run `id` changes, or `ms` pass, whichever is
 * first. With the stream open, a change ends the wait as it happens; without
 * it, this is a pause between two looks.
 */
export function changeOf(id: string, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const stop = runStream.listen(id, (change) => {
      if (change === "refresh" || change.k !== "log") finish();
    });
    const timer = setTimeout(finish, ms);
    function finish() {
      clearTimeout(timer);
      stop();
      resolve();
    }
  });
}

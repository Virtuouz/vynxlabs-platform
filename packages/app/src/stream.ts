import { appAuthorization, appContext, sandboxed } from "./client.ts";

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
/** The part of an EventSource the stream uses: the browser's, or `TokenSource` in a sandboxed page. */
interface Source {
  readonly readyState: number;
  addEventListener(type: string, listener: (event: { data?: string | undefined }) => void): void;
  close(): void;
}

const CLOSED = 2;

/**
 * Server-sent events read with `fetch`, for a page of an app written as code: it is sandboxed and
 * has no cookie, and an EventSource cannot send its token. It reconnects as a browser's would,
 * saying the last event it had, and gives up when the API refuses it.
 */
class TokenSource implements Source {
  readyState = 0;
  readonly #url: string;
  readonly #listeners = new Map<string, Set<(event: { data?: string | undefined }) => void>>();
  #abort: AbortController | undefined;
  #lastId: string | undefined;
  #retry = 3000;

  constructor(url: string) {
    this.#url = url;
    void this.#connect();
  }

  addEventListener(type: string, listener: (event: { data?: string | undefined }) => void) {
    let set = this.#listeners.get(type);
    if (!set) {
      set = new Set();
      this.#listeners.set(type, set);
    }
    set.add(listener);
  }

  close() {
    this.readyState = CLOSED;
    this.#abort?.abort();
  }

  #emit(type: string, data?: string) {
    for (const listener of this.#listeners.get(type) ?? []) listener({ data });
  }

  async #connect(force = false): Promise<void> {
    if (this.readyState === CLOSED) return;
    this.#abort = new AbortController();
    try {
      const authorization = await appAuthorization(force);
      const response = await fetch(this.#url, {
        credentials: "omit",
        signal: this.#abort.signal,
        headers: {
          accept: "text/event-stream",
          ...(authorization ? { authorization } : {}),
          ...(this.#lastId ? { "last-event-id": this.#lastId } : {}),
        },
      });
      if (response.status === 401 && !force) return this.#connect(true);
      if (!response.ok || !response.body) {
        this.readyState = CLOSED;
        this.#emit("error");
        return;
      }
      this.readyState = 1;
      await this.#read(response.body);
    } catch {
      if (this.readyState === CLOSED) return;
    }
    if (this.readyState === CLOSED) return;
    this.readyState = 0;
    this.#emit("error");
    setTimeout(() => void this.#connect(), this.#retry);
  }

  async #read(body: ReadableStream<Uint8Array>) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, "\n");
      let end = buffer.indexOf("\n\n");
      while (end >= 0) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        let type = "message";
        const data: string[] = [];
        for (const line of block.split("\n")) {
          if (line.startsWith(":")) continue;
          const at = line.indexOf(":");
          const field = at < 0 ? line : line.slice(0, at);
          const text = at < 0 ? "" : line.slice(at + 1).replace(/^ /, "");
          if (field === "event") type = text;
          else if (field === "data") data.push(text);
          else if (field === "id") this.#lastId = text;
          else if (field === "retry" && /^\d+$/.test(text)) this.#retry = Number(text);
        }
        if (data.length > 0 || type !== "message") this.#emit(type, data.join("\n"));
        end = buffer.indexOf("\n\n");
      }
    }
  }
}

class Stream {
  #source: Source | undefined;
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
    const { api, tenant } = appContext();
    const url = `${api}/tenants/${tenant.id}/stream`;
    let source: Source;
    if (sandboxed()) {
      if (!globalThis.fetch || !globalThis.TextDecoder) {
        this.#failed = true;
        return;
      }
      source = new TokenSource(url);
    } else {
      const EventSourceImpl = globalThis.EventSource;
      if (!EventSourceImpl) {
        this.#failed = true;
        return;
      }
      source = new EventSourceImpl(url) as unknown as Source;
    }
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
          change = JSON.parse(String(event.data));
        } catch {
          return;
        }
        for (const listener of this.#listeners.get(change.id) ?? []) listener(change);
      });
    }
    source.addEventListener("error", () => {
      this.#connected = false;
      // A refused stream is not tried again; one that dropped is, by the browser.
      if (source.readyState === CLOSED) {
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

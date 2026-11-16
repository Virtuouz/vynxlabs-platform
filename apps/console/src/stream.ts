import { useEffect, useRef, useSyncExternalStore } from "react";
import { invalidatePrefix } from "./api.ts";
import { retryAfter } from "./kit/retry.ts";

/** What the server says changed. Never the data: what is shown is read again. */
export interface StreamEvent {
  k: "run" | "flow_run" | "step" | "log" | "task";
  /** The workspace. */
  w: string;
  /** The run's or the flow run's ID. */
  id: string;
  /** The flow run a script run or log line belongs to. */
  flow?: string | null;
  node?: string;
  s?: string;
  p?: string;
}

/** Reads for a workspace are asked again at most this often, however many events arrive. */
const REFRESH_MS = 1000;

/**
 * Whether what is on screen is current. `reconnecting` shows only once the
 * stream has been down a few seconds, so a brief drop never flickers; `offline`
 * once it has been down for long, or the browser says it has no network.
 */
export type StreamStatus = "idle" | "connecting" | "live" | "reconnecting" | "offline";
export interface StreamState {
  status: StreamStatus;
  /** Whether the stream is up this moment. Screens poll as soon as it is not. */
  connected: boolean;
  /** When events last arrived, or the stream was last known to be up. */
  lastLiveAt: number | null;
}
/** How long the stream may be down before the page says it is reconnecting. */
export const RECONNECTING_AFTER_MS = 3000;
/** How long before the page says it is offline. */
export const OFFLINE_AFTER_MS = 30_000;

let state: StreamState = { status: "idle", connected: false, lastLiveAt: null };
let connected = false;
const watchers = new Set<() => void>();

function setState(next: Partial<StreamState>) {
  const merged = { ...state, ...next };
  if (
    merged.status === state.status &&
    merged.connected === state.connected &&
    merged.lastLiveAt === state.lastLiveAt
  )
    return;
  state = merged;
  for (const watcher of watchers) watcher();
}
const listeners = new Set<(event: StreamEvent) => void>();
let open: { tenantId: string; source: EventSource; users: number; close: () => void } | undefined;

function setConnected(next: boolean) {
  connected = next;
  if (next) setState({ status: "live", connected: true, lastLiveAt: Date.now() });
  else setState({ connected: false });
}

/**
 * Keeps one stream of run events open for the tenant on screen, shared by every
 * screen of the tab. A change marks the reads of its workspace, and the tenant's
 * counts, as out of date, so what is on screen is asked for again.
 */
export function useTenantStream(tenantId: string | undefined) {
  useEffect(() => {
    if (!tenantId || typeof EventSource === "undefined") return;
    return connect(tenantId);
  }, [tenantId]);
}

function connect(tenantId: string): () => void {
  if (open?.tenantId === tenantId) {
    open.users += 1;
  } else {
    open?.close();
    open = start(tenantId);
  }
  const mine = open;
  return () => {
    mine.users -= 1;
    if (mine.users === 0) {
      mine.close();
      if (open === mine) open = undefined;
    }
  };
}

function start(tenantId: string) {
  const tenant = `/tenants/${tenantId}`;
  let source: EventSource;
  let closed = false;
  let failures = 0;
  let downSince: number | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let watchTimer: ReturnType<typeof setInterval> | undefined;
  setState({ status: state.lastLiveAt ? state.status : "connecting" });

  /** Moves the shown status on while the stream is down: reconnecting, then offline. */
  const judge = () => {
    if (closed || downSince === undefined) return;
    const down = Date.now() - downSince;
    const noNetwork = typeof navigator === "object" && navigator.onLine === false;
    if (noNetwork || down >= OFFLINE_AFTER_MS) setState({ status: "offline" });
    else if (down >= RECONNECTING_AFTER_MS) setState({ status: "reconnecting" });
  };
  const wentDown = () => {
    if (connected) {
      connected = false;
      // The moment it dropped is the last time what is shown was known to be current.
      setState({ connected: false, lastLiveAt: Date.now() });
    }
    if (downSince === undefined) downSince = Date.now();
    if (!watchTimer) watchTimer = setInterval(judge, 1000);
    judge();
  };
  const cameBack = () => {
    failures = 0;
    downSince = undefined;
    if (watchTimer) clearInterval(watchTimer);
    watchTimer = undefined;
    setConnected(true);
  };
  // The first change in a quiet moment is shown at once; those just after it, together.
  const due = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    for (const workspace of due) invalidatePrefix(`${tenant}/workspaces/${workspace}`);
    if (due.size > 0) {
      invalidatePrefix(`${tenant}/summary`);
      invalidatePrefix(`${tenant}/approvals`);
      // What waits and what runs, on the Workers screen.
      invalidatePrefix(`${tenant}/queue`);
      invalidatePrefix(`${tenant}/workers`);
    }
    due.clear();
  };
  const refresh = (workspace: string) => {
    due.add(workspace);
    if (timer) return;
    flush();
    timer = setTimeout(() => {
      timer = undefined;
      flush();
    }, REFRESH_MS);
  };
  const changed = (message: MessageEvent<string>) => {
    let event: StreamEvent;
    try {
      event = JSON.parse(message.data);
    } catch {
      return;
    }
    for (const listener of listeners) listener(event);
    // A log line changes no list; only the views of that run listen for it.
    if (event.k !== "log") refresh(event.w);
  };
  const open = () => {
    source = new EventSource(`/api/v1/tenants/${tenantId}/stream`, { withCredentials: true });
    source.addEventListener("ready", cameBack);
    source.addEventListener("snapshot", () => {
      cameBack();
      invalidatePrefix(tenant);
    });
    for (const kind of ["run", "flow_run", "step", "log", "task"]) {
      source.addEventListener(kind, ((message: MessageEvent<string>) => {
        if (connected) setState({ lastLiveAt: Date.now() });
        changed(message);
      }) as EventListener);
    }
    source.onopen = cameBack;
    source.onerror = () => {
      if (source.readyState === EventSource.OPEN) return;
      wentDown();
      // The browser tries again by itself while it can. Once it gives up, the page does,
      // waiting longer each time. Until the stream is back, screens poll as they always did.
      if (source.readyState === EventSource.CLOSED && !reconnectTimer && !closed) {
        failures += 1;
        reconnectTimer = setTimeout(() => {
          reconnectTimer = undefined;
          if (!closed) open();
        }, retryAfter(failures));
      }
    };
  };
  open();
  const offline = () => {
    if (!connected && downSince === undefined) downSince = Date.now();
    judge();
  };
  if (typeof addEventListener === "function") addEventListener("offline", offline);
  const entry = {
    tenantId,
    get source() {
      return source;
    },
    users: 1,
    close: () => {
      closed = true;
      if (timer) clearTimeout(timer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (watchTimer) clearInterval(watchTimer);
      if (typeof removeEventListener === "function") removeEventListener("offline", offline);
      source.close();
      connected = false;
      setState({ status: "idle", connected: false });
    },
  };
  return entry;
}

const subscribe = (watcher: () => void) => {
  watchers.add(watcher);
  return () => {
    watchers.delete(watcher);
  };
};

/** Whether what is shown is current, and when it last was. */
export function useStreamStatus(): StreamState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

/** Whether run events are arriving. While they are not, screens poll instead. */
export function useStreamConnected(): boolean {
  return useStreamStatus().connected;
}

/** Calls `onEvent` for each event that `matches` accepts, while the component is shown. */
export function useStreamEvents(
  matches: (event: StreamEvent) => boolean,
  onEvent: (event: StreamEvent) => void,
) {
  const latest = useRef({ matches, onEvent });
  latest.current = { matches, onEvent };
  useEffect(() => {
    const listener = (event: StreamEvent) => {
      if (latest.current.matches(event)) latest.current.onEvent(event);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
}

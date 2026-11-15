import { useEffect, useRef, useSyncExternalStore } from "react";
import { invalidatePrefix } from "./api.ts";

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

let connected = false;
const watchers = new Set<() => void>();
const listeners = new Set<(event: StreamEvent) => void>();
let open: { tenantId: string; source: EventSource; users: number; close: () => void } | undefined;

function setConnected(next: boolean) {
  if (connected === next) return;
  connected = next;
  for (const watcher of watchers) watcher();
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
  const source = new EventSource(`/api/v1/tenants/${tenantId}/stream`, { withCredentials: true });
  const tenant = `/tenants/${tenantId}`;
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
  source.addEventListener("ready", () => setConnected(true));
  source.addEventListener("snapshot", () => {
    setConnected(true);
    invalidatePrefix(tenant);
  });
  for (const kind of ["run", "flow_run", "step", "log", "task"]) {
    source.addEventListener(kind, changed as EventListener);
  }
  source.onopen = () => setConnected(true);
  // The browser tries again by itself. Until it is back, screens poll as they always did.
  source.onerror = () => setConnected(source.readyState === EventSource.OPEN);
  const entry = {
    tenantId,
    source,
    users: 1,
    close: () => {
      if (timer) clearTimeout(timer);
      source.close();
      setConnected(false);
    },
  };
  return entry;
}

/** Whether run events are arriving. While they are not, screens poll instead. */
export function useStreamConnected(): boolean {
  return useSyncExternalStore(
    (watcher) => {
      watchers.add(watcher);
      return () => watchers.delete(watcher);
    },
    () => connected,
    () => false,
  );
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

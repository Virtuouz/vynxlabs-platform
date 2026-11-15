import { useCallback, useEffect, useRef, useState } from "react";
import {
  appContext,
  type FlowRun,
  flowRun,
  type Principal,
  type Run,
  type Session,
  scriptRun,
  session,
} from "./client.ts";
import { runStream } from "./stream.ts";

export interface Query<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  /** Asks again. What was loaded stays on screen until the new answer arrives. */
  reload(): void;
}

/**
 * Loads something and keeps it. `load` runs again when a value in `deps`
 * changes, and when `reload` is called. An answer that arrives after a newer
 * question was asked is dropped.
 */
export function useQuery<T>(load: () => Promise<T>, deps: readonly unknown[] = []): Query<T> {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({
    loading: true,
  });
  const [turn, setTurn] = useState(0);
  const latest = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the caller names what `load` depends on, and `turn` is what `reload` changes
  useEffect(() => {
    const mine = ++latest.current;
    setState((before) => ({ ...before, loading: true }));
    load().then(
      (data) => {
        if (mine === latest.current) setState({ data, loading: false });
      },
      (error: unknown) => {
        if (mine === latest.current) {
          setState((before) => ({
            ...before,
            error: error instanceof Error ? error : new Error(String(error)),
            loading: false,
          }));
        }
      },
    );
  }, [...deps, turn]);
  const reload = useCallback(() => setTurn((n) => n + 1), []);
  return { data: state.data, error: state.error, loading: state.loading, reload };
}

/**
 * Who is using the app. It starts from who the page was served to, so the
 * first draw is already right, and `refresh` asks the server again. For an end
 * user, `groups` and `attributes` say which teams they are in and what the
 * tables' rules know of them; both are empty for anyone else.
 */
export function useSession(): {
  principal: Principal;
  signedIn: boolean;
  groups: string[];
  attributes: Record<string, string>;
  refresh(): Promise<Session>;
} {
  const [principal, setPrincipal] = useState<Principal>(() => appContext().principal);
  const refresh = useCallback(async () => {
    const current = await session();
    setPrincipal(current.principal);
    return current;
  }, []);
  return {
    principal,
    signedIn: principal.type !== "anonymous",
    groups: principal.groups ?? [],
    attributes: principal.attributes ?? {},
    refresh,
  };
}

const ENDED = new Set(["succeeded", "failed", "cancelled"]);
/** Between looks, while there is no stream and the run has not ended. */
const POLL_MS = 2000;

export interface Followed<T> {
  /** As last read. `undefined` until the first answer. */
  data: T | undefined;
  error: Error | undefined;
  /** Whether it has ended: nothing more will change. */
  ended: boolean;
  /** Whether changes arrive as they happen; when not, it is looked at every two seconds. */
  live: boolean;
}

function useFollowed<T extends { status: string }>(
  id: string | undefined,
  read: (id: string) => Promise<T>,
): Followed<T> {
  const [state, setState] = useState<{ data?: T; error?: Error; live: boolean }>({ live: false });
  // biome-ignore lint/correctness/useExhaustiveDependencies: `read` is one of the module's own functions
  useEffect(() => {
    setState({ live: false });
    if (!id) return;
    let stopped = false;
    let ended = false;
    let asked = 0;
    let poll: ReturnType<typeof setTimeout> | undefined;
    const look = () => {
      const mine = ++asked;
      read(id).then(
        (data) => {
          if (stopped || mine !== asked) return;
          ended = ENDED.has(data.status);
          setState({ data, live: runStream.connected });
          schedule();
        },
        (error: unknown) => {
          if (stopped || mine !== asked) return;
          setState((before) => ({
            ...before,
            error: error instanceof Error ? error : new Error(String(error)),
          }));
          schedule();
        },
      );
    };
    // Without a stream, it is looked at again until it ends.
    const schedule = () => {
      if (poll) clearTimeout(poll);
      poll = undefined;
      if (!ended && !runStream.connected) poll = setTimeout(look, POLL_MS);
    };
    const stop = runStream.listen(id, (change) => {
      if (change !== "refresh" && change.k === "log") return;
      if (change === "refresh") setState((before) => ({ ...before, live: runStream.connected }));
      look();
    });
    look();
    return () => {
      stopped = true;
      if (poll) clearTimeout(poll);
      stop();
    };
  }, [id]);
  return {
    data: state.data,
    error: state.error,
    ended: state.data !== undefined && ENDED.has(state.data.status),
    live: state.live,
  };
}

/**
 * A run this person started, kept up to date: it is read again each time the
 * platform says it changed, and every two seconds where there is no stream,
 * until it ends.
 */
export function useRun<Output = unknown>(id: string | undefined): Followed<Run<Output>> {
  return useFollowed(id, (one) => scriptRun<Output>(one));
}

/** The same for a flow run: read again as it and its steps change. */
export function useFlowRun<Output = unknown>(id: string | undefined): Followed<FlowRun<Output>> {
  return useFollowed(id, (one) => flowRun<Output>(one));
}

import { useCallback, useEffect, useRef, useState } from "react";
import { appContext, type Principal, type Session, session } from "./client.ts";

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
 * first draw is already right, and `refresh` asks the server again.
 */
export function useSession(): {
  principal: Principal;
  signedIn: boolean;
  refresh(): Promise<Session>;
} {
  const [principal, setPrincipal] = useState<Principal>(() => appContext().principal);
  const refresh = useCallback(async () => {
    const current = await session();
    setPrincipal(current.principal);
    return current;
  }, []);
  return { principal, signedIn: principal.type !== "anonymous", refresh };
}

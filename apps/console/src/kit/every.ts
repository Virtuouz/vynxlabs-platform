import { useEffect, useRef } from "react";

/**
 * Does `run` every `ms`, and never in a tab that is hidden: a tick that falls while it is hidden
 * is kept, and `run` is done once when the tab is shown again. With no `ms` it does nothing.
 * `run` may change on every render; the latest one is called.
 */
export function useEvery(run: () => void, ms: number | undefined): void {
  const latest = useRef(run);
  latest.current = run;
  useEffect(() => {
    if (!ms) return;
    let due = false;
    const hidden = () => document.visibilityState === "hidden";
    const timer = setInterval(() => {
      if (hidden()) due = true;
      else latest.current();
    }, ms);
    const shown = () => {
      if (due && !hidden()) {
        due = false;
        latest.current();
      }
    };
    document.addEventListener("visibilitychange", shown);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", shown);
    };
  }, [ms]);
}

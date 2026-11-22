import { useEffect, useSyncExternalStore } from "react";

/**
 * A screen that is a page until it is edited, then a workbench (a dashboard in its editor):
 * the screen says so while it is on, and the shell draws it edge to edge, as it does for an
 * app's builder. A path alone can't say, since a dashboard's address is the same either way.
 */
let on = 0;
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};

/** Whether a screen has asked for the workbench frame. */
export function useBleeding(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => on > 0,
    () => false,
  );
}

/** Asks the shell for the workbench frame while `bleed` is true and this screen is shown. */
export function useBleedWhile(bleed: boolean) {
  useEffect(() => {
    if (!bleed) return;
    on += 1;
    notify();
    return () => {
      on -= 1;
      notify();
    };
  }, [bleed]);
}

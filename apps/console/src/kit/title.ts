import { useEffect, useSyncExternalStore } from "react";

/**
 * What the page shows, for its title: a run, a dashboard. The shell puts it
 * first in the browser tab's title, before the section, the workspace and the
 * product. Only one screen names its object at a time; the latest one wins.
 */
let object: string | undefined;
const listeners = new Set<() => void>();

function set(next: string | undefined) {
  if (object === next) return;
  object = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Names what this screen shows, while it is shown. Nothing names nothing. */
export function useTitleObject(name: string | undefined) {
  useEffect(() => {
    set(name);
    return () => {
      if (object === name) set(undefined);
    };
  }, [name]);
}

/** The object named by the screen on show, for the shell. */
export function useNamedObject(): string | undefined {
  return useSyncExternalStore(subscribe, () => object);
}

/** A page's title: its parts joined, leaving out those that are missing. */
export function pageTitle(parts: (string | undefined | null | false)[]): string {
  return parts.filter(Boolean).join(" · ");
}

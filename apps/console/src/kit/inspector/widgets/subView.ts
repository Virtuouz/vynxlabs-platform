import { useSyncExternalStore } from "react";

/**
 * Which row action or button of a widget is open in the drawer, as a sub-view with "‹ Back"
 * (as the Action group's button is). It is held here, by widget, because the Actions tab is drawn
 * by several pieces at once and every one of them gives way to the sub-view.
 */
export interface OpenAction {
  /** The setting that holds the list: `rowActions` or `buttons`. */
  name: string;
  id: string;
}

const open = new Map<string, OpenAction>();
const listeners = new Set<() => void>();

export function openAction(widgetId: string, which: OpenAction | undefined) {
  if (which) open.set(widgetId, which);
  else open.delete(widgetId);
  for (const listener of listeners) listener();
}

export const openActionOf = (widgetId: string): OpenAction | undefined => open.get(widgetId);

export function useOpenAction(widgetId: string): OpenAction | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => open.get(widgetId),
  );
}

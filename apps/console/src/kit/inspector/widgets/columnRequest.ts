/**
 * A column asked for from the canvas: while building, a click on a table's heading says which
 * column of which widget. The page editor makes the request, and the table's Display tab takes
 * it, opening that column's editor beside the heading and highlighting its row. A tiny store,
 * so the page editor and the drawer need not share a parent.
 */
import { useSyncExternalStore } from "react";

export interface ColumnRequest {
  widget: string;
  column: string;
  /** Raised again by each click, so a second click on the same heading opens it again. */
  serial: number;
  /** The editor is drawn beside the heading on the canvas. */
  fromCanvas: boolean;
}

let current: ColumnRequest | undefined;
let serial = 0;
const listeners = new Set<() => void>();
const emit = () => {
  for (const listen of listeners) listen();
};

/** A heading was clicked on the canvas. */
export function requestColumn(widget: string, column: string, fromCanvas = true): void {
  serial += 1;
  current = { widget, column, serial, fromCanvas };
  emit();
}

/** The request is dealt with (the editor closed). */
export function clearColumnRequest(): void {
  if (!current) return;
  current = undefined;
  emit();
}

const subscribe = (listen: () => void) => {
  listeners.add(listen);
  return () => {
    listeners.delete(listen);
  };
};

/** The column asked for on this widget, if any. */
export function useColumnRequest(widget: string): ColumnRequest | undefined {
  const now = useSyncExternalStore(
    subscribe,
    () => current,
    () => undefined,
  );
  return now && now.widget === widget ? now : undefined;
}

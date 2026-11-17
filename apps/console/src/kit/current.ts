import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * What the page on screen shows, and what can be done with it, for the
 * palette's empty query (phase 15, P3-2): with a run open, "Run again" is the
 * first thing ⌘K offers. A page registers its object with `useCurrentObject`;
 * the palette reads it with `useCurrent`.
 */

export interface ObjectCommand {
  key: string;
  label: string;
  icon?: LucideIcon | undefined;
  /** Ends or removes something: drawn as such, and asks before it is done. */
  danger?: boolean | undefined;
  /** Does it. The palette closes first. A command that changes something asks first itself. */
  run: () => void | Promise<void>;
}

/** Something the palette can keep pinned: what search would find it as. */
export interface Pinnable {
  kind: string;
  ref: string;
  /** A run's ID, or the resource's. */
  id: string;
  workspaceId: string | null;
  workspaceSlug?: string | null;
  title: string;
}

export interface CurrentObject {
  /** What it is, for the section's heading: "This run", "This script". */
  heading: string;
  commands: ObjectCommand[];
  /** Offered as Pin or Unpin, when it is something search finds. */
  pin?: Pinnable | undefined;
}

let current: CurrentObject | undefined;
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};

/**
 * Tells the palette what this page shows. The commands may change as the
 * object does (a run that ends can no longer be canceled); pass `undefined`
 * while it loads.
 */
export function useCurrentObject(object: CurrentObject | undefined) {
  const mine = useRef<CurrentObject | undefined>(undefined);
  useEffect(() => {
    mine.current = object;
    current = object;
    notify();
  });
  useEffect(
    () => () => {
      if (current === mine.current) {
        current = undefined;
        notify();
      }
    },
    [],
  );
}

/** What the page on screen shows, if it said. */
export function useCurrent(): CurrentObject | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => undefined,
  );
}

/** Registers the object from inside a page's JSX, where its actions are already defined. */
export function Current({ object }: { object: CurrentObject }) {
  useCurrentObject(object);
  return null;
}

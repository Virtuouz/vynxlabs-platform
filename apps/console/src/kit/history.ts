import { useCallback, useRef, useState } from "react";

/** How many changes can be undone. */
export const HISTORY_LIMIT = 100;
/** Changes with the same key this close together are one step: typing in one field. */
export const COALESCE_MS = 1000;

interface Entry<T> {
  snapshot: T;
  key: string | undefined;
  at: number;
  /** What undoing it takes back, for a button's title. */
  label: string;
}

/**
 * What can be undone and redone, as snapshots taken before each change. Kept
 * apart from React so it can be tested by itself.
 */
export class History<T> {
  #past: Entry<T>[] = [];
  #future: Entry<T>[] = [];
  readonly #same: (a: T, b: T) => boolean;

  constructor(same: (a: T, b: T) => boolean = (a, b) => JSON.stringify(a) === JSON.stringify(b)) {
    this.#same = same;
  }

  /**
   * Remembers `before`, the state just before a change. A change with the same
   * key as the last, within a second of it, is part of the same step. A change
   * clears what could be redone.
   */
  record(before: T, label: string, key?: string, now = Date.now()) {
    const last = this.#past.at(-1);
    if (key !== undefined && last?.key === key && now - last.at < COALESCE_MS) {
      last.at = now;
      this.#future = [];
      return;
    }
    if (last && this.#same(last.snapshot, before) && this.#future.length === 0) {
      last.at = now;
      last.key = key;
      last.label = label;
      return;
    }
    this.#past.push({ snapshot: before, key, at: now, label });
    if (this.#past.length > HISTORY_LIMIT) this.#past.shift();
    this.#future = [];
  }

  /** The state to go back to, given the one there is now, or nothing. */
  undo(current: T): T | undefined {
    const entry = this.#past.pop();
    if (!entry) return undefined;
    this.#future.push({ ...entry, snapshot: current });
    return entry.snapshot;
  }

  /** The state to go forward to again, or nothing. */
  redo(current: T): T | undefined {
    const entry = this.#future.pop();
    if (!entry) return undefined;
    this.#past.push({ ...entry, snapshot: current, key: undefined, at: 0 });
    return entry.snapshot;
  }

  clear() {
    this.#past = [];
    this.#future = [];
  }

  get undoLabel(): string | undefined {
    return this.#past.at(-1)?.label;
  }
  get redoLabel(): string | undefined {
    return this.#future.at(-1)?.label;
  }
}

/**
 * A `History` for a screen: `record` before each change, then `undo` and
 * `redo` hand back the state to restore. `version` changes whenever what can
 * be undone does, for buttons to follow.
 */
export function useHistory<T>(capture: () => T, restore: (state: T) => void) {
  const history = useRef(new History<T>()).current;
  const [, setVersion] = useState(0);
  const latest = useRef({ capture, restore });
  latest.current = { capture, restore };
  const record = useCallback(
    (label: string, key?: string) => {
      history.record(latest.current.capture(), label, key);
      setVersion((n) => n + 1);
    },
    [history],
  );
  const undo = useCallback(() => {
    const back = history.undo(latest.current.capture());
    if (back !== undefined) latest.current.restore(back);
    setVersion((n) => n + 1);
  }, [history]);
  const redo = useCallback(() => {
    const forward = history.redo(latest.current.capture());
    if (forward !== undefined) latest.current.restore(forward);
    setVersion((n) => n + 1);
  }, [history]);
  const clear = useCallback(() => {
    history.clear();
    setVersion((n) => n + 1);
  }, [history]);
  return {
    record,
    undo,
    redo,
    clear,
    undoLabel: history.undoLabel,
    redoLabel: history.redoLabel,
  };
}

/** Whether a key press is meant for a field rather than the screen: a field keeps its own undo. */
export function typingIn(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

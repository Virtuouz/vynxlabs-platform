import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Rows that arrive while a list is open (07 §7.10). They fade in where they
 * land, without moving what the reader is looking at: while the reader is down
 * the list, or has rows checked, new ones wait behind a "3 new" control at the
 * top instead, and come in when it is pressed.
 *
 * `reset` names what the list is of (its query): a new list is not news.
 */
export function useArrivals<Row>(
  rows: Row[] | undefined,
  keyOf: (row: Row) => string,
  reset: string,
  hold: () => boolean,
): {
  shown: Row[] | undefined;
  /** How many wait behind the control. */
  waiting: number;
  arriving: ReadonlySet<string>;
  release: () => void;
} {
  const known = useRef<Set<string> | null>(null);
  const was = useRef(reset);
  const keyRef = useRef(keyOf);
  keyRef.current = keyOf;
  const holdRef = useRef(hold);
  holdRef.current = hold;
  const [held, setHeld] = useState<ReadonlySet<string>>(new Set());
  const [arriving, setArriving] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (was.current !== reset) {
      was.current = reset;
      known.current = null;
      setHeld(new Set());
    }
    if (!rows) return;
    const keys = rows.map((row) => keyRef.current(row));
    if (known.current === null) {
      known.current = new Set(keys);
      return;
    }
    const seen = known.current;
    // News is what comes before the rows the reader already had: a page that is added at the
    // end, or a row that fills a gap, is not news and is shown at once.
    const first = keys.findIndex((key) => seen.has(key));
    const fresh = keys.filter((key, index) => !seen.has(key) && (first < 0 || index < first));
    for (const key of keys) seen.add(key);
    if (fresh.length === 0) return;
    if (holdRef.current()) setHeld((before) => new Set([...before, ...fresh]));
    else setArriving(new Set(fresh));
  }, [rows, reset]);

  // The fade is over once it has run: a row is new only once.
  useEffect(() => {
    if (arriving.size === 0) return;
    const timer = setTimeout(() => setArriving(new Set()), 600);
    return () => clearTimeout(timer);
  }, [arriving]);

  const shown = useMemo(
    () => (rows && held.size > 0 ? rows.filter((row) => !held.has(keyRef.current(row))) : rows),
    [rows, held],
  );
  const release = useCallback(() => {
    setArriving(held);
    setHeld(new Set());
  }, [held]);
  return { shown, waiting: held.size, arriving, release };
}

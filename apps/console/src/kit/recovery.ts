import { useEffect, useState } from "react";

/**
 * A copy, kept in this browser, of something new that has not been saved yet,
 * such as a script whose path is not chosen. If the tab closes or the browser
 * stops, the editor offers it back the next time. It is never sent anywhere.
 */
const PREFIX = "vx-unsaved:";

export function readRecovery<T>(key: string): T | undefined {
  try {
    const text = localStorage.getItem(PREFIX + key);
    return text ? (JSON.parse(text) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function clearRecovery(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Storage that cannot be reached holds nothing to clear.
  }
}

/** Keeps `value` while `keep` holds, half a second after it last changed. */
export function useRecoveryCopy(key: string, value: unknown, keep: boolean) {
  useEffect(() => {
    if (!keep) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
      } catch {
        // A full or blocked storage keeps no copy; the guard on leaving still asks.
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [key, value, keep]);
}

/** The copy kept from an earlier visit, read once when the editor opens, and a way to drop it. */
export function useKeptCopy<T>(key: string, look: boolean) {
  const [kept, setKept] = useState<T | undefined>(() => (look ? readRecovery<T>(key) : undefined));
  return {
    kept,
    drop: () => {
      clearRecovery(key);
      setKept(undefined);
    },
    /** Hides the offer, keeping the copy until the restored work is saved. */
    taken: () => setKept(undefined),
  };
}

import { useCallback, useSyncExternalStore } from "react";

/**
 * A member's own settings, kept on the server so they follow the member from
 * browser to browser, and in this browser so a page draws with them at once
 * (phase 15). Keys are the server's (`PREFERENCE_KEY` in the control plane's
 * routes/preferences.ts): `theme`, `panel`, `shortcuts.single-key`,
 * `editor.<name>`, `density:<list>`, `split:<id>`, `palette.pins:<tenant>`.
 *
 * Nothing waits on the server: a setting is read from this browser, changed
 * here first and sent after a moment. A setting that cannot be sent is kept
 * here, and sent with the next change.
 */

const LOCAL = "vx-pref:";
const SEND_AFTER_MS = 400;

const listeners = new Set<() => void>();
const pending = new Map<string, ReturnType<typeof setTimeout>>();
let loaded: Promise<void> | undefined;
/** Keys moved from the old ones on this page, which are newer than the server's copy. */
const moved = new Set<string>();

function readLocal(key: string): unknown {
  try {
    const kept = localStorage.getItem(LOCAL + key);
    return kept === null ? undefined : JSON.parse(kept);
  } catch {
    return undefined;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    if (value === undefined) localStorage.removeItem(LOCAL + key);
    else localStorage.setItem(LOCAL + key, JSON.stringify(value));
  } catch {
    // Storage that cannot be reached keeps the setting for this visit only.
  }
}

/** The settings this browser holds, by key. */
function localKeys(): string[] {
  try {
    return Object.keys(localStorage)
      .filter((name) => name.startsWith(LOCAL))
      .map((name) => name.slice(LOCAL.length));
  } catch {
    return [];
  }
}

/** Every value is read again from storage; a snapshot per key keeps renders stable. */
const snapshots = new Map<string, { raw: string | null; value: unknown }>();
function snapshot(key: string): unknown {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LOCAL + key);
  } catch {
    raw = null;
  }
  const last = snapshots.get(key);
  if (last && last.raw === raw) return last.value;
  const value = readLocal(key);
  snapshots.set(key, { raw, value });
  return value;
}

const notify = () => {
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** What is waiting to be sent, so leaving the page sends it rather than dropping it. */
const waitingValues = new Map<string, unknown>();

function deliver(key: string, value: unknown) {
  pending.delete(key);
  waitingValues.delete(key);
  const path = `/api/v1/me/preferences/${encodeURIComponent(key)}`;
  // keepalive: a setting changed just before leaving the page still arrives.
  const request =
    value === undefined
      ? fetch(path, { method: "DELETE", keepalive: true })
      : fetch(path, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value }),
          keepalive: true,
        });
  request.catch(() => {
    // Kept in this browser; the next change sends it.
  });
}

function send(key: string, value: unknown, { now = false } = {}) {
  const waiting = pending.get(key);
  if (waiting) clearTimeout(waiting);
  if (now) {
    deliver(key, value);
    return;
  }
  waitingValues.set(key, value);
  pending.set(
    key,
    setTimeout(() => deliver(key, value), SEND_AFTER_MS),
  );
  listenForLeaving();
}

let leaving = false;
function listenForLeaving() {
  if (leaving || typeof addEventListener === "undefined") return;
  leaving = true;
  addEventListener("pagehide", () => {
    for (const [key, value] of [...waitingValues]) {
      const timer = pending.get(key);
      if (timer) clearTimeout(timer);
      deliver(key, value);
    }
  });
}

/** Reads one setting outside React: the theme before the first paint, for one. */
export function readPreference<T>(key: string, fallback: T): T {
  const value = readLocal(key);
  return value === undefined ? fallback : (value as T);
}

/** Changes one setting here at once, and on the server after a moment. `undefined` forgets it. */
export function setPreference(key: string, value: unknown) {
  writeLocal(key, value);
  notify();
  send(key, value);
}

/** One setting, and a way to change it. Every component that reads the key sees the change. */
export function usePreference<T>(key: string, fallback: T): [T, (next: T | undefined) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => snapshot(key),
    () => undefined,
  );
  const change = useCallback((next: T | undefined) => setPreference(key, next), [key]);
  return [value === undefined ? fallback : (value as T), change];
}

/**
 * Where these settings were kept before they were kept on the server, and
 * what each becomes. Moved once, the first time a member signs in after.
 */
const LEGACY: [RegExp, (match: RegExpMatchArray, raw: string) => [string, unknown] | undefined][] =
  [
    // "system", or anything else, is the default: the setting is forgotten.
    [/^vx-theme$/, (_, raw) => ["theme", raw === "light" || raw === "dark" ? raw : undefined]],
    [/^vx-panel$/, (_, raw) => ["panel", raw !== "closed"]],
    [/^vx-density:([a-z][a-z0-9-]*)$/, (match, raw) => [`density:${match[1]}`, raw]],
    [
      /^vx-split:([a-z][a-z0-9-]*)$/,
      (match, raw) =>
        Number.isFinite(Number(raw)) ? [`split:${match[1]}`, Number(raw)] : undefined,
    ],
    [/^vx-editor-(pane|run)$/, (match, raw) => [`editor.${match[1]}`, raw]],
  ];

/** Moves settings kept the old way into the new keys. Returns the keys it moved. */
export function adoptLegacy(): string[] {
  const found: string[] = [];
  try {
    for (const name of Object.keys(localStorage)) {
      for (const [pattern, become] of LEGACY) {
        const match = name.match(pattern);
        if (!match) continue;
        const raw = localStorage.getItem(name);
        const next = raw === null ? undefined : become(match, raw);
        localStorage.removeItem(name);
        // Written after the last move, so newer than what the new key holds.
        if (next) {
          writeLocal(next[0], next[1]);
          found.push(next[0]);
          moved.add(next[0]);
        }
      }
    }
  } catch {
    // Without storage there is nothing to move.
  }
  return found;
}

/**
 * Loads the member's settings from the server, once per page. What the server
 * keeps replaces what this browser has; what only this browser has, such as
 * a setting moved from the old keys, is sent to the server.
 */
export function loadPreferences(): Promise<void> {
  loaded ??= (async () => {
    adoptLegacy();
    try {
      const response = await fetch("/api/v1/me/preferences");
      if (!response.ok) return;
      const { items } = (await response.json()) as { items: { key: string; value: unknown }[] };
      const onServer = new Set(items.map((item) => item.key));
      for (const item of items) {
        if (!pending.has(item.key) && !moved.has(item.key)) writeLocal(item.key, item.value);
      }
      // What the server no longer keeps was forgotten elsewhere: forgotten here too.
      for (const key of localKeys()) {
        if (!onServer.has(key) && !pending.has(key) && !moved.has(key)) writeLocal(key, undefined);
      }
      // Sent at once: the next page may load before a delayed send would go.
      for (const key of moved) send(key, readLocal(key), { now: true });
      moved.clear();
      notify();
    } catch {
      // The server can't be reached: this browser's settings stand.
    }
  })();
  return loaded;
}

/** For tests: forgets what was loaded, so the next test loads again. */
export function resetPreferences() {
  loaded = undefined;
  moved.clear();
  for (const timer of pending.values()) clearTimeout(timer);
  pending.clear();
  waitingValues.clear();
  snapshots.clear();
}

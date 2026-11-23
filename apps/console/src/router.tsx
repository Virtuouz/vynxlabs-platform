import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

const listeners = new Set<() => void>();

/**
 * How the address last changed: a new page (`push`), Back or Forward (`pop`), or
 * the same page refining its address (`replace`), such as a filter or a new
 * script's first save.
 */
let lastChange: "push" | "replace" | "pop" = "push";
export const navigationKind = () => lastChange;

/**
 * Screens holding changes not yet saved. While any is here, leaving the page by
 * a link, by Back or Forward, or by closing or reloading the tab asks first.
 * Refining the same page's address (`replace`) never asks.
 */
const blockers = new Set<{ message: string }>();
/** How the person is asked: the console sets its own dialog. Until it does, nobody is held. */
let askToLeave = async (_message: string) => true;
export function setLeaveQuestion(question: (message: string) => Promise<boolean>) {
  askToLeave = question;
}
/** The address on show, kept to go back to when leaving is refused. */
let shown = typeof location === "object" ? `${location.pathname}${location.search}` : "/";
/** Set while Back is being let through after the person agreed to leave. */
let letPass = false;

if (typeof addEventListener === "function") {
  // Registered before any screen's own listener, so a refused Back is stopped before it is seen.
  addEventListener("popstate", (event) => {
    if (letPass || blockers.size === 0) {
      letPass = false;
      lastChange = "pop";
      shown = `${location.pathname}${location.search}`;
      // The page still shows the entry being left: keep its scroll, then put back the one returned to.
      remember();
      showing = entryOf();
      restore();
      return;
    }
    event.stopImmediatePropagation();
    // The address has already moved: put the page's own back, then ask.
    history.pushState({ entry: showing }, "", shown);
    void askToLeave(messageOfBlockers()).then((leave) => {
      if (!leave) return;
      blockers.clear();
      letPass = true;
      history.back();
    });
  });
  addEventListener("beforeunload", (event) => {
    if (blockers.size === 0) return;
    event.preventDefault();
    // Older browsers show the prompt only when a value is set.
    event.returnValue = "";
  });
}

const messageOfBlockers = () =>
  [...blockers][0]?.message ?? "Changes on this page are not saved. Leave anyway?";

/**
 * Each history entry carries a key, so the scroll of the page and of its own
 * scrolling regions can be put back when Back or Forward returns to it.
 */
let entry = 0;
const entryOf = () => {
  const state = typeof history === "object" ? (history.state as { entry?: number } | null) : null;
  return typeof state?.entry === "number" ? state.entry : 0;
};
if (typeof history === "object" && typeof history.state?.entry !== "number") {
  history.replaceState({ ...(history.state ?? {}), entry: 0 }, "");
}
entry = typeof history === "object" ? Math.max(entry, entryOf()) : 0;
/** Scroll offsets by entry, then by region. Kept for this tab only. */
const scrolls = new Map<number, Map<string, number>>();
const regions = new Map<string, HTMLElement>();
/** The entry on show, known also while the browser is already moving to another. */
let showing = typeof history === "object" ? entryOf() : 0;
const remember = (here = showing) => {
  const saved = scrolls.get(here) ?? new Map<string, number>();
  for (const [id, element] of regions) saved.set(id, element.scrollTop);
  scrolls.set(here, saved);
};
/** Puts each region's offset back for the entry now shown, over a few frames while content loads. */
const restore = () => {
  const saved = scrolls.get(entryOf());
  if (!saved || typeof requestAnimationFrame !== "function") return;
  let frames = 0;
  const step = () => {
    let pending = false;
    for (const [id, top] of saved) {
      const element = regions.get(id);
      if (!element) {
        pending = true;
        continue;
      }
      element.scrollTop = top;
      if (Math.abs(element.scrollTop - top) > 1) pending = true;
    }
    frames += 1;
    if (pending && frames < 30) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

/**
 * Keeps the scroll of `ref` (the page's `main`, or a list's own scrolling
 * region) for each history entry, and puts it back on Back and Forward.
 */
export function useRestoredScroll(ref: { current: HTMLElement | null }, id: string) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    regions.set(id, element);
    if (lastChange === "pop") restore();
    return () => {
      if (regions.get(id) === element) {
        remember();
        regions.delete(id);
      }
    };
  }, [ref, id]);
}

function go(to: string, options: { replace?: boolean }) {
  lastChange = options.replace ? "replace" : "push";
  if (options.replace) history.replaceState({ ...(history.state ?? {}), entry: entryOf() }, "", to);
  else {
    remember();
    entry += 1;
    history.pushState({ entry }, "", to);
    showing = entry;
  }
  shown = `${location.pathname}${location.search}`;
  for (const listener of listeners) listener();
}

const pathOf = (to: string) => new URL(to, location.href).pathname;

export function navigate(to: string, options: { replace?: boolean } = {}) {
  // The same page changing its query, such as opening a row's inspector, is not leaving it.
  if (blockers.size === 0 || options.replace || pathOf(to) === location.pathname) {
    go(to, options);
    return;
  }
  void askToLeave(messageOfBlockers()).then((leave) => {
    if (!leave) return;
    blockers.clear();
    go(to, options);
  });
}

/**
 * Asks, once, whether to leave the page for good, such as by signing out: what a screen holds
 * unsaved is lost with it. True when nothing is held, or the person chose to leave.
 */
export async function confirmLeave(): Promise<boolean> {
  if (blockers.size === 0) return true;
  if (!(await askToLeave(messageOfBlockers()))) return false;
  blockers.clear();
  return true;
}

/**
 * Asks before the page is left while `active`, such as while an editor holds
 * changes it has not saved. `message` says what would be lost.
 */
export function useNavigationGuard(active: boolean, message: string) {
  useEffect(() => {
    if (!active) return;
    const blocker = { message };
    blockers.add(blocker);
    return () => {
      blockers.delete(blocker);
    };
  }, [active, message]);
}

export function usePath(): string {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const update = () => setPath(location.pathname);
    listeners.add(update);
    addEventListener("popstate", update);
    return () => {
      listeners.delete(update);
      removeEventListener("popstate", update);
    };
  }, []);
  return path;
}

/**
 * One value of the address's query, kept in step as the address changes, and a
 * way to change it in place. A filter kept here survives a reload and can be shared.
 */
export function useQueryValue(name: string): [string | null, (value: string | null) => void] {
  const read = useCallback(() => new URLSearchParams(location.search).get(name), [name]);
  const [value, setValue] = useState(read);
  useEffect(() => {
    const update = () => setValue(read());
    listeners.add(update);
    addEventListener("popstate", update);
    return () => {
      listeners.delete(update);
      removeEventListener("popstate", update);
    };
  }, [read]);
  const change = useCallback(
    (next: string | null) => {
      const query = new URLSearchParams(location.search);
      if (next === null) query.delete(name);
      else query.set(name, next);
      const search = query.toString();
      navigate(`${location.pathname}${search ? `?${search}` : ""}`, { replace: true });
    },
    [name],
  );
  return [value, change];
}

/**
 * One key of a screen's view state in the address. `push` keys make a history
 * entry when they change, so Back undoes them: opening a row, a tab, a step.
 * Others replace, so filtering and searching never pile up entries.
 */
type UrlKey =
  | { type: "string"; default?: string; push?: boolean }
  | { type: "number"; default?: number; push?: boolean }
  | { type: "boolean"; default?: boolean; push?: boolean }
  | { type: "list"; push?: boolean };
type UrlValue<K extends UrlKey> = K extends { type: "list" }
  ? string[]
  : K extends { type: "number"; default: number }
    ? number
    : K extends { type: "number" }
      ? number | undefined
      : K extends { type: "boolean" }
        ? boolean
        : K extends { type: "string"; default: string }
          ? string
          : string | undefined;
export type UrlState<S extends Record<string, UrlKey>> = { [Name in keyof S]: UrlValue<S[Name]> };

function readUrlState<S extends Record<string, UrlKey>>(schema: S, search: string): UrlState<S> {
  const query = new URLSearchParams(search);
  const state: Record<string, unknown> = {};
  for (const [name, key] of Object.entries(schema)) {
    const raw = query.get(name);
    if (key.type === "list") state[name] = query.getAll(name).filter(Boolean);
    else if (key.type === "number") {
      const number = raw === null ? Number.NaN : Number(raw);
      state[name] = Number.isFinite(number) ? number : key.default;
    } else if (key.type === "boolean") {
      state[name] = raw === null ? (key.default ?? false) : raw === "1" || raw === "true";
    } else state[name] = raw === null || raw === "" ? key.default : raw;
  }
  return state as UrlState<S>;
}

/** The address for `changes` applied over the current query, with defaults and empties left out. */
export function urlWith<S extends Record<string, UrlKey>>(
  schema: S,
  changes: Partial<UrlState<S>>,
  search = location.search,
): string {
  const query = new URLSearchParams(search);
  for (const [name, value] of Object.entries(changes)) {
    const key = schema[name];
    if (!key) continue;
    query.delete(name);
    if (key.type === "list") {
      for (const one of (value as string[] | undefined) ?? []) if (one) query.append(name, one);
    } else if (value === undefined || value === null || value === "") {
      // Absent means the default.
    } else if ("default" in key && value === key.default) {
      // Defaults are left out, so addresses stay short.
    } else if (key.type === "boolean") {
      if (value) query.set(name, "1");
    } else query.set(name, String(value));
  }
  const text = query.toString();
  return `${location.pathname}${text ? `?${text}` : ""}`;
}

/**
 * A screen's view state (filters, search, sort, tab, the open item) kept in the
 * address, so a reload or a shared link shows the same view, and Back closes
 * what was opened before it leaves the screen.
 */
export function useUrlState<S extends Record<string, UrlKey>>(
  schema: S,
): [UrlState<S>, (changes: Partial<UrlState<S>>) => void] {
  // The schema is written inline by callers, so a new object each render: its text stands for it.
  const shape = JSON.stringify(schema);
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the schema's text
  const stable = useMemo(() => schema, [shape]);
  const read = useCallback(() => readUrlState(stable, location.search), [stable]);
  const [state, setState] = useState(read);
  const [search, setSearch] = useState(() => location.search);
  useEffect(() => {
    const update = () => {
      if (location.search === search) return;
      setSearch(location.search);
      setState(read());
    };
    update();
    listeners.add(update);
    addEventListener("popstate", update);
    return () => {
      listeners.delete(update);
      removeEventListener("popstate", update);
    };
  }, [read, search]);
  const change = useCallback(
    (changes: Partial<UrlState<S>>) => {
      const to = urlWith(stable, changes);
      if (to === `${location.pathname}${location.search}`) return;
      const push = Object.keys(changes).some((name) => stable[name]?.push);
      navigate(to, { replace: !push });
    },
    [stable],
  );
  return [state, change];
}

/**
 * One string of view state in the address, used like `useState`: a filter, a
 * search, a tab, the open item. With `push`, changing it makes a history entry,
 * so Back undoes it (opening something); otherwise it replaces (filtering).
 * Names must be unique on a screen.
 */
export function useUrlParam<T extends string = string>(
  name: string,
  fallback: NoInfer<T>,
  options?: { push?: boolean },
): [T, (value: T | undefined) => void];
export function useUrlParam<T extends string = string>(
  name: string,
  fallback?: undefined,
  options?: { push?: boolean },
): [T | undefined, (value: T | undefined) => void];
export function useUrlParam(
  name: string,
  fallback?: string,
  options: { push?: boolean } = {},
): [string | undefined, (value: string | undefined) => void] {
  const [state, set] = useUrlState({
    [name]: {
      type: "string" as const,
      ...(fallback === undefined ? {} : { default: fallback }),
      ...(options.push ? { push: true } : {}),
    },
  });
  const change = useCallback(
    (value: string | undefined) => set({ [name]: value === "" ? undefined : value }),
    [name, set],
  );
  return [state[name] as string | undefined, change];
}

/** Matches `/t/:tenant/members` style patterns. A trailing `/*` matches any deeper path. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const open = pattern.endsWith("/*");
  const want = (open ? pattern.slice(0, -2) : pattern).split("/").filter(Boolean);
  const have = path.split("/").filter(Boolean);
  if (have.length < want.length || (!open && have.length !== want.length)) return null;
  const params: Record<string, string> = {};
  for (const [index, part] of want.entries()) {
    const actual = have[index] as string;
    if (part.startsWith(":")) params[part.slice(1)] = decodeURIComponent(actual);
    else if (part !== actual) return null;
  }
  return params;
}

/** A link inside a sentence or a cell, which must read as one: in the action color, underlined. */
export const TEXT_LINK = "text-action underline underline-offset-2 hover:no-underline";

export function Link({
  to,
  children,
  className,
  current,
  "aria-label": label,
}: {
  to: string;
  children: ReactNode;
  className?: string;
  current?: boolean;
  /** For a link that is only an icon. */
  "aria-label"?: string;
}) {
  return (
    <a
      href={to}
      className={className}
      aria-label={label}
      aria-current={current ? "page" : undefined}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        // A link inside a row that opens on click goes where it says, not where the row does.
        event.stopPropagation();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

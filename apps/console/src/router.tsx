import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

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
      return;
    }
    event.stopImmediatePropagation();
    // The address has already moved: put the page's own back, then ask.
    history.pushState(null, "", shown);
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

function go(to: string, options: { replace?: boolean }) {
  lastChange = options.replace ? "replace" : "push";
  if (options.replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  shown = `${location.pathname}${location.search}`;
  for (const listener of listeners) listener();
}

export function navigate(to: string, options: { replace?: boolean } = {}) {
  if (blockers.size === 0 || options.replace) {
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

export function Link({
  to,
  children,
  className,
  current,
}: {
  to: string;
  children: ReactNode;
  className?: string;
  current?: boolean;
}) {
  return (
    <a
      href={to}
      className={className}
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

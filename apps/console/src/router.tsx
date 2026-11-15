import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

const listeners = new Set<() => void>();

export function navigate(to: string, options: { replace?: boolean } = {}) {
  if (options.replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  for (const listener of listeners) listener();
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

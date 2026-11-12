import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";

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
  class: className,
  current,
}: {
  to: string;
  children: ComponentChildren;
  class?: string;
  current?: boolean;
}) {
  return (
    <a
      href={to}
      class={className}
      aria-current={current ? "page" : undefined}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

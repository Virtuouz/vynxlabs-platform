import type { ReactNode } from "react";

/**
 * A section that stays folded until it is opened. It is the browser's own
 * `details`, so it opens from the keyboard and is found by a search of the
 * page with no code of ours.
 */
export function Details({
  summary,
  children,
  defaultOpen = false,
}: {
  /** What is shown while it is folded. */
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group rounded-control border border-line">
      <summary className="cursor-pointer px-3 py-2 font-medium marker:text-ink-muted">
        {summary}
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  );
}

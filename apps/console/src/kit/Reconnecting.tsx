import { RefreshCw } from "lucide-react";

/**
 * Says that what is shown may be out of date while the page reads it again,
 * after a read failed. What was shown stays.
 */
export function Reconnecting({ show }: { show: boolean }) {
  return (
    <span role="status" className="inline-flex items-center gap-1 text-meta text-ink-muted">
      {show ? (
        <>
          <RefreshCw aria-hidden="true" size={12} className="animate-spin" />
          Reconnecting…
        </>
      ) : null}
    </span>
  );
}

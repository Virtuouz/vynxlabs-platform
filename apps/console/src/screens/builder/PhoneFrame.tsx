import { Ellipsis } from "lucide-react";
import type { ReactNode } from "react";

/**
 * "Phone layout is made from the desktop one. 1 widget changed by hand." (board 6). The tablet's
 * says the same of the tablet. Counts the widgets with a place of their own for that device.
 */
export function DeviceBanner({ device, changed }: { device: "tablet" | "phone"; changed: number }) {
  return (
    <p
      data-device-banner={device}
      className="mx-auto mb-3 flex w-fit max-w-full items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-1.5 text-body-sm text-ink-muted"
    >
      <span>
        {device === "phone" ? "Phone" : "Tablet"} layout is made from the desktop one.
        {changed > 0 ? (
          <>
            {" "}
            <strong className="font-medium text-ink">
              {changed} {changed === 1 ? "widget" : "widgets"} changed
            </strong>{" "}
            by hand.
          </>
        ) : null}
      </span>
    </p>
  );
}

/**
 * The phone preview, drawn in a device: a rounded outline 390 wide, with the page's title bar
 * ("Money ⋯") above what the page shows (board 6).
 */
export function PhoneFrame({
  title,
  width,
  children,
}: {
  title: string;
  width: number;
  children: ReactNode;
}) {
  return (
    <div
      data-phone-frame=""
      className="mx-auto flex min-w-0 flex-col rounded-[2.25rem] border-2 border-line-strong bg-canvas p-3"
      style={{ maxWidth: `${width}px` }}
    >
      <div className="flex items-center justify-between px-2 pt-1 pb-3">
        <span className="min-w-0 truncate text-title font-semibold text-ink">{title}</span>
        <Ellipsis aria-hidden="true" size={18} className="text-ink-muted" />
      </div>
      <div className="min-w-0 overflow-x-hidden">{children}</div>
    </div>
  );
}

/** Quiet, under the page: what "View as" shows and what it does not. */
export function ViewAsNote({ name }: { name: string }) {
  return (
    <p data-view-as-note="" className="m-0 mb-2 text-center text-meta text-ink-muted">
      Rows are yours: View as shows what {name} sees of the page, not their rows.
    </p>
  );
}

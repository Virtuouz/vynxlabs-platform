import { Ellipsis, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

/** The words of the control that takes a hand-made place back, here and in the question that names it. */
export const ALL_AUTOMATIC = "All automatic";

/** What the builder asks before the first hand-made place on a device; it names controls that exist. */
export const layoutByHandText = (device: "tablet" | "phone") =>
  `The ${device} layout is made from the desktop one. Moving a widget here gives it a place of its own on the ${device}, and it stops following the desktop. Choosing Automatic in the widget's Layout, or ${ALL_AUTOMATIC} above the page, undoes that.`;

/**
 * "Phone layout is made from the desktop one. 1 widget changed by hand." (board 6). The tablet's
 * says the same of the tablet. Counts the widgets with a place of their own for that device.
 */
export function DeviceBanner({
  device,
  changed,
  aside = 0,
  onAutomatic,
}: {
  device: "tablet" | "phone";
  /** The widgets with a place of their own for the device. */
  changed: number;
  /** The widgets drawn away from where they are on the desktop only to make room for those. */
  aside?: number;
  /** "All automatic": every place of its own is taken back. */
  onAutomatic?: (() => void) | undefined;
}) {
  return (
    <p
      data-device-banner={device}
      className="mx-auto mb-3 flex w-fit max-w-full items-center gap-2 rounded-control border border-line bg-surface px-3 py-2 text-meta text-ink-muted"
    >
      <Sparkles aria-hidden="true" size={14} className="shrink-0 text-action" />
      <span>
        {device === "phone" ? "Phone" : "Tablet"} layout is made from the desktop one.
        {changed > 0 ? (
          <>
            {" "}
            <strong className="font-medium text-ink">
              {changed} {changed === 1 ? "widget" : "widgets"} changed
            </strong>{" "}
            by hand
            {aside > 0 ? ` and ${aside} moved aside` : ""}.
          </>
        ) : null}
      </span>
      {changed > 0 && onAutomatic ? (
        <button
          type="button"
          onClick={onAutomatic}
          className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-meta text-action underline outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
        >
          {ALL_AUTOMATIC}
        </button>
      ) : null}
    </p>
  );
}

/**
 * The phone preview, drawn in a device: a rounded outline 390 wide, with the page's title bar
 * ("Money ⋯") above what the page shows (board 6).
 */
export function PhoneFrame({
  on,
  title,
  width,
  children,
}: {
  /** Off, the children are drawn as they are (every other screen size). */
  on: boolean;
  title: string;
  width: number;
  children: ReactNode;
}) {
  if (!on) return <>{children}</>;
  return (
    <div
      data-phone-frame=""
      // The device's corner, as board 6 draws it: 28 px, rounder than any panel.
      style={{ maxWidth: `${width}px`, borderRadius: 28 }}
      className="mx-auto flex min-w-0 flex-col gap-2 border border-line-strong bg-canvas px-3 py-3 shadow-modal"
    >
      <div className="flex items-center justify-between gap-2 px-1 pt-0.5 pb-1.5">
        <span className="min-w-0 truncate text-title font-semibold text-ink">{title}</span>
        <Ellipsis aria-hidden="true" size={16} className="text-ink-muted" />
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

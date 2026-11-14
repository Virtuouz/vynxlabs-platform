import { Dialog as Base } from "@base-ui/react/dialog";
import type { ReactNode } from "react";

export interface SideSheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** A line under the title. */
  description?: ReactNode;
  /** Kept in view at the foot of the sheet: the buttons that finish what it is for. */
  footer?: ReactNode;
  /** `wide` is for a sheet with a table or two columns in it. */
  size?: "regular" | "wide" | "narrow";
  /** The edge it comes from. A menu comes from the left. */
  side?: "right" | "left";
  children: ReactNode;
}

/**
 * A panel that slides over the right of the screen, for work that needs more
 * room than a dialog and should keep the page beneath in view. On a phone it
 * takes the whole screen. Escape and the backdrop close it, and focus goes
 * back to what opened it.
 */
export function SideSheet({
  open,
  onClose,
  title,
  description,
  footer,
  size = "regular",
  side = "right",
  children,
}: SideSheetProps) {
  const width =
    size === "wide"
      ? "sm:w-[min(44rem,92vw)]"
      : size === "narrow"
        ? "sm:w-[min(20rem,92vw)]"
        : "sm:w-[min(30rem,92vw)]";
  return (
    <Base.Root open={open} onOpenChange={(next: boolean) => !next && onClose()}>
      <Base.Portal>
        <Base.Backdrop className="fixed inset-0 z-40 bg-ink/30" />
        <Base.Popup
          className={`fixed inset-y-0 z-50 flex w-full flex-col border-line bg-surface shadow-2xl ${
            side === "left" ? "left-0 sm:border-r" : "right-0 sm:border-l"
          } ${width}`}
        >
          <div className="flex items-start justify-between gap-3 border-line border-b px-5 py-4">
            <div className="flex min-w-0 flex-col gap-1">
              <span aria-hidden="true" className="h-0.5 w-5 bg-action" />
              <Base.Title className="m-0 text-title">{title}</Base.Title>
              {description ? (
                <Base.Description className="m-0 text-meta text-ink-muted">
                  {description}
                </Base.Description>
              ) : null}
            </div>
            <Base.Close
              aria-label="Close"
              className="flex size-8 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-sunken hover:text-ink"
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </Base.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <div className="flex flex-wrap items-center justify-end gap-2 border-line border-t px-5 py-3">
              {footer}
            </div>
          ) : null}
        </Base.Popup>
      </Base.Portal>
    </Base.Root>
  );
}

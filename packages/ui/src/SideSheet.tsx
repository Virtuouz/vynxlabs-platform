import { Dialog as Base } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useOpening } from "./presence.tsx";

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
  /** Its width in pixels, or `"full"` for the window less a margin, as its maker chose; on a phone it is the screen. Left out, `size`. */
  width?: number | "full";
  /** The edge it comes from. A menu comes from the left. */
  side?: "right" | "left";
  /**
   * Where the focus goes when it closes. Left out, or answering nothing, it goes back to what
   * opened it. A sheet that steps through records gives the row of the one it was last on.
   */
  returnFocus?: () => HTMLElement | null;
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
  width: chosen,
  side = "right",
  returnFocus,
  children,
}: SideSheetProps) {
  const width =
    size === "wide"
      ? "sm:w-[min(44rem,92vw)]"
      : size === "narrow"
        ? "sm:w-[min(20rem,92vw)]"
        : "sm:w-[min(30rem,92vw)]";
  const shown = useOpening(open);
  return (
    <Base.Root open={shown} onOpenChange={(next: boolean) => !next && onClose()}>
      <Base.Portal>
        <Base.Backdrop className="fixed inset-0 layer-sheet bg-ink/30 transition-opacity motion-slow data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Base.Popup
          {...(returnFocus ? { finalFocus: () => returnFocus() ?? true } : {})}
          className={`fixed inset-y-0 layer-sheet flex w-full flex-col border-line bg-surface shadow-modal transition-transform motion-slow ${
            side === "left"
              ? "left-0 sm:border-r data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full"
              : "right-0 sm:border-l data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full"
          } ${width}`}
          {...(chosen !== undefined
            ? {
                style: {
                  width: chosen === "full" ? "calc(100vw - 2rem)" : `${chosen}px`,
                  maxWidth: "100vw",
                },
              }
            : {})}
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
              <X aria-hidden="true" size={16} />
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

import { Dialog as Base } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useOpening } from "./presence.tsx";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string | undefined;
  /** Drawn in a tile before the title: what the dialog is about, as the boards head theirs. */
  icon?: ReactNode;
  /** Kept in view along the foot, set off by a hairline: the buttons that finish it. */
  footer?: ReactNode;
  /**
   * `wide` is for a form with a table or an editor in it. `palette` fills a
   * phone's screen, and is a panel near the top on anything wider. `table` is
   * for a dialog that is a table to read: most of the window, with the table
   * filling it, and the whole screen on a phone. A table in a `regular` dialog
   * is always scrolled.
   */
  size?: "regular" | "wide" | "palette" | "table";
  /**
   * Called once it has left, after its motion. What closing it leads to, such as
   * opening another screen, waits for this, so the dialog is seen to go.
   */
  onClosed?: () => void;
  children: ReactNode;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  icon,
  footer,
  size = "regular",
  onClosed,
  children,
}: DialogProps) {
  const shown = useOpening(open);
  return (
    <Base.Root
      open={shown}
      onOpenChange={(next: boolean) => !next && onClose()}
      onOpenChangeComplete={(now: boolean) => {
        if (!now) onClosed?.();
      }}
    >
      <Base.Portal>
        {/* Above a side sheet: a question asked from one is answered over it. */}
        <Base.Backdrop className="fixed inset-0 layer-dialog bg-scrim transition-opacity motion-slow data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Base.Popup
          className={`fixed layer-dialog flex flex-col overflow-hidden border-line bg-surface shadow-modal transition-[opacity,scale] motion-slow data-[ending-style]:opacity-0 data-[starting-style]:scale-98 data-[starting-style]:opacity-0 ${
            size === "table"
              ? "inset-0 flex flex-col md:inset-auto md:top-[8vh] md:left-1/2 md:h-[84vh] md:w-[min(76rem,calc(100vw-3rem))] md:-translate-x-1/2 md:rounded-overlay md:border"
              : size === "palette"
                ? "inset-0 md:inset-auto md:top-[10vh] md:left-1/2 md:max-h-[80vh] md:w-[min(40rem,calc(100vw-2rem))] md:-translate-x-1/2 md:rounded-overlay md:border"
                : `left-1/2 max-h-[88vh] -translate-x-1/2 rounded-overlay border ${
                    size === "wide"
                      ? "top-[6vh] w-[min(46rem,calc(100vw-2rem))]"
                      : "top-[12vh] w-[min(30rem,calc(100vw-2rem))]"
                  }`
          }`}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3">
            <div className="flex min-w-0 items-center gap-3">
              {icon ? (
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-control border border-action/30 bg-action-soft text-action"
                >
                  {icon}
                </span>
              ) : null}
              <Base.Title className="m-0 truncate text-title font-semibold">{title}</Base.Title>
            </div>
            {/* A way out that can be seen and pressed, beside Esc and the backdrop. */}
            <Base.Close
              aria-label="Close"
              className="-mr-1 flex size-8 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-hover hover:text-ink"
            >
              <X aria-hidden="true" size={16} />
            </Base.Close>
          </div>
          <div
            className={`min-h-0 flex-1 px-5 py-4 ${
              size === "table" ? "flex flex-col overflow-hidden" : "overflow-y-auto"
            }`}
          >
            {description ? (
              <Base.Description className="mt-0 mb-4 text-ink-muted">
                {description}
              </Base.Description>
            ) : null}
            {size === "table" ? (
              <div className="flex min-h-0 flex-1 flex-col">{children}</div>
            ) : (
              children
            )}
          </div>
          {footer ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
              {footer}
            </div>
          ) : null}
        </Base.Popup>
      </Base.Portal>
    </Base.Root>
  );
}

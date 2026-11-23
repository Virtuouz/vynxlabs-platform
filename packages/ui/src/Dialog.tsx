import { Dialog as Base } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
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
  /** Its width in pixels, or `"full"` for the window less a margin, as its maker chose. It scrolls inside, at the height the window allows. */
  width?: number | "full";
  /**
   * Called once it has left, after its motion. What closing it leads to, such as
   * opening another screen, waits for this, so the dialog is seen to go.
   */
  onClosed?: () => void;
  /**
   * The dialog draws its own head and padding (the widget selector's search row): the title
   * stays for a screen reader, with no bar and no close button, and the children fill the panel.
   */
  bare?: boolean;
  /**
   * `false` for a dialog that cannot be set aside, such as the one that asks for a new sign-in:
   * it draws no close button, and Esc and a press on the backdrop leave it open.
   */
  dismissible?: boolean;
  children: ReactNode;
}

/** A field a person types into: not a switch, a choice, a file or a hidden one. */
const TEXT_FIELD =
  'textarea:not([disabled]), select:not([disabled]), input:not([disabled]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]):not([type="color"]):not([type="button"]):not([type="submit"])';

/**
 * The first field to type in or choose from, in the order it is read. An optional date is not
 * the one to start on: that would open its calendar (or a phone's picker) before anything was
 * asked, so it is passed over.
 */
export function firstField(root: HTMLElement | null): HTMLElement | undefined {
  return Array.from(root?.querySelectorAll<HTMLElement>(TEXT_FIELD) ?? []).find(
    (field) => !(field.hasAttribute("data-date-input") && !field.hasAttribute("required")),
  );
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  icon,
  footer,
  size = "regular",
  width,
  onClosed,
  bare = false,
  dismissible = true,
  children,
}: DialogProps) {
  const shown = useOpening(open);
  const popup = useRef<HTMLDivElement>(null);
  // A form that is read after the dialog opened (a page's modal) has no field yet when the focus
  // is placed, and the focus waits on Close. When its first field arrives, and the person has not
  // moved the focus themselves, the field takes it.
  useEffect(() => {
    if (!shown) return;
    let cleanup: (() => void) | undefined;
    let frame = 0;
    const start = () => {
      const root = popup.current;
      if (!root) {
        frame = requestAnimationFrame(start);
        return;
      }
      let moved = false;
      const mine = () => {
        moved = true;
      };
      root.addEventListener("keydown", mine, true);
      root.addEventListener("pointerdown", mine, true);
      const settle = () => {
        if (moved) return watch.disconnect();
        const on = document.activeElement;
        const waiting =
          !on || on === document.body || on === root || on.getAttribute("aria-label") === "Close";
        if (!waiting) return watch.disconnect();
        const field = firstField(root);
        if (field) {
          field.focus();
          watch.disconnect();
        }
      };
      const watch = new MutationObserver(settle);
      watch.observe(root, { childList: true, subtree: true });
      const stop = setTimeout(() => watch.disconnect(), 4000);
      cleanup = () => {
        clearTimeout(stop);
        watch.disconnect();
        root.removeEventListener("keydown", mine, true);
        root.removeEventListener("pointerdown", mine, true);
      };
    };
    start();
    return () => {
      cancelAnimationFrame(frame);
      cleanup?.();
    };
  }, [shown]);
  return (
    <Base.Root
      open={shown}
      onOpenChange={(next: boolean) => !next && dismissible && onClose()}
      onOpenChangeComplete={(now: boolean) => {
        if (!now) onClosed?.();
      }}
    >
      <Base.Portal>
        {/* Above a side sheet: a question asked from one is answered over it. */}
        <Base.Backdrop className="fixed inset-0 layer-dialog bg-scrim transition-opacity motion-slow data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Base.Popup
          ref={popup}
          // What marks itself `data-autofocus` (a search field) gets the focus; else the first
          // field to type in, so a dialog that asks for a name takes the name as it opens; else
          // the first control does.
          initialFocus={() =>
            popup.current?.querySelector<HTMLElement>("[data-autofocus]") ??
            firstField(popup.current) ??
            true
          }
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
          {...(width !== undefined
            ? {
                style: {
                  width: width === "full" ? "calc(100vw - 2rem)" : `${width}px`,
                  maxWidth: "calc(100vw - 2rem)",
                },
              }
            : {})}
        >
          {bare ? (
            <Base.Title className="sr-only">{title}</Base.Title>
          ) : (
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
                <Base.Title className="m-0 line-clamp-3 min-w-0 text-title font-semibold [overflow-wrap:anywhere]">
                  {title}
                </Base.Title>
              </div>
              {/* A way out that can be seen and pressed, beside Esc and the backdrop. */}
              {dismissible ? (
                <Base.Close
                  aria-label="Close"
                  className="-mr-1 flex size-8 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-hover hover:text-ink"
                >
                  <X aria-hidden="true" size={16} />
                </Base.Close>
              ) : null}
            </div>
          )}
          <div
            className={`min-h-0 flex-1 ${bare ? "" : "px-5 py-4"} ${
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

import { Dialog as Base } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { firstField } from "./Dialog.tsx";
import { useOpening } from "./presence.tsx";
import { useReturnFocus } from "./returnFocus.ts";

export interface SideSheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** A line under the title. */
  description?: ReactNode;
  /** Drawn in a tile before the title, as the boards head a drawer. */
  icon?: ReactNode;
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

const TABBABLE =
  'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** Whether the browser draws it, so that Tab can stop on it: not `display: none`, not `visibility: hidden`. */
function drawn(element: HTMLElement): boolean {
  if (typeof element.checkVisibility === "function") {
    return element.checkVisibility({ visibilityProperty: true });
  }
  return true;
}

/**
 * What a person can reach with Tab inside `root`, in order: the same as the browser's own, so the
 * first and last of them are where Tab really begins and ends. A hidden input, a control that is
 * not drawn, and every radio of a group but the one that holds the group's stop are not among them.
 */
function tabbables(root: HTMLElement): HTMLElement[] {
  const found = [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter(
    (one) =>
      !one.matches(":disabled") &&
      one.getAttribute("tabindex") !== "-1" &&
      !one.closest("[hidden], [inert], fieldset:disabled") &&
      one.getAttribute("aria-hidden") !== "true" &&
      !(one instanceof HTMLInputElement && one.type === "hidden") &&
      drawn(one),
  );
  return found.filter((one) => {
    if (!(one instanceof HTMLInputElement) || one.type !== "radio" || !one.name) return true;
    const group = found.filter(
      (other): other is HTMLInputElement =>
        other instanceof HTMLInputElement &&
        other.type === "radio" &&
        other.name === one.name &&
        other.form === one.form,
    );
    const stop = group.find((other) => other.checked) ?? group[0];
    return one === stop;
  });
}

/**
 * Tab and Shift+Tab stay in the sheet: from its last control to its first, and back. The page
 * beneath is not reached, whatever the sheet holds (fields, a picker, a footer).
 */
function keepTabInside(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab" || event.defaultPrevented) return;
  const root = event.currentTarget;
  const all = tabbables(root);
  const first = all[0];
  const last = all.at(-1);
  if (!first || !last) {
    event.preventDefault();
    return;
  }
  const at = document.activeElement;
  if (event.shiftKey && (at === first || at === root || !root.contains(at))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (at === last || !root.contains(at))) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * What keeps Tab in the sheet when the list above and the browser part: a stop the sheet did not
 * know of. Focus that lands on the page behind it, on the body or on a focus guard, right after a
 * Tab, goes back to the sheet's first control (Shift+Tab: its last). Focus that goes into
 * another layer the sheet opened, such as a menu or a picker, is left alone.
 */
function useKeepFocusInside(open: boolean, popup: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open) return;
    let tabbed: { shift: boolean; at: number } | undefined;
    const noteTab = (event: KeyboardEvent) => {
      if (event.key === "Tab") tabbed = { shift: event.shiftKey, at: Date.now() };
    };
    const onFocus = (event: FocusEvent) => {
      const root = popup.current;
      const target = event.target;
      if (!root || !(target instanceof HTMLElement) || root.contains(target)) return;
      if (!tabbed || Date.now() - tabbed.at > 500) return;
      const page =
        target === document.body ||
        target === document.documentElement ||
        target.hasAttribute("data-base-ui-focus-guard") ||
        !target.closest(
          '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="tooltip"], [data-base-ui-portal]',
        );
      if (!page) return;
      const all = tabbables(root);
      (tabbed.shift ? all.at(-1) : all[0])?.focus();
    };
    document.addEventListener("keydown", noteTab, true);
    document.addEventListener("focusin", onFocus, true);
    return () => {
      document.removeEventListener("keydown", noteTab, true);
      document.removeEventListener("focusin", onFocus, true);
    };
  }, [open, popup]);
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
  icon,
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
  const popup = useRef<HTMLDivElement>(null);
  const opener = useReturnFocus(open);
  useKeepFocusInside(shown, popup);
  return (
    <Base.Root open={shown} onOpenChange={(next: boolean) => !next && onClose()}>
      <Base.Portal>
        <Base.Backdrop className="fixed inset-0 layer-sheet bg-scrim transition-opacity motion-slow data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Base.Popup
          ref={popup}
          onKeyDown={keepTabInside}
          // As a dialog does: what marks itself `data-autofocus`, else the first field to type in
          // or choose from, else the first control. A form does not open with Enter on Close.
          initialFocus={() =>
            popup.current?.querySelector<HTMLElement>("[data-autofocus]") ??
            firstField(popup.current) ??
            true
          }
          finalFocus={() => returnFocus?.() ?? opener()}
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
          <div className="flex items-center justify-between gap-3 border-line border-b px-5 py-3">
            <div className="flex min-w-0 items-center gap-3">
              {icon ? (
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-control border border-action/30 bg-action-soft text-action"
                >
                  {icon}
                </span>
              ) : null}
              <div className="flex min-w-0 flex-col">
                <Base.Title className="m-0 text-title font-semibold">{title}</Base.Title>
                {description ? (
                  <Base.Description className="m-0 text-meta text-ink-muted">
                    {description}
                  </Base.Description>
                ) : null}
              </div>
            </div>
            <Base.Close
              aria-label="Close"
              className="flex size-8 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-hover hover:text-ink"
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

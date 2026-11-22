import { Tooltip as Base } from "@base-ui/react/tooltip";
import { type ReactElement, type ReactNode, useCallback, useEffect, useRef, useState } from "react";

/** A key or combination, as a person presses it: `⌘K`, `Esc`, `g then r`. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-inner border border-line-strong bg-track px-1.5 font-mono text-code-sm leading-none whitespace-nowrap text-ink-muted">
      {children}
    </kbd>
  );
}

/**
 * Gives a group of tooltips one delay: once one is showing, moving to the next
 * shows it at once. Put once around the app.
 */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <Base.Provider delay={500} closeDelay={0}>
      {children}
    </Base.Provider>
  );
}

/**
 * Says what a control does, and its shortcut, when it is pointed at or
 * focused (08 §3.17). For an icon-only control or one whose shortcut is worth
 * learning; a control whose words say it all needs none. The control keeps
 * its own accessible name: the tooltip repeats it for sighted people.
 *
 * A disabled button takes no pointer or focus, so to say why it is disabled
 * the tooltip goes around a focusable wrapper: pass `disabledReason`.
 */
export function Tooltip({
  label,
  keys,
  children,
  side = "top",
  tapToShow = false,
}: {
  label: ReactNode;
  /** The shortcut, written for people: `⌘Z`. */
  keys?: string | undefined;
  /** One element that takes focus: a button or a link. */
  children: ReactElement;
  side?: "top" | "bottom" | "left" | "right";
  /**
   * A touch screen has no pointing: a tap shows the words for a few seconds. For the reason a
   * button is disabled, which a person on a phone would otherwise never be told.
   */
  tapToShow?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Shown by a tap: the finger lifting is not the pointer leaving, so hover's close is ignored.
  const tapped = useRef(false);
  const hide = useCallback(() => {
    clearTimeout(timer.current);
    tapped.current = false;
    setOpen(false);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  // A tap anywhere else puts it away.
  useEffect(() => {
    if (!open || !tapped.current) return;
    const away = () => hide();
    const soon = setTimeout(
      () => document.addEventListener("pointerdown", away, { once: true }),
      50,
    );
    return () => {
      clearTimeout(soon);
      document.removeEventListener("pointerdown", away);
    };
  }, [open, hide]);
  const touch = tapToShow
    ? {
        onPointerUp: (event: { pointerType: string }) => {
          if (event.pointerType !== "touch") return;
          clearTimeout(timer.current);
          tapped.current = true;
          setOpen(true);
          timer.current = setTimeout(hide, 5000);
        },
      }
    : {};
  return (
    <Base.Root
      {...(tapToShow
        ? {
            open,
            onOpenChange: (next: boolean, details?: { reason?: string }) => {
              if (!next && tapped.current && details?.reason !== "escape-key") return;
              if (!next) tapped.current = false;
              setOpen(next);
            },
          }
        : {})}
    >
      <Base.Trigger render={children} {...touch} />
      <Base.Portal>
        <Base.Positioner side={side} sideOffset={6} className="layer-popover">
          <Base.Popup className="flex max-w-xs items-center gap-2 rounded-control border border-line-strong bg-raised px-2 py-1.5 text-meta text-ink shadow-overlay transition-[opacity,translate] motion-base data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 data-[starting-style]:translate-y-1">
            <span>{label}</span>
            {keys ? <Kbd>{keys}</Kbd> : null}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}

import { Tooltip as Base } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";

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
}: {
  label: ReactNode;
  /** The shortcut, written for people: `⌘Z`. */
  keys?: string | undefined;
  /** One element that takes focus: a button or a link. */
  children: ReactElement;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <Base.Root>
      <Base.Trigger render={children} />
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

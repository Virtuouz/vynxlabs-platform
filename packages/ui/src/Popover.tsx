import { Popover as Base } from "@base-ui/react/popover";
import type { ReactElement, ReactNode } from "react";

/**
 * A small panel of words or controls that opens from a control and closes on
 * Escape or a click outside (08 §3.17): what a page is for, behind its help
 * control. Focus moves into it while it is open and back to the control after.
 */
export function Popover({
  trigger,
  title,
  children,
  side = "bottom",
  align = "start",
  open,
  onOpenChange,
  wide = false,
  titleHidden = false,
}: {
  /** One element that takes focus: a button. */
  trigger: ReactElement;
  /** Names the panel for screen readers, and heads it. */
  title: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  /** Opened and closed from outside, such as by a key typed elsewhere. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** For a panel that holds a list to choose from, with no padding of its own. */
  wide?: boolean;
  /** The title names the panel for screen readers only, for one whose contents say what it is. */
  titleHidden?: boolean;
}) {
  return (
    <Base.Root
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange ? { onOpenChange: (next: boolean) => onOpenChange(next) } : {})}
    >
      <Base.Trigger render={trigger} />
      <Base.Portal>
        <Base.Positioner side={side} align={align} sideOffset={6} className="layer-popover">
          <Base.Popup
            className={`rounded-panel border border-line-strong text-ink shadow-overlay transition-[opacity,translate] motion-base data-[ending-style]:opacity-0 data-[starting-style]:-translate-y-1 data-[starting-style]:opacity-0 ${
              wide
                ? "w-[22rem] max-w-[90vw] overflow-hidden bg-raised p-0"
                : "max-w-sm bg-raised p-3"
            }`}
          >
            <Base.Title
              className={titleHidden ? "sr-only" : "m-0 mb-1.5 text-body-sm font-semibold"}
            >
              {title}
            </Base.Title>
            <Base.Description render={<div />} className={wide ? "" : "text-ink-muted"}>
              {children}
            </Base.Description>
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}

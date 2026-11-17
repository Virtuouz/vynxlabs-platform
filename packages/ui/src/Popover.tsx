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
}: {
  /** One element that takes focus: a button. */
  trigger: ReactElement;
  /** Names the panel for screen readers, and heads it. */
  title: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}) {
  return (
    <Base.Root>
      <Base.Trigger render={trigger} />
      <Base.Portal>
        <Base.Positioner side={side} align={align} sideOffset={6} className="layer-popover">
          <Base.Popup className="max-w-sm rounded-control border border-line bg-surface p-3 text-ink shadow-overlay transition-[opacity,translate] motion-base data-[ending-style]:opacity-0 data-[starting-style]:-translate-y-1 data-[starting-style]:opacity-0">
            <Base.Title className="m-0 mb-1 text-meta font-semibold">{title}</Base.Title>
            <Base.Description render={<div />} className="text-ink-muted">
              {children}
            </Base.Description>
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}

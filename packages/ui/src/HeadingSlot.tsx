import { createContext, type ReactNode, useContext } from "react";
import { createPortal } from "react-dom";

/**
 * The place on a widget's heading row, at its right, that a view may put controls in: a table's
 * "New invoice" button sits beside its title, so on a phone it is not alone on a line of its own.
 * The frame around the widget gives it; a view drawn with no frame (a test, a modal) gets none.
 */
export const HeadingSlot = createContext<HTMLElement | null>(null);

/** What a view puts on its widget's heading row. With no heading row to put it in, it is drawn where it is. */
export function OnHeading({ children }: { children: ReactNode }) {
  const slot = useContext(HeadingSlot);
  return slot ? createPortal(children, slot) : <>{children}</>;
}

/** Whether a widget's configuration has controls for its heading row, so that the frame keeps the row for them. */
export function hasHeadingControls(config: Readonly<Record<string, unknown>> | undefined): boolean {
  const buttons = config?.buttons;
  return Array.isArray(buttons) && buttons.length > 0;
}

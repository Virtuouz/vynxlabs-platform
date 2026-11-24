import { useRef } from "react";

/** The thing that had the focus when a dialog or sheet opened, and what held it, nearest first. */
interface Opener {
  element: HTMLElement;
  holders: HTMLElement[];
}

function noteOpener(): Opener | undefined {
  const element = document.activeElement;
  if (!(element instanceof HTMLElement) || element === document.body) return undefined;
  const holders: HTMLElement[] = [];
  for (let up = element.parentElement; up && up !== document.body; up = up.parentElement) {
    holders.push(up);
  }
  return { element, holders };
}

/**
 * Where the focus goes when a dialog or sheet closes: back to what opened it. When that has left
 * the page (a Discard or a Keep removes the very button that was pressed), to the nearest thing
 * that held it and is still there, so the person stays where they were and Tab goes on from
 * there, rather than starting again at the top of the page. Nothing to go back to answers
 * `true`, the library's own choice. When the focus already sits in another open dialog, it stays
 * there (`false`).
 */
export function useReturnFocus(open: boolean): () => HTMLElement | boolean {
  const noted = useRef<Opener | undefined>(undefined);
  const was = useRef(false);
  if (open && !was.current) noted.current = noteOpener();
  was.current = open;
  return () => {
    // Another dialog or sheet opened as this one closed (a question answered, and its answer
    // shown in a dialog): the focus is in that one now, and is not taken back to the page behind it.
    const on = document.activeElement;
    if (
      on?.closest(
        '[role="dialog"]:not([data-ending-style]), [role="alertdialog"]:not([data-ending-style])',
      )
    )
      return false;
    const opener = noted.current;
    if (!opener) return true;
    if (opener.element.isConnected) return opener.element;
    const holder = opener.holders.find((one) => one.isConnected);
    if (!holder) return true;
    if (!holder.hasAttribute("tabindex")) holder.setAttribute("tabindex", "-1");
    return holder;
  };
}

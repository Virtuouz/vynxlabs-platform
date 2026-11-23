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
 * `true`, the library's own choice.
 */
export function useReturnFocus(open: boolean): () => HTMLElement | true {
  const noted = useRef<Opener | undefined>(undefined);
  const was = useRef(false);
  if (open && !was.current) noted.current = noteOpener();
  was.current = open;
  return () => {
    const opener = noted.current;
    if (!opener) return true;
    if (opener.element.isConnected) return opener.element;
    const holder = opener.holders.find((one) => one.isConnected);
    if (!holder) return true;
    if (!holder.hasAttribute("tabindex")) holder.setAttribute("tabindex", "-1");
    return holder;
  };
}

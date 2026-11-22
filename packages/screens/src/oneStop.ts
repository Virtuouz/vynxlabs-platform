import { type FocusEvent, type KeyboardEvent, useCallback, useRef } from "react";

const FOCUSABLE =
  'a[href],button,input,select,textarea,summary,iframe,[tabindex],[contenteditable="true"]';

/**
 * A widget on the builder's canvas is one stop for the keyboard, as a composite widget is: Tab
 * reaches the card, Enter (or a click inside) goes in to what it holds, Esc comes back out to the
 * card, and Tab leaves it again. What is inside keeps its place in the page and is only taken
 * out of the Tab order while the card is not entered, so a page of ten widgets is ten stops and
 * not forty. Pass `active: false` (the served app) and nothing is changed: there, only what can
 * be used is a stop to begin with.
 */
export function useOneStop(active: boolean) {
  const node = useRef<HTMLElement | null>(null);
  const inside = useRef(false);
  const watching = useRef<MutationObserver | undefined>(undefined);

  const mute = useCallback(() => {
    const card = node.current;
    if (!card || inside.current) return;
    for (const one of card.querySelectorAll<HTMLElement>(FOCUSABLE)) {
      if (one.dataset.oneStop !== undefined || one.tabIndex < 0) continue;
      one.dataset.oneStop = one.getAttribute("tabindex") ?? "";
      one.tabIndex = -1;
    }
  }, []);
  const unmute = useCallback(() => {
    const card = node.current;
    if (!card) return;
    for (const one of card.querySelectorAll<HTMLElement>("[data-one-stop]")) {
      const was = one.dataset.oneStop;
      if (was === "" || was === undefined) one.removeAttribute("tabindex");
      else one.setAttribute("tabindex", was);
      delete one.dataset.oneStop;
    }
  }, []);

  const ref = useCallback(
    (card: HTMLElement | null) => {
      watching.current?.disconnect();
      node.current = card;
      if (!active || !card) return;
      mute();
      if (typeof MutationObserver === "function") {
        watching.current = new MutationObserver(mute);
        watching.current.observe(card, { childList: true, subtree: true });
      }
    },
    [active, mute],
  );

  if (!active) return { ref, props: {} };
  return {
    ref,
    props: {
      onFocus: (event: FocusEvent<HTMLElement>) => {
        // Focus that arrived inside (a click on a heading) is the person being inside.
        if (event.target !== event.currentTarget && !inside.current) {
          inside.current = true;
          unmute();
        }
      },
      onBlur: (event: FocusEvent<HTMLElement>) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        inside.current = false;
        mute();
      },
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
        const card = event.currentTarget;
        if (event.key === "Enter" && event.target === card && !inside.current) {
          inside.current = true;
          unmute();
          const first = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE)).find(
            (one) => one.tabIndex >= 0 && !(one as HTMLButtonElement).disabled,
          );
          if (first) {
            event.preventDefault();
            first.focus();
          } else {
            inside.current = false;
            mute();
          }
        } else if (event.key === "Escape" && event.target !== card && inside.current) {
          const target = event.target as HTMLElement;
          // A box being typed in has its own Esc first.
          if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable) return;
          event.stopPropagation();
          inside.current = false;
          mute();
          card.focus();
        }
      },
    },
  };
}

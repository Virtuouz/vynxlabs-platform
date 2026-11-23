import { useEffect, useId, useSyncExternalStore } from "react";

/**
 * Which help the screen has, and whether the help panel is open.
 *
 * Every screen has a topic from where it is in the navigation. A page, a pane
 * or a dialog can say a topic of its own with `useHelpTopic`, and the one said
 * last, which is the innermost, wins: a dialog over its page, a page over its
 * section. The panel shows that topic until the reader follows a link inside
 * it, and goes back to it when they move to another screen.
 */

/**
 * What the panel shows in place of the screen's own topic: a topic's id or a
 * page's path, with `#heading` after it to open at a heading.
 */
export type HelpTarget = string;

export interface HelpState {
  open: boolean;
  /** The screen's own topic, when it has one. */
  topic: string | undefined;
  /** What the reader went to from there. */
  target: HelpTarget | undefined;
}

let section: string | undefined;
const declared: { owner: string; topic: string }[] = [];
let state: HelpState = { open: false, topic: undefined, target: undefined };
const listeners = new Set<() => void>();

function set(next: Partial<HelpState>) {
  const merged = { ...state, ...next };
  if (merged.open === state.open && merged.topic === state.topic && merged.target === state.target)
    return;
  state = merged;
  for (const listener of listeners) listener();
}

function retopic() {
  const topic = declared.at(-1)?.topic ?? section;
  // Another screen: what was followed from the last one is left behind.
  if (topic !== state.topic) set({ topic, target: undefined });
}

/** Says the topic of where the reader is in the navigation. The shell's, and nobody else's. */
export function setSectionTopic(topic: string | undefined) {
  section = topic;
  retopic();
}

/** Says this page's, pane's or dialog's own topic, for as long as it is shown. */
export function useHelpTopic(topic: string | undefined) {
  const owner = useId();
  useEffect(() => {
    if (topic === undefined) return;
    declared.push({ owner, topic });
    retopic();
    return () => {
      const at = declared.findIndex((one) => one.owner === owner);
      if (at >= 0) declared.splice(at, 1);
      retopic();
    };
  }, [owner, topic]);
}

/** Says a topic from inside JSX, for a dialog whose body is drawn only while it is open. */
export function HelpTopic({ topic }: { topic: string }) {
  // docs:dynamic the caller's own topic, which check.mjs reads at the JSX's call site
  useHelpTopic(topic);
  return null;
}

/** Where focus was when the panel opened, before the panel took it. */
let opener: Element | null = null;

/** Opens the panel: at the screen's own help, or at something else. */
export function openHelp(target?: HelpTarget) {
  if (!state.open && typeof document !== "undefined") opener = document.activeElement;
  set(target ? { open: true, target } : { open: true });
}

/** What had focus when the panel opened, once: for giving it back when the panel closes. */
export function takeOpener(): Element | null {
  const was = opener;
  opener = null;
  return was;
}

/** Closes the panel. It keeps its place, for when it is opened again on the same screen. */
export function closeHelp() {
  set({ open: false });
}

export function toggleHelp() {
  if (state.open) closeHelp();
  else openHelp();
}

/** Goes back to the screen's own help. */
export function showPageHelp() {
  set({ target: undefined });
}

/** The topic the screen has now, for a test or a caller outside a component. */
export const getHelpTopic = () => state.topic;

export function useHelp(): HelpState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
}

/** For tests: as if nothing had been opened or said. */
export function resetHelp() {
  section = undefined;
  declared.length = 0;
  state = { open: false, topic: undefined, target: undefined };
  for (const listener of listeners) listener();
}

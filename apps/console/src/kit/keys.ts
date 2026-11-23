import { useEffect, useLayoutEffect, useRef } from "react";
import { readPreference, usePreference } from "../prefs.ts";
import { SHORTCUTS, type ShortcutId } from "./shortcuts.ts";

/**
 * The console's one keyboard registry (phase 15, P3-1). Every shortcut is
 * declared once in `shortcuts.ts`, with its keys, scope and label. The sheet,
 * the tooltips and the palette read that list; `useShortcut` binds a handler
 * to it. One listener on the window serves every binding.
 *
 * Keys are written as `Mod+K` (⌘ on a Mac, Ctrl elsewhere), `Shift+Mod+Z`,
 * `Escape`, a single character such as `?` or `j`, or a chord such as `g r`
 * (g, then r within a second).
 */

export const OPEN_PALETTE = "vx-open-palette";
export const OPEN_SHORTCUTS = "vx-open-shortcuts";
/** Opens the palette from anywhere: the code editor, which keeps ⌘K from the page, asks this way. */
export const openPalette = () => dispatchEvent(new Event(OPEN_PALETTE));
/** Opens the list of shortcuts: from the account menu and the palette. */
export const openShortcuts = () => dispatchEvent(new Event(OPEN_SHORTCUTS));

/** Whether a key press is meant for a field being typed in, rather than for the page. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  // The code editor types through an element of its own (an EditContext in Chromium), and a
  // custom text box says what it is by its role.
  if (target.closest('.monaco-editor, [role="textbox"], [role="combobox"]')) return true;
  if (target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;
  if (target.tagName !== "INPUT") return false;
  const type = (target as HTMLInputElement).type;
  // A checkbox or a button keeps no text: a shortcut pressed on one is for the page.
  return !["checkbox", "radio", "button", "submit", "reset", "range", "color"].includes(type);
}

export const isMac = () =>
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const SINGLE_KEY = "shortcuts.single-key";

/** Whether single-key shortcuts such as `?`, `/`, `j` and `g r` are on. WCAG 2.1.4 lets people turn them off. */
export const singleKeysOn = () => readPreference<boolean>(SINGLE_KEY, true);
export const useSingleKeys = () => usePreference<boolean>(SINGLE_KEY, true);

/** A combination without a chord: whether the event is it. */
function pressed(event: KeyboardEvent, combo: string): boolean {
  const parts = combo.split("+");
  const key = parts.pop() as string;
  const want = new Set(parts);
  const mac = isMac();
  // Off a Mac, Ctrl is the command key: `Ctrl+Y` and `Mod+Y` are the same press.
  const wantMod = want.has("Mod") || (!mac && want.has("Ctrl"));
  if (wantMod !== (mac ? event.metaKey : event.ctrlKey)) return false;
  if (mac && want.has("Ctrl") !== event.ctrlKey) return false;
  if (!mac && event.metaKey) return false;
  if (want.has("Alt") !== event.altKey) return false;
  // Shift makes a character such as `?`: it is checked for letters and named keys only.
  const shiftMatters = key.length > 1 || /^[a-z]$/i.test(key);
  if (shiftMatters && want.has("Shift") !== event.shiftKey) return false;
  return event.key.toLowerCase() === key.toLowerCase();
}

/** Whether a combination is a single key a person may turn off: no ⌘, Ctrl or Alt. */
export const isSingle = (combo: string) =>
  // A function key types nothing, so it is safe in a field and is no "single key" to turn off.
  !/(^|\+)(Mod|Ctrl|Alt)\+/.test(combo) && combo !== "Escape" && !/^(Shift\+)?F\d+$/.test(combo);

/**
 * Whether turning single keys off turns this combination off. Enter, Space and the arrows
 * belong to the list the focus is in, and work either way.
 */
export const turnsOff = (combo: string) =>
  isSingle(combo) &&
  !/^(Shift\+)?(Enter| |Arrow\w+|Home|End|Page\w+|Tab|Backspace|Delete)$/.test(combo);

interface Binding {
  id: ShortcutId;
  /** Returns `false` when it did nothing, so the key goes on to the next binding and the page. */
  run: (event: KeyboardEvent) => unknown;
  /** Whether it is on now: read at the key press, not at the last render. */
  on: () => boolean;
}

const bindings: Binding[] = [];
let chord: { first: string; at: number } | undefined;
let listening = false;
const CHORD_MS = 1000;

/** Whether this key is the second step of a chord begun a moment ago: it is the chord's, whatever binds the key alone. */
const completesChord = (event: KeyboardEvent) =>
  chord !== undefined &&
  Date.now() - chord.at < CHORD_MS &&
  bindings.some((binding) =>
    SHORTCUTS[binding.id].keys.some((combo) => {
      const steps = combo.split(" ");
      return steps.length === 2 && steps[0] === chord?.first && pressed(event, steps[1] as string);
    }),
  );

function dispatch(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing) return;
  const typing = isTyping(event.target);
  const secondOfChord = completesChord(event);
  const singles = singleKeysOn();
  // The binding made last wins: a dialog's over the page's.
  for (let index = bindings.length - 1; index >= 0; index -= 1) {
    const binding = bindings[index] as Binding;
    const shortcut = SHORTCUTS[binding.id];
    for (const combo of shortcut.keys) {
      const single = isSingle(combo);
      if (single && (typing || !singles || (secondOfChord && !combo.includes(" ")))) continue;
      if (!single && typing && shortcut.notInFields) continue;
      const steps = combo.split(" ");
      if (steps.length === 2) {
        const [first, second] = steps as [string, string];
        if (
          chord &&
          chord.first === first &&
          Date.now() - chord.at < CHORD_MS &&
          pressed(event, second)
        ) {
          if (binding.run(event) === false) continue;
          chord = undefined;
          event.preventDefault();
          return;
        }
        continue;
      }
      if (pressed(event, combo)) {
        if (binding.run(event) === false) continue;
        event.preventDefault();
        chord = undefined;
        return;
      }
    }
  }
  // The first key of a chord: kept for a second, waiting for the second.
  if (!typing && singles && !event.metaKey && !event.ctrlKey && !event.altKey) {
    const starts = bindings.some(
      (binding) =>
        binding.on() &&
        SHORTCUTS[binding.id].keys.some(
          (combo) => combo.split(" ").length === 2 && combo.startsWith(`${event.key} `),
        ),
    );
    chord = starts ? { first: event.key, at: Date.now() } : undefined;
  }
}

/**
 * Binds a handler to a declared shortcut while the component is shown. A
 * single key is ignored while typing and when single keys are turned off; a
 * shortcut marked `notInFields` is ignored while typing too.
 */
export function useShortcut(
  id: ShortcutId,
  /** Returns `false` when there was nothing to do, so the key goes on. */
  handler: (event: KeyboardEvent) => unknown,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const latest = useRef(handler);
  const allowed = useRef(enabled);
  // Taken before the browser paints, so that a key pressed right after typing runs this render's
  // handler, not the previous one.
  useLayoutEffect(() => {
    latest.current = handler;
    allowed.current = enabled;
  });
  useEffect(() => {
    if (!listening) {
      addEventListener("keydown", dispatch);
      listening = true;
    }
    // Always bound, and asked whether it is on at the key press: a shortcut turned on by the
    // last keystroke (a draft that just became unsaved) works before the next render.
    const binding: Binding = {
      id,
      run: (event) => (allowed.current ? latest.current(event) : false),
      on: () => allowed.current,
    };
    bindings.push(binding);
    return () => {
      const at = bindings.indexOf(binding);
      if (at >= 0) bindings.splice(at, 1);
    };
  }, [id]);
}

const NAMES: Record<string, [mac: string, other: string]> = {
  Mod: ["⌘", "Ctrl"],
  Ctrl: ["⌃", "Ctrl"],
  Shift: ["⇧", "Shift"],
  Alt: ["⌥", "Alt"],
  Enter: ["↵", "Enter"],
  Escape: ["Esc", "Esc"],
  ArrowUp: ["↑", "↑"],
  ArrowDown: ["↓", "↓"],
  ArrowLeft: ["←", "←"],
  ArrowRight: ["→", "→"],
  " ": ["Space", "Space"],
};

/** How one combination is written for people: `⇧⌘Z` on a Mac, `Ctrl+Shift+Z` elsewhere, `g then r`. */
export function formatCombo(combo: string, mac = isMac()): string {
  if (combo.includes(" ") && combo.trim().length > 1 && !combo.includes("+")) {
    return combo
      .split(" ")
      .map((step) => formatCombo(step, mac))
      .join(" then ");
  }
  const parts = combo.split("+");
  const key = parts.pop() as string;
  const name = (part: string) => {
    const known = NAMES[part];
    if (known) return mac ? known[0] : known[1];
    return part.length === 1 ? part.toUpperCase() : part;
  };
  if (mac) {
    const order = ["Ctrl", "Alt", "Shift", "Mod"];
    const mods = parts.sort((a, b) => order.indexOf(a) - order.indexOf(b)).map(name);
    return mods.join("") + (key.length === 1 && parts.length === 0 ? key : name(key));
  }
  const order = ["Mod", "Ctrl", "Alt", "Shift"];
  const mods = parts.sort((a, b) => order.indexOf(a) - order.indexOf(b)).map(name);
  return [...mods, key.length === 1 && parts.length === 0 ? key : name(key)].join("+");
}

/** A shortcut's keys as people read them, its first combination only: for a tooltip or a menu. */
export const keysOf = (id: ShortcutId) => {
  const first = SHORTCUTS[id].keys[0];
  return first ? formatCombo(first) : "";
};

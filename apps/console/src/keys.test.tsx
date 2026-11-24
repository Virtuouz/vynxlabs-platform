// @vitest-environment happy-dom
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ShortcutSheet } from "./kit/CommandPalette.tsx";
import { formatCombo, openShortcuts, useShortcut } from "./kit/keys.ts";
import { SHORTCUTS, type ShortcutId } from "./kit/shortcuts.ts";
import { resetPreferences, setPreference } from "./prefs.ts";
import { show } from "./testing.tsx";

beforeEach(() => {
  localStorage.clear();
  resetPreferences();
  vi.stubGlobal("fetch", async () => new Response(null, { status: 204 }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Binds every shortcut the console binds itself, and counts what each was pressed for. */
function Bound({ seen }: { seen: string[] }) {
  for (const id of Object.keys(SHORTCUTS) as ShortcutId[]) {
    // biome-ignore lint/correctness/useHookAtTopLevel: the list is fixed, so the order is too
    useShortcut(id, () => seen.push(id), { enabled: !SHORTCUTS[id].handledBy });
  }
  return <input aria-label="A field" />;
}

const press = (key: string, extra: Partial<KeyboardEventInit> = {}, on: Element = document.body) =>
  fireEvent.keyDown(on, { key, bubbles: true, ...extra });

/** `g`, then a letter. */
const chord = (letter: string) => {
  press("g");
  press(letter);
};

/** One press for each shortcut the console binds, and what it must reach. */
const PRESSES: [ShortcutId, () => void][] = [
  ["palette", () => press("k", { ctrlKey: true })],
  ["sheet", () => press("?", { shiftKey: true })],
  ["search", () => press("/")],
  ["help", () => press("F1")],
  ["go.overview", () => chord("o")],
  ["go.runs", () => chord("r")],
  ["go.flows", () => chord("f")],
  ["go.scripts", () => chord("s")],
  ["go.triggers", () => chord("t")],
  ["go.approvals", () => chord("a")],
  ["save", () => press("s", { ctrlKey: true })],
  ["run", () => press("Enter", { ctrlKey: true })],
  ["undo", () => press("z", { ctrlKey: true })],
  ["redo", () => press("z", { ctrlKey: true, shiftKey: true })],
  ["rename", () => press("F2")],
  ["add.widget", () => press("a")],
  ["close", () => press("Escape")],
  ["flow.duplicate", () => press("d", { ctrlKey: true })],
];

test("every shortcut the console binds itself is pressed here, and reaches its handler", () => {
  const bound = (Object.keys(SHORTCUTS) as ShortcutId[]).filter((id) => !SHORTCUTS[id].handledBy);
  expect(PRESSES.map(([id]) => id).sort()).toEqual(bound.sort());
  const seen: string[] = [];
  render(<Bound seen={seen} />);
  for (const [id, doIt] of PRESSES) {
    seen.length = 0;
    doIt();
    // ⌘↵ is both the editor's Run and the palette's; the palette's is its own component's.
    expect(seen, id).toEqual([id]);
  }
  // Help has a second way, ⌘/.
  seen.length = 0;
  press("/", { ctrlKey: true });
  expect(seen).toEqual(["help"]);
  // Redo has a second way, Ctrl+Y.
  seen.length = 0;
  press("y", { ctrlKey: true });
  expect(seen).toEqual(["redo"]);
});

test("single keys wait while typing and when turned off; ⌘ keys work in a field, except undo", () => {
  const seen: string[] = [];
  render(<Bound seen={seen} />);
  const field = screen.getByLabelText("A field");
  press("?", { shiftKey: true }, field);
  press("g", {}, field);
  press("r", {}, field);
  press("z", { ctrlKey: true }, field);
  expect(seen).toEqual([]);
  press("s", { ctrlKey: true }, field);
  expect(seen).toEqual(["save"]);
  // A function key types nothing: help opens from a field too, and with single keys turned off.
  press("F1", {}, field);
  expect(seen).toEqual(["save", "help"]);

  act(() => setPreference("shortcuts.single-key", false));
  seen.length = 0;
  press("?", { shiftKey: true });
  press("/");
  press("g");
  press("r");
  press("k", { ctrlKey: true });
  press("F1");
  expect(seen).toEqual(["palette", "help"]);
});

test("a chord's second key must come within a second", () => {
  vi.useFakeTimers();
  const seen: string[] = [];
  render(<Bound seen={seen} />);
  press("g");
  vi.advanceTimersByTime(1500);
  vi.setSystemTime(Date.now() + 1500);
  press("r");
  expect(seen).toEqual([]);
  vi.useRealTimers();
});

test("keys are written as a Mac and as everything else write them", () => {
  expect(formatCombo("Mod+K", true)).toBe("⌘K");
  expect(formatCombo("Mod+K", false)).toBe("Ctrl+K");
  expect(formatCombo("Shift+Mod+Z", true)).toBe("⇧⌘Z");
  expect(formatCombo("Shift+Mod+Z", false)).toBe("Ctrl+Shift+Z");
  expect(formatCombo("g r", false)).toBe("g then r");
  expect(formatCombo("Escape", false)).toBe("Esc");
  expect(formatCombo("?", true)).toBe("?");
});

test("the sheet lists every shortcut, opens from outside, and turns single keys off", async () => {
  show(<ShortcutSheet />);
  act(() => openShortcuts());
  const sheet = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
  for (const shortcut of Object.values(SHORTCUTS)) {
    expect(sheet.textContent).toContain(shortcut.label);
  }
  const switchOff = screen.getByLabelText("Single-key shortcuts") as HTMLInputElement;
  expect(switchOff.checked).toBe(true);
  fireEvent.click(switchOff);
  expect((screen.getByLabelText("Single-key shortcuts") as HTMLInputElement).checked).toBe(false);
  expect(sheet.textContent).toContain("Search this list (off)");
});

const here = dirname(fileURLToPath(import.meta.url));
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });

test("no screen listens for keys on the page by hand: shortcuts go through the registry", () => {
  // The registry itself, and kit parts whose keys work only inside them.
  // The diagram listens on its own box, which holds the focus, and runs on served sites too,
  // where there is no registry: its keys are the diagram's, not the page's.
  const allowed = new Set(["kit/keys.ts", "diagrams/draw.ts"]);
  const found = files(here)
    .filter((path) => !allowed.has(path.slice(here.length + 1)))
    .filter((path) => /addEventListener\(\s*"keydown"/.test(readFileSync(path, "utf8")))
    .map((path) => path.slice(here.length + 1));
  expect(found).toEqual([]);
});

function Saves({ text, on, seen }: { text: string; on: boolean; seen: string[] }) {
  useShortcut("save", () => seen.push(text), { enabled: on });
  return null;
}

test("a key pressed after the handler is swapped runs the newest one, and an off shortcut lets the key go on", () => {
  const seen: string[] = [];
  const view = render(<Saves text="before" on seen={seen} />);
  view.rerender(<Saves text="after the typing" on seen={seen} />);
  press("s", { ctrlKey: true });
  expect(seen).toEqual(["after the typing"]);
  view.rerender(<Saves text="off" on={false} seen={seen} />);
  const event = new KeyboardEvent("keydown", {
    key: "s",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  document.body.dispatchEvent(event);
  expect(seen).toEqual(["after the typing"]);
  expect(event.defaultPrevented).toBe(false);
  view.rerender(<Saves text="on again" on seen={seen} />);
  press("s", { ctrlKey: true });
  expect(seen).toEqual(["after the typing", "on again"]);
});

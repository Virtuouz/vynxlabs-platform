import { configure, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach } from "vitest";
import { Providers } from "./ask.tsx";
import { dropWaitingPreferences } from "./prefs.ts";

// A screen that loads its editor or its lists late is waited for longer than a second: with the
// whole suite running at once, a few take that long to draw, and that is not a failure.
configure({ asyncUtilTimeout: 10_000 });

// A screen keeps its filters and open item in the address. Each test starts without
// what the one before left there.
afterEach(() => {
  dropWaitingPreferences();
  if (typeof location === "object" && location.search) {
    history.replaceState(history.state, "", location.pathname);
  }
});

/** Renders a screen with the console's dialogs and toasts around it. */
export function show(ui: ReactElement) {
  return render(ui, { wrapper: Providers });
}

/**
 * Answers the dialog that is open: types `text` into its field when given,
 * then presses the button called `action`. Returns what the dialog said.
 */
export async function answer(action: string, text?: string): Promise<string> {
  const dialog = await screen.findByRole("dialog");
  const said = dialog.textContent ?? "";
  if (text !== undefined) {
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: text } });
  }
  fireEvent.click(await within(dialog).findByRole("button", { name: action }));
  return said;
}

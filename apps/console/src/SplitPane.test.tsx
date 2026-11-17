// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SplitPane } from "./kit/SplitPane.tsx";
import { readPreference, resetPreferences } from "./prefs.ts";

beforeEach(() => {
  localStorage.clear();
  resetPreferences();
  vi.stubGlobal("fetch", async () => new Response(null, { status: 204 }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const split = () =>
  render(
    <SplitPane
      id="test"
      label="Resize the two"
      initial={60}
      collapsible="second"
      paneLabels={{ first: "the canvas", second: "the settings" }}
      first={<p>Canvas</p>}
      second={<p>Settings</p>}
    />,
  );

test("the divider moves by keyboard, resets on a double-click, and keeps its place", () => {
  split();
  const divider = screen.getByRole("separator", { name: "Resize the two" });
  expect(divider.getAttribute("aria-valuenow")).toBe("60");
  fireEvent.keyDown(divider, { key: "ArrowLeft" });
  expect(divider.getAttribute("aria-valuenow")).toBe("58");
  fireEvent.keyDown(divider, { key: "ArrowRight", shiftKey: true });
  expect(divider.getAttribute("aria-valuenow")).toBe("68");
  // Kept with the member's settings, so another visit finds it as it was left.
  expect(readPreference("split:test", 0)).toBe(68);
  fireEvent.keyDown(divider, { key: "End" });
  expect(Number(divider.getAttribute("aria-valuenow"))).toBeLessThanOrEqual(85);
  fireEvent.doubleClick(divider);
  expect(divider.getAttribute("aria-valuenow")).toBe("60");
});

test("Enter folds the pane that may be folded, and its rail opens it again", () => {
  split();
  fireEvent.keyDown(screen.getByRole("separator"), { key: "Enter" });
  expect(screen.queryByText("Settings")).toBeNull();
  expect(screen.queryByRole("separator")).toBeNull();
  expect(readPreference("split:test", 0)).toEqual({ size: 60, collapsed: "second" });
  fireEvent.click(screen.getByRole("button", { name: "Show the settings" }));
  expect(screen.getByText("Settings")).toBeTruthy();
  expect(screen.getByRole("separator").getAttribute("aria-valuenow")).toBe("60");
});

test("a size kept the old way, as a bare number, still opens as it was", () => {
  localStorage.setItem("vx-pref:split:test", "42");
  split();
  expect(screen.getByRole("separator").getAttribute("aria-valuenow")).toBe("42");
});

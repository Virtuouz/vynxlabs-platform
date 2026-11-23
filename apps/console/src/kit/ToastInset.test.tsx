// @vitest-environment happy-dom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { show } from "../testing.tsx";
import { Inspector } from "./layout.tsx";

beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: 352 });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as { offsetWidth?: number }).offsetWidth;
});

test("WLK-12f: an open docked inspector tells the toasts how much room it takes, and gives it back", async () => {
  const view = show(
    <Inspector open title="Ada" label="Person" onClose={() => {}}>
      Body
    </Inspector>,
  );
  await screen.findByRole("complementary", { name: "Person" });
  expect(document.documentElement.style.getPropertyValue("--vx-toast-inset")).toBe("352px");
  view.unmount();
  expect(document.documentElement.style.getPropertyValue("--vx-toast-inset")).toBe("");
});

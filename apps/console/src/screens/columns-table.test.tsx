// @vitest-environment happy-dom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { show } from "../testing.tsx";
import { ColumnsTable } from "./Data.tsx";

// Phase 31 (cols): on a phone the Columns table of a definition shows each column's rules and
// default under its name, and its actions under that, not in cells hidden or pushed past the edge.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const rows = [
  { name: "email", type: "text", required: true, unique: true, default: "none@example.com" },
  { name: "note", type: "text" },
] as never;
const actionsOf = (row: { name: string }) => [{ label: `Rules ${row.name}`, onSelect: () => {} }];

function viewport(wide: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: wide,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

test("at phone width each column's rules, default and actions stand under its name", () => {
  viewport(false);
  show(<ColumnsTable rows={rows} actionsOf={actionsOf as never} />);
  const first = document.querySelectorAll("tbody tr")[0] as HTMLElement;
  const stack = first.querySelector("[data-column-stack]") as HTMLElement;
  expect(stack.textContent).toContain("Required, No two rows alike");
  expect(stack.textContent).toContain("When not given: none@example.com");
  expect(screen.getByRole("button", { name: "Actions for email" })).toBeTruthy();
  // The actions column past the right edge is not drawn.
  expect(first.querySelectorAll("td").length).toBe(4);
});

test("from a tablet up the rules, default and actions keep their own columns", () => {
  viewport(true);
  show(<ColumnsTable rows={rows} actionsOf={actionsOf as never} />);
  expect(document.querySelector("[data-column-stack]")).toBeNull();
  expect(screen.getByRole("button", { name: "Rules email" })).toBeTruthy();
  expect(screen.getByRole("columnheader", { name: "Rules" })).toBeTruthy();
});

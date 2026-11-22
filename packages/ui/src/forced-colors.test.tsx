// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { TilePicker } from "./drawer/Choices.tsx";

// Phase 28, K1: in forced colors (Windows high contrast) every fill is gone, so what is chosen must
// be outlined. The kit does it once, in its stylesheet, for whatever says it is chosen.

afterEach(cleanup);

const css = readFileSync(join(__dirname, "tokens.css"), "utf8");

test("the kit outlines what is chosen in forced colors, whichever way it says so", () => {
  const block = css.slice(css.indexOf("@media (forced-colors: active)"));
  expect(block).toContain("outline: 2px solid Highlight");
  for (const chosen of [
    '[aria-current="page"]',
    '[aria-selected="true"]',
    '[aria-pressed="true"]',
    '[aria-checked="true"]',
    "[data-selected]",
  ]) {
    expect(block, chosen).toContain(chosen);
  }
  // A focused one keeps its own focus ring.
  expect(block).toContain(":not(:focus-visible");
});

test("a tile that is chosen says so to the stylesheet, not only by its fill", () => {
  render(
    <TilePicker
      label="Page type"
      value="b"
      onChange={() => {}}
      options={[
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta" },
      ]}
    />,
  );
  expect(screen.getByText("Beta").closest("label")?.hasAttribute("data-selected")).toBe(true);
  expect(screen.getByText("Alpha").closest("label")?.hasAttribute("data-selected")).toBe(false);
});

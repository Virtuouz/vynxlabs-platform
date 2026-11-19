import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { CONTRAST_NEEDED, contrastRatio } from "./contrast.ts";

/** The kit's color tokens for one scheme, read from its stylesheet. */
function tokens(block: "light" | "dark"): Record<string, string> {
  const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
  const body =
    block === "light"
      ? (/:root \{([^}]*)\}/.exec(css)?.[1] ?? "")
      : (/:root\[data-theme="dark"\] \{([^}]*)\}/.exec(css)?.[1] ?? "");
  return Object.fromEntries(
    [...body.matchAll(/--vx-([a-z-]+):\s*(#[0-9a-f]{3,6});/gi)].map((m) => [m[1], m[2]]),
  ) as Record<string, string>;
}

test("contrast is measured as WCAG does", () => {
  expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 5);
  expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
  expect(contrastRatio("#687485", "#eef1f4")).toBeCloseTo(4.19, 2);
  expect(contrastRatio("rgb(0, 0, 0)", "#ffffff")).toBeCloseTo(21, 5);
  expect(contrastRatio("tomato", "#fff")).toBeUndefined();
});

// The pairs in docs/uiux/07-design-system-specification.md §7.4.
const TEXT = ["ink", "ink-muted", "ink-subtle"];
describe.each([
  ["light", ["canvas", "surface", "sunken", "structure", "selected"], ["attention", "success"]],
  ["dark", ["canvas", "surface", "sunken", "raised", "selected"], []],
] as const)("the %s theme", (scheme, grounds, status) => {
  const values = tokens(scheme);
  test.each(grounds)("text and status words are readable on %s", (ground) => {
    for (const ink of [...TEXT, ...status]) {
      const ratio = contrastRatio(values[ink] as string, values[ground] as string) as number;
      expect({ ink, ground, ratio: Number(ratio.toFixed(2)) }).toEqual({
        ink,
        ground,
        ratio: expect.toSatisfy((r: number) => r >= CONTRAST_NEEDED.text),
      });
    }
  });
  test.each(grounds)("the edge of a control stands out on %s", (ground) => {
    const ratio = contrastRatio(values["line-control"] as string, values[ground] as string);
    expect(ratio).toBeGreaterThanOrEqual(CONTRAST_NEEDED.edge);
  });
  if (scheme === "light") {
    test("status words are readable on their own soft backgrounds", () => {
      for (const tone of ["attention", "success", "danger"]) {
        const ratio = contrastRatio(values[tone] as string, values[`${tone}-soft`] as string);
        expect(ratio, tone).toBeGreaterThanOrEqual(CONTRAST_NEEDED.text);
      }
    });
  }
});

describe("text on a colour its author chose", () => {
  test("black or white, whichever reads better, always reaches what text needs", async () => {
    const { readableOn } = await import("./Badge.tsx");
    expect(readableOn("#000000")).toBe("#ffffff");
    expect(readableOn("#ffffff")).toBe("#000000");
    expect(readableOn("#2563eb")).toBe("#ffffff");
    expect(readableOn("#d97706")).toBe("#000000");
    // Every colour: stepped through the cube, the better of the two is never short of 4.5 to 1.
    let least = 21;
    for (let r = 0; r < 256; r += 15) {
      for (let g = 0; g < 256; g += 15) {
        for (let b = 0; b < 256; b += 15) {
          const color = `#${[r, g, b].map((one) => one.toString(16).padStart(2, "0")).join("")}`;
          least = Math.min(least, contrastRatio(color, readableOn(color)) as number);
        }
      }
    }
    expect(least).toBeGreaterThanOrEqual(CONTRAST_NEEDED.text);
  });
});

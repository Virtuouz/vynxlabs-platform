import { describe, expect, test } from "vitest";
import { DOCS_CSS } from "./css.js";

/** The site's frame: where the navigation sheet comes from, and what a description's code looks like. */
const phone = /@media \(max-width: 1023\.98px\) \{([\s\S]*?)\n\}\n/.exec(DOCS_CSS)?.[1] ?? "";

describe("the navigation sheet on a phone (p31-site 2)", () => {
  test("is at the right edge, where the menu button is, and slides in from the right and back", () => {
    const side = /\.side \{([^}]*)\}/.exec(phone)?.[1] ?? "";
    expect(side).toContain("inset: 0 0 0 auto");
    expect(side).toContain("translateX(102%)");
    expect(side).toContain("border-left");
    expect(side).not.toContain("border-right");
    expect(side).not.toContain("translateX(-");
    expect(side).toMatch(/transition: transform 0\.24s/);
    // Open, by its address without script or by the class with it.
    expect(phone).toMatch(/\.side:target, body\.nav-open \.side \{[^}]*transform: none/);
  });

  test("moves less for a reader who asked for less motion", () => {
    expect(DOCS_CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[^}]*transition-duration: 0\.01ms/,
    );
  });
});

describe("code in a description (p31-site 4)", () => {
  test("is a chip of its own on the ink, not the sunken ground that dark pages nearly share with the canvas", () => {
    const rule =
      [...DOCS_CSS.matchAll(/\.lead code, \.card code[^{]*\{([^}]*)\}/g)]
        .map((one) => one[1] ?? "")
        .find((one) => one.includes("padding")) ?? "";
    expect(rule).toContain("color-mix(in srgb, var(--vx-ink)");
    expect(rule).not.toContain("--vx-sunken");
  });
});

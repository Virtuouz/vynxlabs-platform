import { readFileSync } from "node:fs";
import { DOC_CSS } from "@volvel/markup";
import { describe, expect, test } from "vitest";
import { CONTRAST_NEEDED, contrastRatio, parseColor } from "./contrast.ts";

/**
 * The stripes of a table and the chip of inline code are drawn from the page's own ink at some strength
 * (`color-mix(in srgb, ink N%, transparent)`). Here each is laid over the grounds a page is drawn on, with
 * the kit's tokens of each look, and the words on it are measured.
 */
const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
const tokens = (block: "light" | "dark") => {
  const body =
    block === "light"
      ? (/:root \{([^}]*)\}/.exec(css)?.[1] ?? "")
      : (/:root\[data-theme="dark"\] \{([^}]*)\}/.exec(css)?.[1] ?? "");
  return Object.fromEntries(
    [...body.matchAll(/--vx-([a-z-]+):\s*(#[0-9a-f]{3,6});/gi)].map((m) => [m[1], m[2]]),
  ) as Record<string, string>;
};

/** The percent of ink a custom property of the stylesheet mixes in. */
const percent = (name: string): number => {
  const found = new RegExp(
    `${name}: color-mix\\(in srgb, var\\(--vd-ink, #[0-9a-f]+\\) (\\d+)%, transparent\\)`,
  ).exec(DOC_CSS);
  expect(found, `${name} is a mix of the page's ink`).not.toBeNull();
  return Number(found?.[1]);
};

/** The ink at `pct` percent over `ground`, as the solid color a reader sees. */
const mixed = (ink: string, ground: string, pct: number): string => {
  const a = parseColor(ink) as { r: number; g: number; b: number };
  const b = parseColor(ground) as { r: number; g: number; b: number };
  const at = (x: number, y: number) => Math.round((x * pct + y * (100 - pct)) / 100);
  return `rgb(${at(a.r, b.r)}, ${at(a.g, b.g)}, ${at(a.b, b.b)})`;
};

describe.each(["light", "dark"] as const)("the %s look", (look) => {
  const t = tokens(look);
  for (const ground of ["canvas", "surface"]) {
    const base = t[ground] as string;
    const stripe = mixed(t.ink as string, base, percent("--vd-stripe"));
    const chip = mixed(t.ink as string, base, percent("--vd-code-bg"));

    test(`text on a table's stripe over ${ground} reads at 4.5:1`, () => {
      for (const word of ["ink", "ink-muted", "action"]) {
        const ratio = contrastRatio(t[word] as string, stripe) as number;
        expect({ word, ratio: Number(ratio.toFixed(2)) }).toEqual({
          word,
          ratio: expect.toSatisfy((r: number) => r >= CONTRAST_NEEDED.text),
        });
      }
    });

    test(`the stripe is a visible step from the ground ${ground}, and the chip is a deeper one`, () => {
      expect(contrastRatio(stripe, base) as number).toBeGreaterThanOrEqual(1.05);
      expect(contrastRatio(chip, base) as number).toBeGreaterThan(
        contrastRatio(stripe, base) as number,
      );
    });

    test(`inline code reads at 4.5:1 on its chip over ${ground}, which is not a code block's ground`, () => {
      expect(contrastRatio(t.ink as string, chip) as number).toBeGreaterThanOrEqual(
        CONTRAST_NEEDED.text,
      );
      // A block of code sits on the sunken ground; the chip is not it, and is far enough from it to be seen against it.
      expect(chip).not.toBe(t.sunken);
      expect(contrastRatio(chip, base) as number).toBeGreaterThanOrEqual(1.2);
    });
  }
});

// @vitest-environment happy-dom
import { expect, test } from "vitest";
import { PanZoom } from "./draw.ts";

const SVG = "http://www.w3.org/2000/svg";

/** A diagram `width` by `height`, in a box of the size a phone gives it. */
function drawn(width: number, height: number, box = { w: 350, h: 300 }) {
  const frame = document.createElement("div");
  frame.getBoundingClientRect = () => ({ width: box.w, height: box.h }) as DOMRect;
  const svg = document.createElementNS(SVG, "svg") as SVGSVGElement;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.append(document.createElementNS(SVG, "rect"));
  frame.append(svg);
  document.body.append(frame);
  new PanZoom(svg, frame);
  const transform = svg.querySelector("g")?.getAttribute("transform") ?? "";
  const [scale, , , , x, y] = transform
    .replace(/matrix\(|\)/g, "")
    .split(",")
    .map(Number) as number[];
  return { scale: scale as number, x: x as number, y: y as number };
}

test("a diagram fitted to a phone's box is whole and in the middle, however wide it was drawn (P31)", () => {
  const wide = drawn(2400, 600);
  // Whole: nothing of it is outside the box on either side.
  expect(wide.scale * 2400).toBeLessThanOrEqual(350);
  expect(wide.x).toBeCloseTo((350 - 2400 * wide.scale) / 2, 3);
  expect(wide.x).toBeGreaterThanOrEqual(0);
});

test("a diagram that is smaller than its box is not enlarged, and is in the middle", () => {
  const small = drawn(200, 100);
  expect(small.scale).toBe(1);
  expect(small.x).toBeCloseTo(75, 3);
});

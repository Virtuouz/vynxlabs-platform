import type { PageWidget } from "@vynxlabs/manifest";
import { expect, test } from "vitest";
import { settle } from "./layout.ts";

const widget = (id: string, x: number, y: number, w: number, h: number): PageWidget => ({
  id,
  type: "text",
  at: { x, y, w, h },
});
const where = (widgets: PageWidget[]) =>
  Object.fromEntries(widgets.map((one) => [one.id, `${one.at.x},${one.at.y}`]));

test("a widget dropped on another pushes it down, and what was under that follows", () => {
  const widgets = [widget("a", 0, 0, 6, 8), widget("b", 0, 8, 12, 8), widget("c", 0, 16, 6, 4)];
  // The wide one is dragged to the top, onto the first.
  (widgets[1] as PageWidget).at.y = 0;
  settle(widgets, "b");
  expect(where(widgets)).toEqual({ a: "0,8", b: "0,0", c: "0,16" });
});

test("widgets side by side are left side by side, and nothing moves that is not in the way", () => {
  const widgets = [widget("a", 0, 0, 6, 8), widget("b", 6, 0, 6, 8), widget("c", 0, 8, 12, 4)];
  (widgets[0] as PageWidget).at.h = 10;
  settle(widgets, "a");
  // Only the one under the stretched widget is pushed: its neighbour stays.
  expect(where(widgets)).toEqual({ a: "0,0", b: "6,0", c: "0,10" });
});

test("when a widget is removed, what was under it rises, and nothing is left overlapping", () => {
  const widgets = [widget("b", 0, 8, 12, 8), widget("c", 0, 16, 6, 4), widget("d", 6, 16, 6, 6)];
  settle(widgets, undefined);
  expect(where(widgets)).toEqual({ b: "0,0", c: "0,8", d: "6,8" });
  // The widget that was moved stays where it was put, even with room above it.
  const moved = [widget("a", 0, 5, 6, 4), widget("b", 0, 0, 6, 2)];
  settle(moved, "a");
  expect(where(moved)).toEqual({ a: "0,5", b: "0,0" });
});

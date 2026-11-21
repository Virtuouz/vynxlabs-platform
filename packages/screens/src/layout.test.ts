import type { PageWidget } from "@volvel/manifest";
import { coreRegistry } from "@volvel/widgets-core";
import { expect, test } from "vitest";
import { copyId, duplicated, fit, limitsOf, placed, settle, sizeWords, without } from "./layout.ts";

const widget = (id: string, x: number, y: number, w: number, h: number): PageWidget => ({
  id,
  type: "core/text",
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

test("a size is held to what the definition allows, and a place to the twelve columns", () => {
  const chart = limitsOf(coreRegistry().get("core/chart"));
  expect(chart.min).toEqual({ w: 3, h: 4 });
  // Smaller than the least is the least; wider than the page is held on it.
  expect(fit({ x: 10, y: 2, w: 1, h: 1 }, chart)).toEqual({ x: 9, y: 2, w: 3, h: 4 });
  expect(fit({ x: 0, y: -3, w: 20, h: 60 }, chart)).toEqual({ x: 0, y: 0, w: 12, h: 40 });
  // A type nobody knows may be any size.
  expect(limitsOf(undefined)).toEqual({ min: { w: 1, h: 1 }, max: { w: 12, h: 40 } });
});

test("a move gives new widgets and leaves the old ones as they were", () => {
  const before = [widget("a", 0, 0, 6, 4), widget("b", 0, 4, 6, 4)];
  const after = placed(before, "b", { x: 0, y: 0, w: 6, h: 4 });
  expect(where(after)).toEqual({ a: "0,4", b: "0,0" });
  expect(where(before)).toEqual({ a: "0,0", b: "0,4" });
  expect(where(without(before, "a"))).toEqual({ b: "0,0" });
  expect(before).toHaveLength(2);
});

test("a copy goes under what it copies, with a name no other widget has", () => {
  const original: PageWidget = { ...widget("sales", 0, 0, 6, 4), title: "Sales" };
  const next = widget("below", 0, 4, 6, 4);
  const made = duplicated([original, next], "sales");
  expect(made?.copy.id).toBe("sales_copy");
  expect(made?.copy.title).toBe("Sales copy");
  expect(where(made?.widgets ?? [])).toEqual({ sales: "0,0", below: "0,8", sales_copy: "0,4" });
  expect(copyId("sales", new Set(["sales", "sales_copy"]))).toBe("sales_copy2");
  expect(copyId("sales_copy", new Set(["sales", "sales_copy"]))).toBe("sales_copy2");
  expect(duplicated([original], "nothing")).toBeUndefined();
});

test("the chip says how big a widget is and where", () => {
  expect(sizeWords({ x: 0, y: 2, w: 8, h: 5 })).toBe("8 × 5 · col 1 · row 3");
});

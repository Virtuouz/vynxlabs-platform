import { expect, test } from "vitest";
import { checkDashboard, type DashboardWidget, placeWidgets } from "./dashboard.js";

const visual = { visual: { table: "loans" } };
const widget = (id: string, more: Partial<DashboardWidget> = {}): DashboardWidget => ({
  id,
  type: "table",
  source: visual,
  ...more,
});

/**
 * Phase 19, M4: a widget has a place. A dashboard written before that, as
 * widgets in order with a width each, is laid out in rows as it was drawn.
 */
test("widgets without a place are laid in rows, in order, by their width or their kind's", () => {
  const placed = placeWidgets([
    widget("loans", { type: "figure" }),
    widget("fees", { type: "figure", width: 3 }),
    widget("by-device", { type: "chart", width: 6 }),
    widget("by-month", { type: "pivot", width: 12 }),
    widget("late", { width: 8 }),
    widget("note", { type: "text", width: 4, source: undefined as never }),
  ]);
  expect(placed.map((one) => [one.id, one.at])).toEqual([
    ["loans", { x: 0, y: 0, w: 3, h: 3 }],
    ["fees", { x: 3, y: 0, w: 3, h: 3 }],
    // The row is as tall as the tallest thing in it.
    ["by-device", { x: 6, y: 0, w: 6, h: 7 }],
    ["by-month", { x: 0, y: 7, w: 12, h: 7 }],
    ["late", { x: 0, y: 14, w: 8, h: 7 }],
    ["note", { x: 8, y: 14, w: 4, h: 2 }],
  ]);
  // The width it was read from is not kept beside the place it became.
  expect(placed.every((one) => !("width" in one))).toBe(true);
});

test("a widget with a place keeps it, and the rest go under whatever is placed", () => {
  const at = { x: 6, y: 2, w: 6, h: 5 };
  const placed = placeWidgets([widget("placed", { at }), widget("new", { type: "figure" })]);
  expect(placed[0]?.at).toEqual(at);
  expect(placed[1]?.at).toEqual({ x: 0, y: 7, w: 3, h: 3 });
  // The same widgets give the same places, so a dashboard that is only read does not shift.
  expect(placeWidgets(placed)).toEqual(placed);
});

test("a place that runs past the twelfth column is refused, saying where", () => {
  const issues = checkDashboard({
    version: 2,
    widgets: [widget("wide", { at: { x: 8, y: 0, w: 6, h: 4 } })],
  });
  expect(issues).toEqual([
    {
      path: "/widgets/0/at",
      message: "it starts at column 9 and is 6 wide, which is past the twelfth",
    },
  ]);
  expect(
    checkDashboard({ version: 2, widgets: [widget("fits", { at: { x: 6, y: 0, w: 6, h: 4 } })] }),
  ).toEqual([]);
});

/** Phase 19, M7 and M8: options that only mean something on one kind of widget, or together. */
test("an option on the wrong kind of widget, or without what it needs, is refused where it is", () => {
  const paths = (options: DashboardWidget["options"], type: DashboardWidget["type"] = "chart") =>
    checkDashboard({
      version: 2,
      filters: [{ name: "lent", label: "Lent", type: "date_range" }],
      widgets: [widget("w", { type, options } as Partial<DashboardWidget>)],
    }).map((issue) => issue.path);
  expect(paths({ trend: { by: "lent_on" } })).toEqual(["/widgets/0/options/trend"]);
  expect(paths({ trend: { by: "lent_on" } }, "figure")).toEqual([]);
  expect(paths({ compare: true })).toEqual(["/widgets/0/options/compare"]);
  expect(paths({ compare: true, compareTo: "lent" })).toEqual([]);
  expect(paths({ mark: "heatmap", x: "hour" })).toEqual(["/widgets/0/options"]);
  expect(paths({ mark: "heatmap", x: "hour", y: "weekday", value: "loans" })).toEqual([]);
  expect(paths({ cells: [{ column: "fee", as: "bar" }] })).toEqual(["/widgets/0/options/cells"]);
  expect(paths({ cells: [{ column: "fee", as: "bar" }] }, "table")).toEqual([]);
});

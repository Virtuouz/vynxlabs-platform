import { childrenOf, containerHeight, type PageWidget } from "@volvel/manifest";
import { describe, expect, test } from "vitest";
import {
  duplicateWidget,
  fitContainers,
  holds,
  moveInto,
  nextId,
  placesFor,
  removalWords,
  removeTab,
  removeWidget,
  targetOfSelection,
  withoutOrphans,
} from "./screens/builder/containers.ts";

const w = (id: string, type: string, at: PageWidget["at"], rest: Partial<PageWidget> = {}) =>
  ({ id, type, at, ...rest }) as PageWidget;

/** A page: Orders (a Section of three), Views (Tabs, one widget in By status), a loose text. */
const page = (): PageWidget[] => [
  w("orders", "core/section", { x: 0, y: 0, w: 12, h: 2 }, { title: "Orders" }),
  w("o1", "core/stat", { x: 0, y: 0, w: 4, h: 3 }, { in: { widget: "orders" } }),
  w("o2", "core/stat", { x: 4, y: 0, w: 4, h: 3 }, { in: { widget: "orders" } }),
  w("o3", "core/table", { x: 0, y: 3, w: 12, h: 5 }, { in: { widget: "orders" } }),
  w(
    "views",
    "core/tabs",
    { x: 0, y: 9, w: 12, h: 2 },
    {
      title: "Views",
      config: {
        tabs: [
          { id: "status", title: "By status" },
          { id: "reason", title: "By reason" },
        ],
      },
    },
  ),
  w("v1", "core/chart", { x: 0, y: 0, w: 6, h: 4 }, { in: { widget: "views", tab: "status" } }),
  w("note", "core/text", { x: 0, y: 12, w: 6, h: 3 }),
];
const byId = (widgets: readonly PageWidget[], id: string) =>
  widgets.find((one) => one.id === id) as PageWidget;

describe("containers in the builder", () => {
  test("a container is as tall as what it holds, and what lay under it moves out of the way", () => {
    const fitted = fitContainers(page());
    expect(byId(fitted, "orders").at.h).toBe(9);
    expect(byId(fitted, "views").at.h).toBe(containerHeight(byId(fitted, "views"), fitted));
    expect(byId(fitted, "note").at.y).toBeGreaterThanOrEqual(
      byId(fitted, "views").at.y + byId(fitted, "views").at.h,
    );
    // Children are left where they are, and the input is not changed.
    expect(byId(fitted, "o3").at).toEqual({ x: 0, y: 3, w: 12, h: 5 });
    expect(byId(page(), "orders").at.h).toBe(2);
  });

  test("a widget is moved to the bottom of a Section's grid, or a tab's, keeping its width", () => {
    const into = moveInto(fitContainers(page()), "note", { widget: "orders" });
    expect(into.moved).toBe(true);
    expect(byId(into.widgets, "note")).toMatchObject({
      in: { widget: "orders" },
      at: { x: 0, y: 8, w: 6, h: 3 },
    });
    // The Section grew by what it was given.
    expect(byId(into.widgets, "orders").at.h).toBe(12);

    const tab = moveInto(fitContainers(page()), "o1", { widget: "views", tab: "reason" });
    expect(byId(tab.widgets, "o1")).toMatchObject({
      in: { widget: "views", tab: "reason" },
      at: { x: 0, y: 0, w: 4 },
    });
    // A Tabs without a named tab means its first.
    const first = moveInto(page(), "note", { widget: "views" });
    expect(byId(first.widgets, "note").in).toEqual({ widget: "views", tab: "status" });
    expect(byId(first.widgets, "note").at.y).toBe(4);
  });

  test("a widget is moved out to the end of the page; what it left rises", () => {
    const out = moveInto(fitContainers(page()), "o3", undefined);
    expect(out.moved).toBe(true);
    expect(byId(out.widgets, "o3").in).toBeUndefined();
    expect(byId(out.widgets, "o3").at.y).toBeGreaterThanOrEqual(12);
    expect(byId(out.widgets, "orders").at.h).toBe(4);
  });

  test("a width wider than the grid is clamped, and a container is never put in a container", () => {
    const narrow = [...page(), w("big", "core/table", { x: 0, y: 20, w: 20, h: 4 })];
    const wide = moveInto(narrow, "big", { widget: "orders" });
    expect(byId(wide.widgets, "big").at.w).toBe(12);

    const refused = moveInto(page(), "views", { widget: "orders" });
    expect(refused.moved).toBe(false);
    expect(refused.reason).toMatch(/can't go inside another/);
    expect(refused.widgets).toEqual(page());
    expect(moveInto(page(), "orders", { widget: "orders" }).moved).toBe(false);
    expect(moveInto(page(), "o1", { widget: "orders" }).reason).toMatch(/already in Orders/);
    expect(moveInto(page(), "o1", { widget: "views", tab: "nope" }).moved).toBe(false);
  });

  test("a container is duplicated with all it holds: new ids, the copy's children pointing at it, below", () => {
    const copy = duplicateWidget(fitContainers(page()), "orders");
    expect(copy.id).toBe("section");
    expect(copy.count).toBe(4);
    const ids = copy.widgets.map((one) => one.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(copy.widgets).toHaveLength(page().length + 4);
    expect(byId(copy.widgets, "section").title).toBe("Orders copy");
    expect(byId(copy.widgets, "section").at.y).toBeGreaterThanOrEqual(9);
    expect(childrenOf(copy.widgets, "section")).toHaveLength(3);
    expect(childrenOf(copy.widgets, "orders")).toHaveLength(3);
    // The copy's tabs keep their ids.
    const tabs = duplicateWidget(page(), "views");
    expect(childrenOf(tabs.widgets, tabs.id ?? "", "status")).toHaveLength(1);
    // A child is copied on its container's grid.
    const child = duplicateWidget(fitContainers(page()), "o1");
    expect(byId(child.widgets, "stat").in).toEqual({ widget: "orders" });
    expect(childrenOf(child.widgets, "orders")).toHaveLength(4);
  });

  test("a container is removed with all it holds, and says what went", () => {
    const gone = removeWidget(fitContainers(page()), "orders");
    expect(gone.removed.map((one) => one.id)).toEqual(["orders", "o1", "o2", "o3"]);
    expect(gone.widgets.map((one) => one.id)).toEqual(["views", "v1", "note"]);
    expect(byId(gone.widgets, "views").at.y).toBe(0);
    expect(removalWords(gone.removed)).toBe("“Orders” and the 3 widgets in it");
    expect(removalWords(removeWidget(page(), "o1").removed)).toBe("the stat");
    expect(removeWidget(page(), "nothing").removed).toEqual([]);
  });

  test("a widget whose container the canvas took away goes with it", () => {
    const next = page().filter((one) => one.id !== "orders");
    const { widgets, orphans } = withoutOrphans(next);
    expect(orphans.map((one) => one.id)).toEqual(["o1", "o2", "o3"]);
    expect(widgets.map((one) => one.id)).toEqual(["views", "v1", "note"]);
  });

  test("a tab taken out gives its widgets to the tab beside it, or takes them with it", () => {
    const base = moveInto(page(), "o1", { widget: "views", tab: "reason" }).widgets;
    const gave = removeTab(base, "views", "reason");
    expect(gave.what).toBe("moved");
    expect(gave.to).toBe("status");
    expect(gave.words).toBe("Removed the tab “By reason”. The widget in it went to “By status”.");
    expect(byId(gave.widgets, "o1").in).toEqual({ widget: "views", tab: "status" });
    expect(byId(gave.widgets, "o1").at.y).toBe(4);
    expect(byId(gave.widgets, "views").config?.tabs).toEqual([
      { id: "status", title: "By status" },
    ]);

    const took = removeTab(base, "views", "reason", null);
    expect(took.what).toBe("removed");
    expect(took.widgets.some((one) => one.id === "o1")).toBe(false);
    expect(took.words).toMatch(/and the widget in it/);

    // The only tab left can't be taken.
    const last = removeTab(gave.widgets, "views", "status");
    expect(last.what).toBe("refused");
    expect(last.widgets).toEqual(gave.widgets);
  });

  test("ids are unique across the whole page, children included", () => {
    expect(nextId("core/stat", page())).toBe("stat");
    expect(nextId("core/section", page())).toBe("section");
    expect(nextId("core/text", page(), [{ id: "text" }])).toBe("text-2");
  });

  test("where a widget can go: not where it is; a container only to the page", () => {
    const labels = (id: string) => placesFor(page(), id).map((one) => one.label);
    expect(labels("note")).toEqual(["Orders", "Views › By status", "Views › By reason"]);
    expect(labels("o1")).toEqual(["The page", "Views › By status", "Views › By reason"]);
    expect(labels("v1")).toEqual(["The page", "Orders", "Views › By reason"]);
    expect(labels("orders")).toEqual([]);
  });

  test("the chosen container, or the one holding what is chosen, is where a new widget goes", () => {
    expect(targetOfSelection(page(), "orders")).toEqual({ widget: "orders" });
    expect(targetOfSelection(page(), "views")).toEqual({ widget: "views", tab: "status" });
    expect(targetOfSelection(page(), "o2")).toEqual({ widget: "orders" });
    expect(targetOfSelection(page(), "note")).toBeUndefined();
    expect(targetOfSelection(page(), undefined)).toBeUndefined();
  });

  test("a container's header says what it holds", () => {
    expect(holds(page(), byId(page(), "orders"))).toBe("holds 3 widgets");
    expect(holds(page(), byId(page(), "views"))).toBe("holds 1 widget in 2 tabs");
    expect(holds(page(), byId(page(), "note"))).toBeUndefined();
  });
});

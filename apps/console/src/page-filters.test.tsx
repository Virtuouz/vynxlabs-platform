// @vitest-environment happy-dom

import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { filtersOf, type PageWidget } from "@volvel/manifest";
import type { WidgetDefinition } from "@volvel/widgets";
import { chart, filter, list, section, stat, table, tabs } from "@volvel/widgets-core";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Inspector } from "./kit/inspector/Inspector.tsx";
import {
  bindFilter,
  type Catalog,
  insertFilterWidget,
  searchColumns,
} from "./kit/inspector/model.ts";
import { removeTab } from "./screens/builder/containers.ts";
import { show } from "./testing.tsx";

const catalog: Catalog = {
  tables: [
    {
      name: "invoices",
      columns: [
        { name: "number", type: "text", references: null },
        { name: "client", type: "text", references: null },
        { name: "note", type: "text", references: null },
        { name: "total", type: "number", references: null },
        { name: "status", type: "enum", references: null },
        { name: "issued_at", type: "timestamp", references: null },
      ],
    },
  ],
  queries: [],
  maySql: false,
};

const visual = (extra: object = {}) => ({ source: { visual: { table: "invoices", ...extra } } });

const holder = (filters: object[]): PageWidget => ({
  id: "bar",
  type: "core/filter",
  at: { x: 0, y: 0, w: 12, h: 2 },
  config: { filters, reset: true },
});

/** A page: a table and a list that show columns, a stat and a chart that read the table. */
const page = (filters: object[] = [{ name: "status", label: "Status", type: "choice" }]) =>
  [
    holder(filters),
    {
      id: "invoices",
      type: "core/table",
      at: { x: 0, y: 2, w: 12, h: 8 },
      config: {
        columns: [
          { column: "number" },
          { column: "client" },
          { column: "note", hidden: true },
          { column: "total" },
        ],
      },
      data: { rows: visual() },
    },
    {
      id: "cards",
      type: "core/list",
      at: { x: 0, y: 10, w: 12, h: 6 },
      config: { title: "number", subtitle: "client" },
      data: { rows: visual() },
    },
    {
      id: "owed",
      type: "core/stat",
      at: { x: 0, y: 16, w: 3, h: 3 },
      data: { value: visual({ measures: [{ fn: "count", as: "count" }] }) },
    },
    {
      id: "by-week",
      type: "core/chart",
      at: { x: 3, y: 16, w: 6, h: 6 },
      data: {
        rows: visual({
          measures: [{ fn: "count", as: "count" }],
          groupBy: [{ column: "issued_at", bucket: "week" }],
        }),
      },
    },
  ] as PageWidget[];

const definitions: Record<string, WidgetDefinition> = {
  "core/filter": filter,
  "core/tabs": tabs,
  "core/section": section,
  "core/table": table,
  "core/list": list,
  "core/stat": stat,
  "core/chart": chart,
};

/** The inspector of one widget of a page that is kept, as the editor keeps it; `now` is the page. */
let now: PageWidget[] = [];
let undone = 0;
function Harness({ start, open }: { start: PageWidget[]; open: string }) {
  const [widgets, setWidgets] = useState(start);
  now = widgets;
  const widget = widgets.find((one) => one.id === open) as PageWidget;
  return (
    <Inspector
      widget={widget}
      definition={definitions[widget.type]}
      surface="app"
      filters={filtersOf(widgets)}
      neighbours={widgets.filter((one) => one.id !== open)}
      widgets={widgets}
      onChangeWidgets={setWidgets}
      onChange={(next) => setWidgets(widgets.map((one) => (one.id === next.id ? next : one)))}
      onUndo={() => {
        undone += 1;
      }}
      onRemoveTab={(tab, fate) =>
        setWidgets(removeTab(widgets, open, tab, "move" in fate ? fate.move : null).widgets)
      }
      onDuplicate={() => {}}
      onRemove={() => {}}
      catalog={catalog}
    />
  );
}

const byId = (id: string) => now.find((one) => one.id === id) as PageWidget;
const bindings = (id: string, input = "rows") => byId(id).data?.[input]?.filters;
const filtersHeld = () => (byId("bar").config?.filters ?? []) as { name: string; label?: string }[];

beforeEach(() => {
  undone = 0;
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 404 }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("adding a search binds the page's table and list to the text columns they show", () => {
  show(<Harness start={page()} open="bar" />);
  fireEvent.click(screen.getByRole("button", { name: "Add a search" }));
  const added = filtersHeld().at(-1);
  expect(added).toMatchObject({
    name: "search_invoices",
    label: "Search invoices",
    type: "search",
  });
  // The table's configured text columns, less the hidden one; the list's heading and line under it.
  expect(bindings("invoices")).toEqual([
    { filter: "search_invoices", columns: ["number", "client"] },
  ]);
  expect(bindings("cards")).toEqual([{ filter: "search_invoices", columns: ["number", "client"] }]);
  // A stat and a chart show no columns: the table's display column.
  expect(bindings("owed", "value")).toEqual([{ filter: "search_invoices", columns: ["number"] }]);
  expect(bindings("by-week")).toEqual([{ filter: "search_invoices", columns: ["number"] }]);
  // The list is on the page's filters now, and its Data tab can follow or not.
  expect(searchColumns(byId("invoices"), "invoices", catalog)).toEqual(["number", "client"]);
});

test("a filter by a date column binds the stat and chart that have it, as a range of dates", async () => {
  show(<Harness start={page()} open="bar" />);
  fireEvent.click(screen.getByRole("button", { name: "Add a filter by a column" }));
  const dialog = within(await screen.findByRole("dialog"));
  // The columns offered are those the page's widgets read; a timestamp is the first choice.
  expect((dialog.getByLabelText("Column") as HTMLSelectElement).value).toBe("issued_at");
  expect(dialog.getByText("Readers pick a range of dates.")).toBeTruthy();
  fireEvent.click(dialog.getByRole("button", { name: "Add the filter" }));
  expect(filtersOf(now).at(-1)).toEqual({
    name: "issued_at",
    label: "Issued",
    type: "date_range",
    default: "last_30_days",
  });
  for (const [id, input] of [
    ["owed", "value"],
    ["by-week", "rows"],
    ["invoices", "rows"],
  ] as const) {
    expect(bindings(id, input)).toContainEqual({ filter: "issued_at", column: "issued_at" });
  }
});

test("a filter by a column follows the column's type: a kind of thing is one of a list, a number is a number", async () => {
  show(<Harness start={page([{ name: "search", type: "search" }])} open="bar" />);
  fireEvent.click(screen.getByRole("button", { name: "Add a filter by a column" }));
  let dialog = within(await screen.findByRole("dialog"));
  fireEvent.change(dialog.getByLabelText("Column"), { target: { value: "status" } });
  fireEvent.click(dialog.getByRole("button", { name: "Add the filter" }));
  expect(filtersOf(now).at(-1)).toEqual({
    name: "status",
    label: "Status",
    type: "choice",
    from: { table: "invoices", column: "status" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add a filter by a column" }));
  dialog = within(await screen.findByRole("dialog"));
  fireEvent.change(dialog.getByLabelText("Column"), { target: { value: "total" } });
  fireEvent.click(dialog.getByRole("button", { name: "Add the filter" }));
  expect(filtersOf(now).at(-1)).toMatchObject({ name: "total", type: "number" });
});

test("removing a filter takes it off everything that followed it, and offers Undo", async () => {
  show(<Harness start={page([{ name: "status", label: "Status", type: "choice" }])} open="bar" />);
  fireEvent.click(screen.getByRole("button", { name: "Add a search" }));
  expect(bindings("invoices")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Remove Search invoices" }));
  expect(filtersHeld().map((one) => one.name)).toEqual(["status"]);
  for (const [id, input] of [
    ["invoices", "rows"],
    ["cards", "rows"],
    ["owed", "value"],
    ["by-week", "rows"],
  ] as const) {
    expect(bindings(id, input)).toBeUndefined();
  }
  fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
  expect(undone).toBe(1);
  // The last filter of a widget is not removed: the widget is.
  expect(
    (screen.getByRole("button", { name: "Remove Status" }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

test("renaming a filter changes its label and never its name, so what follows it keeps following", () => {
  show(<Harness start={page([{ name: "search", label: "Search", type: "search" }])} open="bar" />);
  fireEvent.click(screen.getByRole("button", { name: "Add a search" }));
  const before = structuredClone(byId("invoices").data);
  fireEvent.change(screen.getAllByLabelText("Called")[1] as HTMLElement, {
    target: { value: "Find an invoice" },
  });
  expect(filtersHeld().map((one) => [one.name, one.label])).toEqual([
    ["search", "Search"],
    ["search_invoices", "Find an invoice"],
  ]);
  expect(byId("invoices").data).toEqual(before);
});

test("filters are moved up and down, and keep their names", () => {
  show(
    <Harness
      start={page([
        { name: "a", label: "First", type: "text" },
        { name: "b", label: "Second", type: "text" },
      ])}
      open="bar"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Move Second up" }));
  expect(filtersHeld().map((one) => one.name)).toEqual(["b", "a"]);
});

test("a data widget's Data tab lists each page filter by its label, and a search says which columns it looks in", async () => {
  const widgets = bindWith(page([{ name: "status", label: "Status", type: "choice" }]));
  show(<Harness start={widgets} open="invoices" />);
  const panel = within(screen.getByRole("tabpanel"));
  expect(panel.getByText("Follows the page filters")).toBeTruthy();
  expect((panel.getByLabelText("Search invoices") as HTMLInputElement).checked).toBe(true);
  expect((panel.getByLabelText("Status") as HTMLInputElement).checked).toBe(false);
  // Following is a switch.
  fireEvent.click(panel.getByLabelText("Status"));
  expect(bindings("invoices")).toContainEqual({ filter: "status", column: "status" });
  fireEvent.click(panel.getByLabelText("Search invoices"));
  expect(bindings("invoices")?.map((one) => one.filter)).toEqual(["status"]);
  fireEvent.click(panel.getByLabelText("Search invoices"));
  expect(bindings("invoices")).toContainEqual({
    filter: "search_invoices",
    columns: ["number", "client"],
  });
  expect(panel.getByText("Columns Search invoices looks in")).toBeTruthy();
});

/** The page with a search of its own added, as the control does. */
function bindWith(widgets: PageWidget[]): PageWidget[] {
  const search = { name: "search_invoices", label: "Search invoices", type: "search" as const };
  return widgets.map((one) =>
    one.id === "bar"
      ? {
          ...one,
          config: {
            ...one.config,
            filters: [...((one.config?.filters ?? []) as object[]), search],
          },
        }
      : bindFilter(one, search, catalog),
  );
}

test("a data widget on a page with no Search and filter offers to add one", () => {
  const widgets = page().filter((one) => one.id !== "bar");
  let added = 0;
  const only = widgets.find((one) => one.id === "owed") as PageWidget;
  show(
    <Inspector
      widget={only}
      definition={stat}
      surface="app"
      filters={[]}
      catalog={catalog}
      onChange={() => {}}
      onDuplicate={() => {}}
      onRemove={() => {}}
      onAddFilters={() => {
        added += 1;
      }}
    />,
  );
  expect(screen.getByText("Add Search and filter to let people narrow this page.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Add Search and filter" }));
  expect(added).toBe(1);
});

test("a Search and filter is added at the top with the page moved down and what follows its search bound", () => {
  const made = insertFilterWidget(
    page().filter((one) => one.id !== "bar"),
    filter,
    undefined,
    catalog,
  );
  expect(made.widgets[0]).toMatchObject({ id: "filter", type: "core/filter", at: { x: 0, y: 0 } });
  expect(made.widgets.find((one) => one.id === "invoices")?.at.y).toBe(2 + 2);
  expect(made.widgets.find((one) => one.id === "invoices")?.data?.rows?.filters).toEqual([
    { filter: "search", columns: ["number", "client"] },
  ]);
});

test("a Search and filter's Display tab offers Clear", () => {
  show(<Harness start={page()} open="bar" />);
  fireEvent.click(screen.getByRole("tab", { name: "Display" }));
  expect((screen.getByLabelText("Offer “Clear”") as HTMLInputElement).checked).toBe(true);
});

// ----- Tabs -----

const withTabs = (): PageWidget[] => [
  {
    id: "views",
    type: "core/tabs",
    at: { x: 0, y: 0, w: 12, h: 8 },
    config: {
      tabs: [
        { id: "first", title: "First" },
        { id: "second", title: "Second" },
      ],
    },
  },
  {
    id: "a",
    type: "core/stat",
    at: { x: 0, y: 0, w: 3, h: 3 },
    in: { widget: "views", tab: "first" },
  },
  {
    id: "b",
    type: "core/stat",
    at: { x: 3, y: 0, w: 3, h: 3 },
    in: { widget: "views", tab: "second" },
  },
];
const tabsHeld = () => (byId("views").config?.tabs ?? []) as { id: string; title: string }[];

test("tabs are added with an id made from the title, renamed without changing it, and moved", () => {
  show(<Harness start={withTabs()} open="views" />);
  fireEvent.click(screen.getByRole("tab", { name: "Display" }));
  fireEvent.click(screen.getByRole("button", { name: "Add a tab" }));
  expect(tabsHeld().at(-1)).toEqual({ id: "tab-3", title: "Tab 3" });
  fireEvent.change(screen.getByLabelText("Tab name", { selector: "[name$=first-title]" }), {
    target: { value: "By status" },
  });
  expect(tabsHeld()[0]).toEqual({ id: "first", title: "By status" });
  // Cleared while it is typed over: kept as it was until something is there.
  fireEvent.change(screen.getByDisplayValue("By status"), { target: { value: "" } });
  expect(tabsHeld()[0]?.title).toBe("By status");
  fireEvent.click(screen.getByRole("button", { name: "Move Second up" }));
  expect(tabsHeld().map((one) => one.id)).toEqual(["second", "first", "tab-3"]);
  // From the keyboard, in the name.
  fireEvent.keyDown(screen.getByDisplayValue("Tab 3"), { key: "ArrowUp", altKey: true });
  expect(tabsHeld().map((one) => one.id)).toEqual(["second", "tab-3", "first"]);
});

test("removing a tab that holds nothing removes it; one that holds widgets asks what to do with them", async () => {
  show(<Harness start={withTabs()} open="views" />);
  fireEvent.click(screen.getByRole("tab", { name: "Display" }));
  fireEvent.click(screen.getByRole("button", { name: "Add a tab" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove the tab Tab 3" }));
  expect(tabsHeld().map((one) => one.id)).toEqual(["first", "second"]);

  // It holds a widget: nothing is removed until it is said where the widget goes.
  fireEvent.click(screen.getByRole("button", { name: "Remove the tab First" }));
  const dialog = within(await screen.findByRole("dialog"));
  expect(dialog.getByText("It holds 1 widget. What should become of it?")).toBeTruthy();
  expect(tabsHeld()).toHaveLength(2);
  fireEvent.click(dialog.getByRole("button", { name: "Move them and remove the tab" }));
  await waitFor(() => expect(tabsHeld().map((one) => one.id)).toEqual(["second"]));
  expect(byId("a").in).toEqual({ widget: "views", tab: "second" });
  // Beside what was there (its columns are free), as the grid settles: never over it.
  const [one, two] = [byId("a").at, byId("b").at];
  const apart =
    one.x + one.w <= two.x ||
    two.x + two.w <= one.x ||
    one.y + one.h <= two.y ||
    two.y + two.h <= one.y;
  expect(apart).toBe(true);
});

test("a tab removed with what it held takes the widgets with it", () => {
  const next = removeTab(withTabs(), "views", "first", null).widgets;
  expect(next.map((one) => one.id)).toEqual(["views", "b"]);
  expect(((next[0]?.config?.tabs ?? []) as unknown[]).length).toBe(1);
  // The last tab is never removed.
  expect(removeTab(next, "views", "second", null).what).toBe("refused");
});

test("the last tab cannot be removed", () => {
  show(
    <Harness
      start={[
        { ...withTabs()[0], config: { tabs: [{ id: "only", title: "Only" }] } } as PageWidget,
      ]}
      open="views"
    />,
  );
  fireEvent.click(screen.getByRole("tab", { name: "Display" }));
  expect(
    (screen.getByRole("button", { name: "Remove the tab Only" }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

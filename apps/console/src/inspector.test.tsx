// @vitest-environment happy-dom

import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { PageFilter, PageWidget } from "@volvel/manifest";
import { defineWidget, type WidgetDefinition } from "@volvel/widgets";
import { chart, stat, text } from "@volvel/widgets-core";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Inspector } from "./kit/inspector/Inspector.tsx";
import {
  bindFilter,
  type Catalog,
  clampPlace,
  settleOnGrid,
  tabsOf,
  withoutWidget,
} from "./kit/inspector/model.ts";
import { show } from "./testing.tsx";

const catalog: Catalog = {
  tables: [
    {
      name: "invoices",
      columns: [
        { name: "number", type: "text", references: null },
        { name: "total", type: "number", references: null },
        { name: "status", type: "enum", references: null },
        { name: "issued_at", type: "timestamp", references: null },
      ],
    },
  ],
  queries: [],
  maySql: false,
};

const place = { x: 0, y: 0, w: 6, h: 6 };
/** The visual query of a widget's `rows` input. */
const queryOf = (widget: PageWidget | undefined) => {
  const source = widget?.data?.rows?.source;
  if (!source || !("visual" in source)) throw new Error("it reads no table");
  return source.visual;
};
const chartWidget = (): PageWidget => ({
  id: "by-week",
  type: "core/chart",
  title: "Invoiced by week",
  at: place,
  config: { mark: "bar", legend: "auto" },
  data: {
    rows: {
      source: {
        visual: {
          table: "invoices",
          measures: [{ fn: "count", as: "count" }],
          groupBy: [{ column: "issued_at", bucket: "week" }],
        },
      },
    },
  },
});

/** The inspector around a widget that is kept, as the editor keeps one. */
let written: PageWidget[];
function Harness({
  start,
  definition,
  surface = "app",
  filters = [],
}: {
  start: PageWidget;
  definition: WidgetDefinition | undefined;
  surface?: "app" | "dashboard";
  filters?: PageFilter[];
}) {
  const [widget, setWidget] = useState(start);
  return (
    <Inspector
      widget={widget}
      definition={definition}
      surface={surface}
      filters={filters}
      catalog={catalog}
      onChange={(next) => {
        written.push(next);
        setWidget(next);
      }}
      onDuplicate={() => {}}
      onRemove={() => {}}
      rowRules={(table) => `/t/t/workspaces/w/tables/${table}?view=definition`}
    />
  );
}

beforeEach(() => {
  written = [];
  // The catalog is given; nothing here reads the workspace.
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 404 }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("the chart's Data tab is drawn as Source, Value, Break down by, Only include and More data options", () => {
  show(<Harness start={chartWidget()} definition={chart} />);
  const tabs = screen.getAllByRole("tab").map((tab) => tab.textContent);
  expect(tabs).toEqual(["Data", "Display", "Actions", "Rules"]);
  const panel = within(screen.getByRole("tabpanel"));
  // In the order the definition gives.
  const order = ["Source", "Value", "Break down by", "Only include"].map(
    (name) => panel.getAllByText(name, { exact: false })[0],
  );
  expect(order.every(Boolean)).toBe(true);
  const text = screen.getByRole("tabpanel").textContent ?? "";
  const at = (name: string) => text.indexOf(name);
  expect(at("Source")).toBeLessThan(at("Value"));
  expect(at("Value")).toBeLessThan(at("Break down by"));
  expect(at("Break down by")).toBeLessThan(at("Only include"));
  expect(at("Only include")).toBeLessThan(at("More data options"));
  // The disclosure says what is in it, and goes no deeper.
  expect(panel.getByText(/More data options/)).toBeTruthy();
  expect(panel.getByText(/Sorted by, at most/)).toBeTruthy();
  // The source is the table the widget reads, and says it follows no page filter yet.
  expect((panel.getByRole("combobox", { name: "Source" }) as HTMLInputElement).value).toBe(
    "Invoices",
  );
});

test("choosing Sum of Total as the value writes the first measure", () => {
  show(<Harness start={chartWidget()} definition={chart} />);
  fireEvent.change(screen.getByLabelText("What value 1 works out"), { target: { value: "sum" } });
  const last = written.at(-1) as PageWidget;
  // A sum is of a number: the first one the table has is chosen, and the value is named for what it is.
  expect(queryOf(last).measures?.[0]).toEqual({ fn: "sum", column: "total", as: "sum_total" });
  expect(screen.getByLabelText("Column value 1 is of")).toBeTruthy();
  // The breakdown is left as it was.
  expect(queryOf(last).groupBy).toEqual([{ column: "issued_at", bucket: "week" }]);
});

test("a widget that named the value by its old name names it by the new one", () => {
  const start = chartWidget();
  start.config = { ...start.config, y: "count" };
  show(<Harness start={start} definition={chart} />);
  fireEvent.change(screen.getByLabelText("What value 1 works out"), { target: { value: "sum" } });
  expect((written.at(-1) as PageWidget).config?.y).toBe("sum_total");
});

test("a condition is added as a sentence of column, test and value", () => {
  show(<Harness start={chartWidget()} definition={chart} />);
  fireEvent.click(screen.getByRole("button", { name: "Add a condition" }));
  fireEvent.change(screen.getByLabelText("Test of condition 1"), { target: { value: "ne" } });
  fireEvent.change(screen.getByLabelText("Value of condition 1"), { target: { value: "paid" } });
  expect(queryOf(written.at(-1)).filters).toEqual([{ column: "status", op: "ne", value: "paid" }]);
});

test("a setting that depends on another is shown only while it holds", () => {
  show(<Harness start={chartWidget()} definition={chart} />);
  fireEvent.click(screen.getByRole("tab", { name: "Display" }));
  // The chart is bars: they may lie down.
  expect(screen.getByLabelText("Bars lie down")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("Line"));
  expect(screen.queryByLabelText("Bars lie down")).toBeNull();
  fireEvent.click(screen.getByLabelText("Bar"));
  expect(screen.getByLabelText("Bars lie down")).toBeTruthy();
  expect((written.at(-1) as PageWidget).config?.mark).toBe("bar");
});

test("a tab with nothing in it is hidden", () => {
  const note: PageWidget = { id: "note", type: "core/text", at: { x: 0, y: 0, w: 6, h: 2 } };
  show(<Harness start={note} definition={text} />);
  // A note reads nothing and raises nothing.
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Display", "Rules"]);
  expect(tabsOf(text)).toEqual(["display", "rules"]);
  // Its text is a Markdown editor with a preview.
  fireEvent.change(screen.getByLabelText("Text"), { target: { value: "# Hello" } });
  expect(written.at(-1)?.config?.text).toBe("# Hello");
  expect(screen.getByLabelText("Preview of the text")).toBeTruthy();
});

test("a widget from a pack no code here knows is drawn from its definition", () => {
  const labs = defineWidget({
    type: "labs/x",
    version: "0.1.0",
    title: "Gauge",
    description: "A dial",
    category: "understand",
    icon: "gauge",
    surfaces: ["app", "dashboard"],
    data: {},
    config: {
      type: "object",
      properties: {
        size: {
          type: "integer",
          minimum: 1,
          maximum: 9,
          "x-volvel": { tab: "display", control: "number", label: "Size", order: 1 },
        },
        loud: {
          type: "boolean",
          "x-volvel": { tab: "display", control: "switch", label: "Loud", order: 2 },
        },
        shade: {
          enum: ["warm", "cool"],
          "x-volvel": {
            tab: "display",
            control: "segmented",
            label: "Shade",
            choices: { warm: "Warm", cool: "Cool" },
            when: { loud: true },
            order: 3,
          },
        },
      },
    },
    events: { tap: { gives: "nothing", label: "When it is tapped" } },
    layout: { min: { w: 2, h: 2 }, default: { w: 3, h: 3 } },
  });
  show(
    <Harness
      start={{ id: "g", type: "labs/x", at: { x: 0, y: 0, w: 3, h: 3 } }}
      definition={labs}
    />,
  );
  // The pack is named beside its kind.
  expect(screen.getByText("Gauge · Labs pack")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Size"), { target: { value: "5" } });
  expect(written.at(-1)?.config?.size).toBe(5);
  expect(screen.queryByLabelText("Warm")).toBeNull();
  fireEvent.click(screen.getByLabelText("Loud"));
  expect(written.at(-1)?.config?.loud).toBe(true);
  expect(screen.getByLabelText("Warm")).toBeTruthy();
  // Its event is listed in Actions, read only.
  fireEvent.click(screen.getByRole("tab", { name: "Actions" }));
  expect(screen.getByText("When it is tapped")).toBeTruthy();
});

test("a widget no pack declares is said so, and can be removed", () => {
  show(
    <Harness
      start={{ id: "g", type: "labs/gone", at: { x: 0, y: 0, w: 3, h: 3 } }}
      definition={undefined}
    />,
  );
  expect(screen.getByText(/There is no widget called “labs\/gone”/)).toBeTruthy();
  expect(screen.getByRole("button", { name: /Remove it/ })).toBeTruthy();
});

test("Rules says who sees it and where the row rules are, and that hiding is not security", () => {
  show(<Harness start={chartWidget()} definition={chart} />);
  fireEvent.click(screen.getByRole("tab", { name: "Rules" }));
  expect(screen.getByText("Always")).toBeTruthy();
  expect(screen.getByText("Everyone who can open the app")).toBeTruthy();
  expect(screen.getByText(/Hiding a widget isn’t security/)).toBeTruthy();
  const link = screen.getByRole("link", { name: "Open row rules" });
  expect(link.getAttribute("href")).toBe("/t/t/workspaces/w/tables/invoices?view=definition");
});

test("Layout gives the exact column, row, width and height, held to what the widget allows", async () => {
  show(<Harness start={chartWidget()} definition={chart} />);
  fireEvent.click(screen.getByRole("button", { name: "More about Invoiced by week" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: /Layout/ }));
  expect(screen.getByRole("button", { name: /Back to settings/ })).toBeTruthy();
  // A chart is at least 3 wide: a width of 1 is held at 3. At column 11 a width of 6 would run off.
  fireEvent.change(screen.getByLabelText("Width"), { target: { value: "1" } });
  expect(written.at(-1)?.at.w).toBe(3);
  fireEvent.change(screen.getByLabelText("Column"), { target: { value: "12" } });
  expect(written.at(-1)?.at).toMatchObject({ x: 9, w: 3 });
  fireEvent.click(screen.getByRole("button", { name: /Back to settings/ }));
  await waitFor(() => expect(screen.getByRole("tab", { name: "Data" })).toBeTruthy());
});

test("a stat's money format is said in a line and shown with an example", () => {
  const figure: PageWidget = {
    id: "owed",
    type: "core/stat",
    at: { x: 0, y: 0, w: 3, h: 3 },
    config: { format: { style: "currency", currency: "USD", decimals: 2 } },
  };
  show(<Harness start={figure} definition={stat} />);
  fireEvent.click(screen.getByRole("tab", { name: "Display" }));
  expect(screen.getByText("Money · USD · 2 decimals")).toBeTruthy();
  expect(screen.getByText("Shown as $43,120.00")).toBeTruthy();
});

// ----- What the model does with a page -----

test("a filter is bound to every data input whose table has its column", () => {
  const filter: PageFilter = { name: "issued_at", label: "Issued", type: "date_range" };
  const bound = bindFilter(chartWidget(), filter, catalog);
  expect(bound.data?.rows?.filters).toEqual([{ filter: "issued_at", column: "issued_at" }]);
  // A table without the column is left alone, and an input already bound is not bound twice.
  expect(bindFilter(bound, filter, catalog)).toBe(bound);
  const other = bindFilter(chartWidget(), { name: "no_such", type: "text" }, catalog);
  expect(other.data?.rows?.filters).toBeUndefined();
});

test("a place is held to the definition's sizes and the twelve columns", () => {
  expect(clampPlace(chart, { x: 11, y: 2, w: 6, h: 6 })).toEqual({ x: 6, y: 2, w: 6, h: 6 });
  expect(clampPlace(chart, { x: 0, y: -4, w: 1, h: 99 })).toEqual({ x: 0, y: 0, w: 3, h: 40 });
});

test("what a widget is placed on moves down out of its way, and what is under a removed widget rises", () => {
  const a: PageWidget = { id: "a", type: "core/text", at: { x: 0, y: 0, w: 6, h: 2 } };
  const b: PageWidget = { id: "b", type: "core/text", at: { x: 0, y: 2, w: 6, h: 2 } };
  const c: PageWidget = { id: "c", type: "core/text", at: { x: 0, y: 4, w: 6, h: 2 } };
  const moved = settleOnGrid([a, { ...b, at: { ...b.at, y: 0 } }, c], "b");
  expect(moved.map((one) => [one.id, one.at.y])).toEqual([
    ["a", 2],
    ["b", 0],
    ["c", 4],
  ]);
  expect(withoutWidget([a, b, c], "a").map((one) => [one.id, one.at.y])).toEqual([
    ["b", 0],
    ["c", 2],
  ]);
});

test("a widget added to a page follows its filters as the page's other widgets on that table do", async () => {
  const { bindFilter } = await import("./kit/inspector/model.ts");
  const catalog = {
    tables: [
      {
        path: "loans",
        columns: [
          { name: "lent_on", type: "date" },
          { name: "fee", type: "integer" },
        ],
      },
    ],
    queries: [],
    sql: false,
  } as never;
  const neighbour = {
    id: "fees",
    type: "core/stat",
    at: { x: 0, y: 0, w: 3, h: 3 },
    data: {
      value: {
        source: {
          visual: { table: "loans", measures: [{ fn: "sum", column: "fee", as: "fees" }] },
        },
        filters: [{ filter: "lent", column: "lent_on" }],
      },
    },
  } as never;
  const fresh = {
    id: "pivot",
    type: "core/pivot",
    at: { x: 0, y: 3, w: 6, h: 7 },
    data: {
      rows: { source: { visual: { table: "loans", measures: [{ fn: "count", as: "n" }] } } },
    },
  } as never;
  const lent = { name: "lent", label: "Lent", type: "date_range" } as never;
  // The filter is called "lent" and no column is: the page already says it narrows lent_on.
  expect(bindFilter(fresh, lent, catalog, [neighbour]).data?.rows?.filters).toEqual([
    { filter: "lent", column: "lent_on" },
  ]);
  expect(bindFilter(fresh, lent, catalog).data?.rows?.filters).toBeUndefined();
});

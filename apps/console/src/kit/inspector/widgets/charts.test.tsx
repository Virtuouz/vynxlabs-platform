// @vitest-environment happy-dom

import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { PageFilter, PageWidget } from "@volvel/manifest";
import type { WidgetDefinition } from "@volvel/widgets";
import { chart, pivot, stat } from "@volvel/widgets-core";
import { goal } from "@volvel/widgets-labs";
import { useState } from "react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { show } from "../../../testing.tsx";
import type { Env } from "../controls.tsx";
import { type Catalog, configOf } from "../model.ts";
import { type DrawerData, drawerSections } from "./chartSections.ts";

const catalog: Catalog = {
  tables: [
    {
      name: "invoices",
      columns: [
        { name: "number", type: "text", references: null },
        { name: "clinic", type: "enum", references: null },
        { name: "status", type: "enum", references: null },
        { name: "total", type: "number", references: null },
        { name: "target", type: "number", references: null },
        { name: "issued_at", type: "timestamp", references: null },
      ],
    },
  ],
  queries: [],
  maySql: false,
};
const dateFilter: PageFilter = {
  name: "issued",
  label: "Issued",
  type: "date_range",
  from: { table: "invoices", column: "issued_at" },
};
const place = { x: 0, y: 0, w: 6, h: 6 };

const widgetOf = (
  type: string,
  input: string,
  visual: object,
  config: Record<string, unknown> = {},
): PageWidget => ({
  id: "w",
  type,
  title: "By clinic",
  at: place,
  config,
  data: { [input]: { source: { visual: { table: "invoices", ...visual } } } },
});
const byClinic = (config?: Record<string, unknown>) =>
  widgetOf(
    "core/chart",
    "rows",
    {
      measures: [{ fn: "sum", column: "total", as: "sum_total" }],
      groupBy: [{ column: "clinic" }],
    },
    { mark: "bar", ...config },
  );

let written: PageWidget[];
function Harness({
  start,
  definition,
  tab,
  filters = [],
  data,
}: {
  start: PageWidget;
  definition: WidgetDefinition;
  tab: "data" | "display";
  filters?: PageFilter[];
  data?: DrawerData;
}) {
  const [widget, setWidget] = useState(start);
  const env: Env = {
    definition,
    widget,
    surface: "app",
    filters,
    neighbours: [],
    catalog,
    config: configOf(definition, widget),
    write: (next) => {
      written.push(next);
      setWidget(next);
    },
    pages: [],
    flows: [],
    scripts: [],
    groups: [],
    widgets: [widget],
    writeAll: () => {},
  };
  return (
    <div>
      {drawerSections(definition.type, tab).map((Section, at) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list
        <Section key={at} env={env} {...(data ? { data } : {})} />
      ))}
    </div>
  );
}

const last = () => written.at(-1) as PageWidget;
const visualOf = (widget: PageWidget, input: string) => {
  const source = widget.data?.[input]?.source;
  if (!source || !("visual" in source)) throw new Error("no table");
  return source.visual;
};

beforeEach(() => {
  written = [];
});
afterEach(cleanup);

test("the registry knows the four widgets and nothing else", () => {
  for (const type of ["core/chart", "core/stat", "core/pivot", "labs/goal"]) {
    expect(drawerSections(type, "data")).toHaveLength(1);
    expect(drawerSections(type, "display")).toHaveLength(1);
    expect(drawerSections(type, "rules")).toHaveLength(0);
  }
  expect(drawerSections("core/table", "data")).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// Chart, Data

test("chart data: three questions, how they read, and a small picture of the rows", () => {
  show(
    <Harness start={byClinic()} definition={chart} tab="data" data={{ counts: { clinic: 3 } }} />,
  );
  expect(screen.getByText("What to chart")).toBeTruthy();
  const rows = ["Measure", "For each", "Split into colors"].map((name) =>
    screen.getByRole("button", { name: new RegExp(`^${name}`) }),
  );
  expect(rows[0]?.textContent).toContain("Sum of Total");
  expect(rows[1]?.textContent).toContain("Clinic");
  expect(rows[2]?.textContent).toContain("Nothing");
  const reads = screen.getByTestId("reads-as").textContent ?? "";
  expect(reads).toContain("Reads as the sum of total for each clinic.");
  expect(reads).toContain("Drawn as bars; 3 clinics.");
  expect(screen.getByText(/The chart type is suggested from the answers/)).toBeTruthy();
});

test("the picture is drawn from the real rows when the host has them", () => {
  const summary = {
    shape: "summary" as const,
    columns: [],
    breakdowns: ["clinic"],
    values: ["sum_total"],
    rows: [
      { clinic: "a", sum_total: 10 },
      { clinic: "b", sum_total: 20 },
    ],
  };
  show(<Harness start={byClinic()} definition={chart} tab="data" data={{ summary }} />);
  expect(screen.getByTestId("reads-as").textContent).toContain("2 clinics");
});

test("For each lists the columns that group well first, with how many values each has", async () => {
  show(
    <Harness
      start={byClinic()}
      definition={chart}
      tab="data"
      data={{ counts: { clinic: 3, status: 2, number: 412 } }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /^For each/ }));
  const dialog = await screen.findByRole("dialog");
  const names = within(dialog)
    .getAllByRole("radio")
    .map((radio) => radio.closest("label")?.textContent ?? "");
  // Status (2 values) before Clinic's replacement list: the chosen column is offered too, ordered by its values.
  expect(names[0]).toContain("Status");
  expect(names[0]).toContain("2 values");
  expect(names.findIndex((name) => name.startsWith("Issued at"))).toBeGreaterThan(-1);
  expect(within(dialog).getByText("Good for grouping")).toBeTruthy();
  expect(within(dialog).getByText("Other columns")).toBeTruthy();
  // The number column groups worst: it is among the others, last.
  expect(names.at(-1)).toMatch(/every row|Number|a number/);
});

test("choosing a date for For each cuts it by week, suggests a line, and offers the empty weeks", async () => {
  show(<Harness start={byClinic()} definition={chart} tab="data" />);
  fireEvent.click(screen.getByRole("button", { name: /^For each/ }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("radio", { name: /Issued at/ }));
  expect(visualOf(last(), "rows").groupBy).toEqual([{ column: "issued_at", bucket: "week" }]);
  // Along a date the type is a line, and the result is named for the new breakdown.
  expect(last().config?.mark).toBe("line");
  fireEvent.click(within(await screen.findByRole("dialog")).getByRole("radio", { name: "Month" }));
  expect(visualOf(last(), "rows").groupBy).toEqual([{ column: "issued_at", bucket: "month" }]);
  const gaps = within(await screen.findByRole("dialog")).getByRole("switch", {
    name: "Include months with no invoices",
  });
  fireEvent.click(gaps);
  expect(last().config?.fillGaps).toBe(true);
});

test("Split into colors can be a column or nothing", async () => {
  show(<Harness start={byClinic()} definition={chart} tab="data" />);
  fireEvent.click(screen.getByRole("button", { name: /^Split into colors/ }));
  const dialog = await screen.findByRole("dialog");
  // The column already used for each is not offered to split by.
  expect(within(dialog).queryByRole("radio", { name: /Clinic/ })).toBeNull();
  fireEvent.click(within(dialog).getByRole("radio", { name: /Status/ }));
  expect(visualOf(last(), "rows").groupBy).toEqual([{ column: "clinic" }, { column: "status" }]);
  fireEvent.click(
    within(await screen.findByRole("dialog")).getByRole("radio", { name: "Nothing" }),
  );
  expect(visualOf(last(), "rows").groupBy).toEqual([{ column: "clinic" }]);
});

test("Order and Show at most write the order and the limit", async () => {
  show(
    <Harness start={byClinic()} definition={chart} tab="data" data={{ counts: { clinic: 3 } }} />,
  );
  expect(screen.getByRole("button", { name: /^Show at most/ }).textContent).toContain(
    "All clinics",
  );
  fireEvent.click(screen.getByRole("button", { name: /^Bars in order/ }));
  fireEvent.click(await screen.findByRole("radio", { name: "Biggest first" }));
  expect(last().config?.order).toBe("biggest");
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: /^Show at most/ }));
  fireEvent.change(await screen.findByRole("spinbutton", { name: /Show at most/ }), {
    target: { value: "5" },
  });
  expect(visualOf(last(), "rows").limit).toBe(5);
});

test("a chart over time has no order of bars", () => {
  const over = widgetOf(
    "core/chart",
    "rows",
    {
      measures: [{ fn: "count", as: "count" }],
      groupBy: [{ column: "issued_at", bucket: "week" }],
    },
    { mark: "line" },
  );
  show(<Harness start={over} definition={chart} tab="data" />);
  expect(screen.queryByRole("button", { name: /^Bars in order/ })).toBeNull();
  expect(screen.getByRole("button", { name: /^Show at most/ }).textContent).toContain("All weeks");
});

// ---------------------------------------------------------------------------
// Chart, Display

test("chart types that cannot work with the data are greyed with what they need", () => {
  show(<Harness start={byClinic()} definition={chart} tab="display" />);
  const tile = (name: string) => screen.getByRole("radio", { name: new RegExp(`^${name}( |$)`) });
  expect((tile("Line") as HTMLInputElement).disabled).toBe(true);
  expect(screen.getAllByText("needs a date").length).toBe(2);
  expect((tile("Heatmap") as HTMLInputElement).disabled).toBe(true);
  expect(screen.getByText("needs a split")).toBeTruthy();
  expect((tile("Pie") as HTMLInputElement).disabled).toBe(false);
  expect((tile("Bar") as HTMLInputElement).checked).toBe(true);
  fireEvent.click(tile("Bar, sideways"));
  expect(last().config).toMatchObject({ mark: "bar", horizontal: true });
  fireEvent.click(tile("Pie"));
  expect(last().config?.mark).toBe("pie");
  expect(last().config?.horizontal).toBeUndefined();
});

test("a pie is not for time", () => {
  const over = widgetOf(
    "core/chart",
    "rows",
    {
      measures: [{ fn: "count", as: "count" }],
      groupBy: [{ column: "issued_at", bucket: "week" }],
    },
    { mark: "line" },
  );
  show(<Harness start={over} definition={chart} tab="display" />);
  expect(screen.getByText("not for time")).toBeTruthy();
  expect((screen.getByRole("radio", { name: /^Line/ }) as HTMLInputElement).checked).toBe(true);
});

test("heading: the title and the caption, which is the widget's subtitle", () => {
  show(<Harness start={byClinic()} definition={chart} tab="display" />);
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Invoiced by clinic" } });
  expect(last().title).toBe("Invoiced by clinic");
  fireEvent.change(screen.getByLabelText("Caption"), { target: { value: "Last 30 days" } });
  expect(last().subtitle).toBe("Last 30 days");
  expect(screen.getByText("Also editable by clicking the title on the page.")).toBeTruthy();
});

test("look: show values on bars, axis titles with what they say, and a named palette", async () => {
  show(<Harness start={byClinic()} definition={chart} tab="display" />);
  fireEvent.click(screen.getByRole("switch", { name: "Show values on bars" }));
  expect(last().config?.values).toBe(true);
  expect(screen.getByText("Clinic along the bottom, Total up the side")).toBeTruthy();
  fireEvent.click(screen.getByRole("switch", { name: "Show axis titles" }));
  expect(last().config?.axisTitles).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: /^Colors/ }));
  fireEvent.click(await screen.findByRole("radio", { name: /Warm/ }));
  expect(last().config?.colors).toBe("warm");
});

test("over time, the comparison is written for the page's date filter; a plain chart has none of it", () => {
  const over = widgetOf(
    "core/chart",
    "rows",
    {
      measures: [{ fn: "count", as: "count" }],
      groupBy: [{ column: "issued_at", bucket: "week" }],
    },
    { mark: "line" },
  );
  const { unmount } = show(
    <Harness start={over} definition={chart} tab="display" filters={[dateFilter]} />,
  );
  expect(screen.getByText("Over time")).toBeTruthy();
  fireEvent.click(screen.getByRole("switch", { name: "Compare with the period before" }));
  expect(last().config).toMatchObject({ compare: true, compareTo: "issued" });
  fireEvent.click(screen.getByRole("switch", { name: "Compare with the period before" }));
  expect(last().config?.compare).toBeUndefined();
  expect(last().config?.compareTo).toBeUndefined();
  fireEvent.click(screen.getByRole("switch", { name: "Smooth the line" }));
  expect(last().config?.smooth).toBe(true);
  // A line marks its points unless told not to.
  expect(screen.getByRole("switch", { name: "Mark each point" }).getAttribute("aria-checked")).toBe(
    "true",
  );
  fireEvent.click(screen.getByRole("switch", { name: "Mark each point" }));
  expect(last().config?.points).toBe(false);
  unmount();
  show(<Harness start={byClinic()} definition={chart} tab="display" />);
  expect(screen.queryByText("Over time")).toBeNull();
});

// ---------------------------------------------------------------------------
// Stat

const unpaid = (config?: Record<string, unknown>) =>
  widgetOf(
    "core/stat",
    "value",
    { measures: [{ fn: "sum", column: "total", as: "sum_total" }] },
    { format: { style: "currency" }, ...config },
  );

test("stat data: one value", () => {
  show(<Harness start={unpaid()} definition={stat} tab="data" />);
  expect(screen.getByText("What it shows")).toBeTruthy();
  expect(screen.getByRole("button", { name: /^Value/ }).textContent).toContain("Sum of Total");
});

test("stat display: a preview that follows the comparison, and two choices only when it is on", async () => {
  show(<Harness start={unpaid()} definition={stat} tab="display" filters={[dateFilter]} />);
  const preview = screen.getByRole("group", { name: "Preview" });
  expect(preview.textContent).toContain("$27,257.93");
  expect(screen.queryByRole("radio", { name: "Bad" })).toBeNull();
  expect(preview.textContent).not.toContain("vs the period before");
  fireEvent.click(screen.getByRole("switch", { name: "Compare with the period before" }));
  expect(last().config).toMatchObject({ compare: true, compareTo: "issued" });
  await waitFor(() =>
    expect(screen.getByRole("group", { name: "Preview" }).textContent).toContain(
      "vs the period before",
    ),
  );
  fireEvent.click(screen.getByRole("radio", { name: "Bad" }));
  expect(last().config?.goodWhen).toBe("down");
  expect(
    screen.getByText(/going up is bad, so the arrow is red\. The preview updates/),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "$" }));
  expect(last().config?.delta).toBe("absolute");
  fireEvent.click(screen.getByRole("radio", { name: "%" }));
  expect(last().config?.delta).toBeUndefined();
});

test("stat display: the caption is the stat's own, and numbers have their picker", async () => {
  show(<Harness start={unpaid()} definition={stat} tab="display" />);
  fireEvent.click(screen.getByRole("button", { name: /^Caption/ }));
  fireEvent.change(await screen.findByRole("textbox", { name: "Caption" }), {
    target: { value: "Not yet paid" },
  });
  expect(last().config?.caption).toBe("Not yet paid");
  expect(screen.getByRole("button", { name: /^Numbers/ }).textContent).toContain("Money");
});

// ---------------------------------------------------------------------------
// Goal

const thisMonth = (config?: Record<string, unknown>) =>
  widgetOf(
    "labs/goal",
    "value",
    { measures: [{ fn: "sum", column: "total", as: "sum_total" }] },
    { format: { style: "currency" }, target: 200000, ...config },
  );

test("goal data: a preview, then Value, Goal and Over", () => {
  show(<Harness start={thisMonth()} definition={goal} tab="data" filters={[dateFilter]} />);
  expect(screen.getByRole("group", { name: "Preview" }).textContent).toContain("25.9%");
  expect(screen.getByRole("button", { name: /^Value/ }).textContent).toContain("Sum of Total");
  expect(screen.getByRole("button", { name: /^Goal/ }).textContent).toContain("$200,000");
  expect(screen.getByRole("button", { name: /^Over/ }).textContent).toContain("All time");
});

test("the goal is a fixed amount, or a column of the table", async () => {
  show(<Harness start={thisMonth()} definition={goal} tab="data" />);
  fireEvent.click(screen.getByRole("button", { name: /^Goal/ }));
  fireEvent.change(await screen.findByRole("spinbutton", { name: "Amount" }), {
    target: { value: "300000" },
  });
  expect(last().config?.target).toBe(300000);
  fireEvent.click(
    within(await screen.findByRole("dialog")).getByRole("radio", { name: "From a column" }),
  );
  expect(last().config?.goalFrom).toBe("sum_target");
  expect(visualOf(last(), "value").measures).toEqual([
    { fn: "sum", column: "total", as: "sum_total" },
    { fn: "sum", column: "target", as: "sum_target" },
  ]);
  fireEvent.click(
    within(await screen.findByRole("dialog")).getByRole("radio", { name: "A fixed amount" }),
  );
  expect(last().config?.goalFrom).toBeUndefined();
  expect(visualOf(last(), "value").measures).toEqual([
    { fn: "sum", column: "total", as: "sum_total" },
  ]);
});

test("Over follows one of the page's date filters", async () => {
  show(<Harness start={thisMonth()} definition={goal} tab="data" filters={[dateFilter]} />);
  fireEvent.click(screen.getByRole("button", { name: /^Over/ }));
  fireEvent.click(await screen.findByRole("radio", { name: "Issued" }));
  expect(last().data?.value?.filters).toEqual([{ filter: "issued", column: "issued_at" }]);
  expect(screen.getByRole("button", { name: /^Over/ }).textContent).toContain("The Issued filter");
  fireEvent.click(await screen.findByRole("radio", { name: "All time" }));
  expect(last().data?.value?.filters).toBeUndefined();
});

test("goal display: the percentage, and what the bar does when it is reached", async () => {
  show(<Harness start={thisMonth()} definition={goal} tab="display" />);
  fireEvent.click(screen.getByRole("switch", { name: "Show the percentage" }));
  expect(last().config?.percent).toBe(false);
  expect(screen.getByRole("group", { name: "Preview" }).textContent).not.toContain("25.9%");
  expect(screen.getByRole("button", { name: /^When reached/ }).textContent).toContain(
    "Bar turns green",
  );
  fireEvent.click(screen.getByRole("button", { name: /^When reached/ }));
  fireEvent.click(await screen.findByRole("radio", { name: "Bar stays" }));
  expect(last().config?.reached).toBe("none");
});

// ---------------------------------------------------------------------------
// Pivot

const visits = (config?: Record<string, unknown>) =>
  widgetOf(
    "core/pivot",
    "rows",
    {
      measures: [{ fn: "count", as: "count" }],
      groupBy: [{ column: "clinic" }, { column: "issued_at", bucket: "month" }],
    },
    config,
  );

test("pivot data: Measure, Rows and Columns, and a shaded grid from the data", () => {
  show(<Harness start={visits()} definition={pivot} tab="data" />);
  expect(screen.getByRole("button", { name: /^Measure/ }).textContent).toContain("Count of rows");
  expect(screen.getByRole("button", { name: /^Rows/ }).textContent).toContain("Clinic");
  expect(screen.getByRole("button", { name: /^Columns/ }).textContent).toContain(
    "Issued at · by month",
  );
  const grid = screen.getByRole("img", { name: /A grid of 3 rows and 3 columns/ });
  expect(grid.textContent).toContain("Sep");
  expect(grid.querySelectorAll("span.h-4").length).toBe(9);
});

test("pivot data: the columns can be cut by another period", async () => {
  show(<Harness start={visits()} definition={pivot} tab="data" />);
  fireEvent.click(screen.getByRole("button", { name: /^Columns/ }));
  fireEvent.click(
    within(await screen.findByRole("dialog")).getByRole("radio", { name: "Quarter" }),
  );
  expect(visualOf(last(), "rows").groupBy).toEqual([
    { column: "clinic" },
    { column: "issued_at", bucket: "quarter" },
  ]);
});

test("pivot display: shading and the two totals, shown unless switched off", () => {
  show(<Harness start={visits()} definition={pivot} tab="display" />);
  fireEvent.click(screen.getByRole("switch", { name: "Shade cells by size" }));
  expect(last().config?.shade).toBe(true);
  expect(
    screen.getByRole("switch", { name: "Total for each row" }).getAttribute("aria-checked"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("switch", { name: "Total for each row" }));
  expect(last().config?.rowTotals).toBe(false);
  fireEvent.click(screen.getByRole("switch", { name: "Total for each column" }));
  expect(last().config?.columnTotals).toBe(false);
});

// ---------------------------------------------------------------------------
// Through the drawer's extension points

test("registered, the chart's display tab draws its own pieces and not the generic rows they replace", async () => {
  const { Inspector } = await import("../Inspector.tsx");
  show(
    <Inspector
      widget={byClinic()}
      definition={chart}
      surface="app"
      filters={[]}
      catalog={catalog}
      onChange={() => {}}
      onDuplicate={() => {}}
      onRemove={() => {}}
      rowRules={() => ""}
    />,
  );
  fireEvent.click(screen.getByRole("tab", { name: /^Display/ }));
  const panel = within(await screen.findByRole("tabpanel"));
  expect(panel.getAllByRole("heading", { name: "Chart type" })).toHaveLength(1);
  expect(panel.getByRole("radio", { name: /^Pie/ })).toBeTruthy();
  expect(panel.getAllByRole("switch", { name: "Show values on bars" })).toHaveLength(1);
});

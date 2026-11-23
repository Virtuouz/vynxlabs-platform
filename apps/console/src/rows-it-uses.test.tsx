// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Page, PageWidget } from "@volvel/manifest";
import { sampleOf } from "@volvel/ui";
import { formatValue } from "@volvel/widgets";
import { chart as coreChart, list } from "@volvel/widgets-core";

// The generic drawer, as a pack widget gets it: under another type, so the core chart own
// sections (which draw their own value, breakdown and order) are not in its place.
const chart = { ...coreChart, type: "plain/core/chart" };

import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  fromEditor,
  isComplete,
  operatorsFor,
  sentenceOf,
} from "./kit/inspector/conditionWords.ts";
import { columnsByGrouping, groupability, sampleValue } from "./kit/inspector/grouping.ts";
import { Inspector } from "./kit/inspector/Inspector.tsx";
import { FormatRow } from "./kit/inspector/measureControls.tsx";
import { type Catalog, columnsNamed } from "./kit/inspector/model.ts";
import { show } from "./testing.tsx";

const catalog: Catalog = {
  tables: [
    {
      name: "invoices",
      rows: 1458,
      columns: [
        { name: "number", type: "text", references: null, distinct: 1458 },
        { name: "total", type: "number", references: null },
        {
          name: "status",
          type: "enum",
          references: null,
          distinct: 3,
          values: [
            { value: "paid", count: 1204 },
            { value: "unpaid", count: 236 },
            { value: "void", count: 18 },
          ],
        },
        { name: "issued_at", type: "timestamp", references: null },
      ],
    },
  ],
  queries: [],
  maySql: false,
};

const place = { x: 0, y: 0, w: 6, h: 6 };
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
const listWidget = (): PageWidget => ({
  id: "recent",
  type: "core/list",
  at: place,
  data: { rows: { source: { visual: { table: "invoices" } } } },
});

let written: PageWidget[];
function Harness({
  start,
  definition,
  page,
  using = catalog,
}: {
  start: PageWidget;
  definition: typeof chart;
  page?: Page;
  using?: Catalog;
}) {
  const [widget, setWidget] = useState(start);
  return (
    <Inspector
      widget={widget}
      definition={definition}
      surface="app"
      filters={[]}
      catalog={using}
      {...(page ? { page, pages: [page] } : {})}
      onChange={(next) => {
        written.push(next);
        setWidget(next);
      }}
      onDuplicate={() => {}}
      onRemove={() => {}}
      rowRules={() => "/rules"}
    />
  );
}

beforeEach(() => {
  written = [];
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 404 }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const panel = () => within(screen.getByRole("tabpanel"));
const dialog = async () => within(await screen.findByRole("dialog"));
const last = () => queryOf(written.at(-1));

// ----- Only include -----

test("a choice column's values are chosen, several make an array, and the chip says them", async () => {
  show(<Harness start={listWidget()} definition={list as never} />);
  fireEvent.click(panel().getByRole("button", { name: "Condition" }));
  let editor = await dialog();
  // Each value is offered with how many rows have it.
  expect(editor.getByText("1,204 rows")).toBeTruthy();
  fireEvent.click(editor.getByLabelText(/^Void/));
  fireEvent.click(editor.getByRole("button", { name: "Add" }));
  expect(last().filters).toEqual([{ column: "status", op: "eq", value: "void" }]);
  expect(panel().getByRole("button", { name: "Status is Void" })).toBeTruthy();

  // Editing it writes as it goes: two values are "is one of".
  fireEvent.click(panel().getByRole("button", { name: "Status is Void" }));
  editor = await dialog();
  fireEvent.click(editor.getByLabelText(/^Paid/));
  expect(last().filters).toEqual([{ column: "status", op: "in", value: ["void", "paid"] }]);
  expect(panel().getByRole("button", { name: "Status is Void, Paid" })).toBeTruthy();
});

test("a condition on a record page can be about that record's column or the current user (WID-M9)", async () => {
  const page: Page = {
    id: "invoice",
    title: "Invoice",
    kind: "record",
    record: { table: "invoices" },
    widgets: [],
  };
  show(<Harness start={listWidget()} definition={list as never} page={page} />);
  fireEvent.click(panel().getByRole("button", { name: "Condition" }));
  let editor = await dialog();
  fireEvent.change(editor.getByLabelText("Field"), { target: { value: "number" } });
  fireEvent.click(editor.getByRole("radio", { name: "This record's" }));
  fireEvent.change(editor.getByLabelText("Column of this record"), { target: { value: "number" } });
  fireEvent.click(editor.getByRole("button", { name: "Add" }));
  expect(last().filters).toEqual([{ column: "number", op: "eq", value: { record: "number" } }]);
  expect(panel().getByRole("button", { name: "Number is this record's number" })).toBeTruthy();

  fireEvent.click(panel().getByRole("button", { name: "Number is this record's number" }));
  editor = await dialog();
  fireEvent.click(editor.getByRole("radio", { name: "The current user" }));
  expect(last().filters).toEqual([{ column: "number", op: "eq", value: { user: "id" } }]);
  expect(panel().getByRole("button", { name: "Number is the current user" })).toBeTruthy();
});

test("a money column's condition is typed in dollars and kept in cents (WID-26)", async () => {
  const money: Catalog = {
    ...catalog,
    tables: [
      {
        name: "invoices",
        columns: [
          {
            name: "total",
            type: "integer",
            references: null,
            description: "What is owed, in cents.",
          },
        ],
      },
    ],
  };
  const start = listWidget();
  render(
    <Inspector
      widget={start}
      definition={list as never}
      surface="app"
      filters={[]}
      catalog={money}
      onChange={(next) => written.push(next)}
      onDuplicate={() => {}}
      onRemove={() => {}}
      rowRules={() => "/rules"}
    />,
  );
  fireEvent.click(panel().getByRole("button", { name: "Condition" }));
  const editor = await dialog();
  fireEvent.click(editor.getByRole("radio", { name: "is more than" }));
  fireEvent.change(editor.getByLabelText("Value"), { target: { value: "12.50" } });
  fireEvent.click(editor.getByRole("button", { name: "Add" }));
  expect(last().filters).toEqual([{ column: "total", op: "gt", value: 1250 }]);
});

test('a money column\'s "is between" is typed in dollars and kept in cents (WID-26)', async () => {
  const money: Catalog = {
    ...catalog,
    tables: [
      {
        name: "invoices",
        columns: [
          {
            name: "total",
            type: "integer",
            references: null,
            description: "What is owed, in cents.",
          },
        ],
      },
    ],
  };
  const start = listWidget();
  render(
    <Inspector
      widget={start}
      definition={list as never}
      surface="app"
      filters={[]}
      catalog={money}
      onChange={(next) => written.push(next)}
      onDuplicate={() => {}}
      onRemove={() => {}}
      rowRules={() => "/rules"}
    />,
  );
  fireEvent.click(panel().getByRole("button", { name: "Condition" }));
  const editor = await dialog();
  fireEvent.click(editor.getByRole("radio", { name: "is between" }));
  fireEvent.change(editor.getByLabelText("From"), { target: { value: "12.50" } });
  fireEvent.change(editor.getByLabelText("To"), { target: { value: "20" } });
  fireEvent.click(editor.getByRole("button", { name: "Add" }));
  expect(last().filters).toEqual([{ column: "total", op: "between", value: [1250, 2000] }]);
});

test("a condition is removed by its ×", async () => {
  const start = listWidget();
  start.data = {
    rows: {
      source: {
        visual: {
          table: "invoices",
          filters: [
            { column: "status", op: "ne", value: "void" },
            { column: "total", op: "gt", value: 100 },
          ],
        },
      },
    },
  };
  show(<Harness start={start} definition={list as never} />);
  expect(panel().getByRole("button", { name: "Total is more than 100" })).toBeTruthy();
  fireEvent.click(panel().getByRole("button", { name: "Remove Status is not Void" }));
  expect(last().filters).toEqual([{ column: "total", op: "gt", value: 100 }]);
  fireEvent.click(panel().getByRole("button", { name: "Remove Total is more than 100" }));
  expect(last().filters).toBeUndefined();
});

test("what an editor makes of a condition: a list for several values, one test for each 'is not'", () => {
  expect(fromEditor({ field: "status", test: "eq", value: ["a", "b"] })).toEqual([
    { column: "status", op: "in", value: ["a", "b"] },
  ]);
  expect(fromEditor({ field: "status", test: "ne", value: ["a", "b"] })).toEqual([
    { column: "status", op: "ne", value: "a" },
    { column: "status", op: "ne", value: "b" },
  ]);
  // A typed list for "is one of" is split at its commas; a typed number is a number.
  expect(fromEditor({ field: "name", test: "in", value: "ann, bob" })).toEqual([
    { column: "name", op: "in", value: ["ann", "bob"] },
  ]);
  expect(fromEditor({ field: "total", test: "gt", value: "12" })).toEqual([
    { column: "total", op: "gt", value: 12 },
  ]);
  expect(fromEditor({ field: "paid_at", test: "is_null" })).toEqual([
    { column: "paid_at", op: "is_null" },
  ]);
  expect(isComplete({ field: "status", test: "eq" })).toBe(false);
  expect(isComplete({ field: "paid_at", test: "is_null" })).toBe(true);
  // A date is spoken in a date's words.
  expect(operatorsFor("date").map((one) => one.label)).toContain("is before");
  expect(
    sentenceOf(
      { column: "issued_at", op: "lt", value: "2026-01-01" },
      {
        name: "issued_at",
        type: "timestamp",
        references: null,
      },
    ).before,
  ).toBe("Issued at is before");
});

// ----- Sorted by -----

test("the sort editor writes the sort in the column's words, then by another, and how many", async () => {
  show(<Harness start={chartWidget()} definition={chart} />);
  expect(panel().getByRole("button", { name: /Sorted by\s*As they come/ })).toBeTruthy();
  fireEvent.click(panel().getByRole("button", { name: /^Sorted by/ }));
  let editor = await dialog();
  fireEvent.click(editor.getByRole("button", { name: "Then by" }));
  expect(last().sort).toEqual([{ by: "issued_at_week", descending: true }]);
  editor = await dialog();
  // A date is newest or oldest.
  fireEvent.click(editor.getByLabelText("Oldest"));
  expect(last().sort).toEqual([{ by: "issued_at_week" }]);
  fireEvent.change(editor.getByLabelText("Show at most"), { target: { value: "25" } });
  expect(last().limit).toBe(25);
  expect(last().sort).toEqual([{ by: "issued_at_week" }]);
  expect(
    panel().getByRole("button", { name: /Sorted by\s*Issued at week, oldest first/ }),
  ).toBeTruthy();
  fireEvent.click(editor.getByRole("button", { name: "Don't sort" }));
  expect(last().sort).toBeUndefined();
  fireEvent.change(editor.getByLabelText("Show at most"), { target: { value: "" } });
  expect(last().limit).toBeUndefined();
});

// ----- Break down by -----

test("the breakdown editor orders columns by how well they group, and writes a column and a period", async () => {
  show(<Harness start={chartWidget()} definition={chart} />);
  fireEvent.click(panel().getByRole("button", { name: /^For each/ }));
  const editor = await dialog();
  // The best to group by come first under "Good for grouping", the rest under "Other columns".
  expect(editor.getByText("Good for grouping")).toBeTruthy();
  expect(editor.getByText("Other columns")).toBeTruthy();
  const names = editor
    .getAllByRole("radio")
    .filter((one) =>
      (one.closest("fieldset")?.querySelector("legend")?.textContent ?? "").includes(
        "column to break down by",
      ),
    )
    .map((one) => (one.closest("label")?.textContent ?? "").trim());
  // A few values first, then dates; every row different last.
  expect(names[0]).toBe("Status3 values");
  expect(names[1]).toMatch(/^Issued at/);
  expect(names.slice(-2).sort()).toEqual(["Idevery row differs", "Numberevery row differs"]);
  expect(names.find((one) => one.startsWith("Number"))).toBe("Numberevery row differs");

  fireEvent.click(editor.getByLabelText(/^Status/));
  expect(last().groupBy).toEqual([{ column: "status" }]);
  fireEvent.click(editor.getByLabelText(/^Issued at/));
  expect(last().groupBy).toEqual([{ column: "issued_at", bucket: "week" }]);
  // A date offers its periods.
  fireEvent.click(editor.getByLabelText("Month"));
  expect(last().groupBy).toEqual([{ column: "issued_at", bucket: "month" }]);
  expect(editor.getByLabelText("Quarter")).toBeTruthy();
});

test("how well a column groups: its values when known, its type when not", () => {
  expect(groupability({ name: "status", type: "enum", references: null, distinct: 3 }).hint).toBe(
    "3 values",
  );
  expect(groupability({ name: "client", type: "text", references: null, distinct: 412 }).hint).toBe(
    "412 values",
  );
  expect(
    groupability({ name: "number", type: "text", references: null, distinct: 900 }, 900).hint,
  ).toBe("every row differs");
  expect(groupability({ name: "issued_at", type: "timestamp", references: null }).hint).toBe(
    "a date",
  );
  const order = columnsByGrouping([
    { name: "total", type: "number", references: null },
    { name: "id", type: "uuid", references: null },
    { name: "issued_at", type: "date", references: null },
    { name: "status", type: "enum", references: null },
  ]).map((one) => one.name);
  expect(order).toEqual(["status", "issued_at", "total", "id"]);
});

// ----- The number format -----

test("the format row shows a real number from the data, with its format's name, and opens the picker", async () => {
  const changes: unknown[] = [];
  const sample = sampleValue([{ label: "May", total: 4312000 }, { total: 9 }], ["total"]);
  expect(sample).toBe(4312000);
  show(
    <FormatRow
      value={{ style: "currency", currency: "USD", minorUnits: true }}
      sample={sample}
      onChange={(next) => changes.push(next)}
    />,
  );
  // The data is in cents: the row writes it as the dashboard will.
  const row = screen.getByRole("button", { name: /Numbers/ });
  expect(row.textContent).toContain("$43,120.00");
  expect(row.textContent).toContain("Money");
  fireEvent.click(row);
  const picker = await dialog();
  // Each choice is the real number written that way.
  expect(picker.getByText("$43.1k")).toBeTruthy();
  expect(picker.getByText("$43,120")).toBeTruthy();
  fireEvent.click(picker.getByLabelText(/Percent/));
  expect(changes.at(-1)).toEqual({ style: "percent", minorUnits: true });
});

test("there is one formatter: the kit's samples are the widget SDK's formatValue", () => {
  for (const format of [
    { style: "currency" as const, currency: "EUR" },
    { style: "currency" as const, notation: "compact" as const },
    { style: "currency" as const, decimals: 0 },
    { style: "percent" as const },
    { style: "number" as const, grouping: false as const },
    { style: "currency" as const, minorUnits: true },
  ]) {
    expect(sampleOf(43120.5, format)).toBe(formatValue(43120.5, format));
  }
  expect(sampleOf(43120, { style: "currency", notation: "compact" })).toBe("$43.1k");
});

test("WID-M11: a saved query is given values of its own, and SQL its numbered values", async () => {
  const start = listWidget();
  start.data = { rows: { source: { query: "reports/late" } } };
  show(<Harness start={start} definition={list as never} />);
  fireEvent.click(panel().getByRole("button", { name: "Add a value" }));
  fireEvent.change(panel().getByLabelText("Name of parameter 1"), { target: { value: "days" } });
  fireEvent.change(panel().getByLabelText("Value of days"), { target: { value: "30" } });
  const source = () => written.at(-1)?.data?.rows?.source;
  expect(source()).toEqual({ query: "reports/late", values: { days: 30 } });
  fireEvent.click(panel().getByRole("button", { name: "Remove the value of days" }));
  expect(source()).toEqual({ query: "reports/late" });
});

test("WID-M11: SQL written here keeps its numbered values, and shows them", async () => {
  const start = listWidget();
  start.data = { rows: { source: { sql: "select $1::int", values: [7] } } };
  show(<Harness start={start} definition={list as never} />);
  expect((panel().getByLabelText("Value of $1") as HTMLInputElement).value).toBe("7");
  fireEvent.change(panel().getByLabelText("Value of $1"), { target: { value: "9" } });
  expect(written.at(-1)?.data?.rows?.source).toEqual({ sql: "select $1::int", values: [9] });
});

// ----- WID-M10: Also from -----

const withCustomers: Catalog = {
  ...catalog,
  tables: [
    {
      ...catalog.tables[0],
      columns: [
        ...(catalog.tables[0]?.columns ?? []),
        { name: "customer", type: "reference", references: "customers" },
      ],
    } as Catalog["tables"][number],
    {
      name: "customers",
      columns: [
        { name: "name", type: "text", references: null },
        { name: "city", type: "text", references: null },
      ],
    },
  ],
};

test("WID-M10: a table the chosen one points to is offered as Also from, and its columns are chosen", async () => {
  show(<Harness start={listWidget()} definition={list as never} using={withCustomers} />);
  expect(panel().getByText("Also from")).toBeTruthy();
  fireEvent.click(panel().getByRole("button", { name: /Customers/ }));
  expect(last().joins).toEqual(["customer"]);
  const city = within(panel().getByRole("group", { name: "Columns from Customers" })).getByRole(
    "button",
    { name: "City" },
  );
  fireEvent.click(city);
  expect(last().columns).toEqual([
    "id",
    "number",
    "total",
    "status",
    "issued_at",
    "customer",
    "customer.city",
  ]);
  fireEvent.click(city);
  expect(last().columns).not.toContain("customer.city");
});

test("WID-M10: the columns of a followed table are columns every other control can name", () => {
  const names = columnsNamed(withCustomers, "invoices", ["customer"]).map((one) => one.name);
  expect(names).toContain("customer.name");
  expect(columnsNamed(withCustomers, "invoices").map((one) => one.name)).not.toContain(
    "customer.name",
  );
});

test("WID-M10: switching a joined table off takes its columns out, and a table with no reference offers nothing", async () => {
  const start = listWidget();
  start.data = {
    rows: {
      source: {
        visual: { table: "invoices", joins: ["customer"], columns: ["number", "customer.name"] },
      },
    },
  };
  show(<Harness start={start} definition={list as never} using={withCustomers} />);
  fireEvent.click(panel().getByRole("button", { name: /Customers/ }));
  expect(last().joins).toBeUndefined();
  expect(last().columns).toEqual(["number"]);
  cleanup();
  show(<Harness start={listWidget()} definition={list as never} />);
  expect(panel().queryByText("Also from")).toBeNull();
});

import type { Page, PageWidget } from "@volvel/manifest";
import { widgetRegistry } from "@volvel/manifest";
import { describe, expect, test } from "vitest";
import { type Catalog, type CatalogTable, defaultInputs } from "./kit/inspector/model.ts";
import { showsNothing } from "./screens/builder/publishCheck.ts";
import {
  detailWidget,
  infoFromCatalog,
  makeDetail,
  markAction,
  startingFormat,
  type TableInfo,
} from "./screens/builder/records.ts";
import { sheetActionsFor, syncSheetActions } from "./screens/builder/sheetActions.ts";
import { placesFor, startingConfigFor } from "./screens/builder/startingConfig.ts";

const invoices: CatalogTable = {
  name: "invoices",
  columns: [
    { name: "id", type: "uuid", references: null },
    { name: "created_at", type: "timestamp", references: null },
    { name: "number", type: "text", references: null },
    { name: "client", type: "reference", references: "clients" },
    {
      name: "total",
      type: "integer",
      references: null,
      description: "What is owed, in cents.",
    },
    {
      name: "status",
      type: "enum",
      references: null,
      values: [{ value: "unpaid" }, { value: "paid" }],
    },
    { name: "issued", type: "date", references: null },
  ],
};
const catalog: Catalog = { tables: [invoices], queries: [], maySql: false };
const info = infoFromCatalog(catalog, "invoices") as TableInfo;

const action = (extra = {}) => ({
  steps: [{ do: "update" as const, record: "event" as const, set: { status: { value: "paid" } } }],
  when: [{ field: "status", of: "event" as const, test: "is_not" as const, value: "paid" }],
  ...extra,
});

const table = (rowActions: unknown[], more: Partial<PageWidget> = {}): PageWidget => ({
  id: "table",
  type: "core/table",
  at: { x: 0, y: 0, w: 12, h: 8 },
  data: { rows: { source: { visual: { table: "invoices" } } } },
  config: { rowActions },
  on: { rowClick: { steps: [{ do: "open", page: "invoice-detail", record: "event" }] } },
  ...more,
});

const sheetPage = (widgets: PageWidget[]): Page => ({
  id: "invoice-detail",
  title: "Invoice detail",
  kind: "sheet",
  record: { table: "invoices" },
  widgets,
});

describe("money known from the table, at the start", () => {
  test("a field of a new detail or form starts with the table's format", () => {
    expect(startingFormat(info.columns.find((one) => one.name === "total"))).toEqual({
      format: { style: "currency", currency: "USD", minorUnits: true },
    });
    expect(startingFormat(info.columns.find((one) => one.name === "number"))).toEqual({});
    const fields = detailWidget(info, { x: 0, y: 0, w: 12, h: 8 }).config?.fields as {
      column: string;
      format?: unknown;
    }[];
    expect(fields.find((one) => one.column === "total")?.format).toMatchObject({
      style: "currency",
      minorUnits: true,
    });
  });
});

describe("the detail made from a table carries the table's columns", () => {
  test("labels, formats and badge tones come with it, in the table's order", () => {
    const list: PageWidget = table([], {
      config: {
        columns: [
          { column: "issued", label: "Billed on" },
          {
            column: "total",
            label: "Amount",
            format: { style: "currency", currency: "EUR", minorUnits: true },
          },
          { column: "status", as: "badge", badges: { paid: "success", unpaid: "attention" } },
        ],
      },
    });
    const { page } = makeDetail(list, info, []);
    const config = page.widgets[0]?.config as {
      status?: string;
      statusBadges?: Record<string, string>;
      fields: { column: string; label?: string; format?: { currency?: string } }[];
    };
    expect(config.status).toBe("status");
    expect(config.statusBadges).toEqual({ paid: "success", unpaid: "attention" });
    const names = config.fields.map((one) => one.column);
    expect(names.indexOf("issued")).toBeLessThan(names.indexOf("total"));
    expect(config.fields.find((one) => one.column === "issued")?.label).toBe("Billed on");
    expect(config.fields.find((one) => one.column === "total")).toMatchObject({
      label: "Amount",
      format: { currency: "EUR", minorUnits: true },
    });
  });
});

describe("a table's row actions are its detail sheet's toolbar, once", () => {
  const detail = (actions?: unknown[]): PageWidget => ({
    id: "detail",
    type: "core/detail",
    at: { x: 0, y: 0, w: 12, h: 8 },
    data: { record: { source: { record: "this" } } },
    config: { heading: "number", ...(actions ? { actions } : {}) },
  });
  const mark = { id: "mark-paid", label: "Mark paid", action: action() };

  test("a row action added to the table reaches the sheet, written for the sheet's own record", () => {
    const pages: Page[] = [
      { id: "list", title: "Invoices", widgets: [table([mark])] },
      sheetPage([detail()]),
    ];
    syncSheetActions(pages, "list", [table([])]);
    const actions = pages[1]?.widgets[0]?.config?.actions as {
      id: string;
      action: { when: { of: string }[]; steps: { record: string }[] };
    }[];
    expect(actions.map((one) => one.id)).toEqual(["mark-paid"]);
    // Written for the sheet's own record, `when` and who may run it kept.
    expect(actions[0]?.action.when[0]?.of).toBe("this");
    expect(actions[0]?.action.steps[0]?.record).toBe("this");
  });

  test("changing it changes the sheet's, and what a person added by hand stays", () => {
    const byHand = { id: "reopen", label: "Reopen", action: action() };
    const pages: Page[] = [
      { id: "list", title: "Invoices", widgets: [table([{ ...mark, label: "Mark it paid" }])] },
      sheetPage([detail([{ ...mark, action: action() }, byHand])]),
    ];
    syncSheetActions(pages, "list", [table([mark])]);
    const actions = pages[1]?.widgets[0]?.config?.actions as { id: string; label: string }[];
    expect(actions.map((one) => one.label)).toEqual(["Mark it paid", "Reopen"]);
  });

  test("an unchanged table writes nothing", () => {
    const pages: Page[] = [
      { id: "list", title: "Invoices", widgets: [table([mark])] },
      sheetPage([detail()]),
    ];
    syncSheetActions(pages, "list", [table([mark])]);
    expect(pages[1]?.widgets[0]?.config?.actions).toBeUndefined();
  });

  test("removing the last row action takes it off the sheet", () => {
    const pages: Page[] = [
      { id: "list", title: "Invoices", widgets: [table([])] },
      sheetPage([detail([{ ...mark, action: action() }])]),
    ];
    syncSheetActions(pages, "list", [table([mark])]);
    expect(pages[1]?.widgets[0]?.config).not.toHaveProperty("actions");
  });

  test("an Action group on the sheet that holds the same keeps it: the detail does not double it", () => {
    const group: PageWidget = {
      id: "actions",
      type: "core/actions",
      at: { x: 0, y: 0, w: 12, h: 1 },
      config: { actions: [{ id: "mark-paid", label: "Mark paid", action: action() }] },
    };
    const sheet = sheetPage([group, detail()]);
    expect(sheetActionsFor([mark], sheet)).toEqual([]);
    const pages: Page[] = [{ id: "list", title: "Invoices", widgets: [table([mark])] }, sheet];
    syncSheetActions(pages, "list", [table([])]);
    expect(pages[1]?.widgets[1]?.config).not.toHaveProperty("actions");
  });
});

describe("a new List, Pivot and Record detail start with something placed", () => {
  test("a list places the name, the status, the amount and what it is about", () => {
    expect(placesFor(invoices)).toEqual({
      title: "number",
      badge: "status",
      right: "total",
      subtitle: "client",
    });
  });
  test("a list over a table with a title, a date and a status", () => {
    const appointments: CatalogTable = {
      name: "appointments",
      columns: [
        { name: "id", type: "uuid", references: null },
        { name: "starts_at", type: "timestamp", references: null },
        { name: "code", type: "text", references: null },
        { name: "pet", type: "reference", references: "pets" },
        { name: "status", type: "enum", references: null },
      ],
    };
    expect(placesFor(appointments)).toEqual({
      title: "code",
      badge: "status",
      right: "starts_at",
      subtitle: "pet",
    });
  });
  test("the places are written into the new List's own config, and a set one is kept", () => {
    const list: PageWidget = {
      id: "list",
      type: "core/list",
      at: { x: 0, y: 0, w: 6, h: 6 },
      config: { look: "cards" },
    };
    const made = startingConfigFor(list, invoices, { widgets: [] });
    expect(made.config).toMatchObject({ title: "number", badge: "status", look: "cards" });
    const kept = startingConfigFor({ ...list, config: { title: "client" } }, invoices, {
      widgets: [],
    });
    expect(kept.config?.title).toBe("client");
  });
  test("a detail on a page that shows a table follows it, and has its fields", () => {
    const detail: PageWidget = {
      id: "detail",
      type: "core/detail",
      at: { x: 0, y: 8, w: 12, h: 8 },
      data: { record: { source: { visual: { table: "invoices" } } } },
    };
    const made = startingConfigFor(detail, invoices, { widgets: [table([])] });
    expect(made.data?.record?.source).toEqual({ selected: "table" });
    expect(made.config?.heading).toBe("number");
    expect(((made.config?.fields as { column: string }[]) ?? []).length).toBeGreaterThan(2);
  });
  test("a Pivot starts with a grid: two breakdowns, not one", () => {
    const pivot = widgetRegistry().get("core/pivot");
    if (!pivot) throw new Error("no pivot");
    const inputs = defaultInputs(pivot, "invoices", catalog);
    const source = inputs.rows?.source;
    const by = source && "visual" in source ? source.visual.groupBy : undefined;
    expect(by?.length).toBe(2);
    expect(by?.map((one) => one.column)).toEqual(["status", "issued"]);
    expect(by?.[1]?.bucket).toBe("month");
  });
});

describe("the row actions a starter makes", () => {
  test("'Mark paid' is made with the `when` that fits, so a paid row is not offered it as it is", () => {
    const made = markAction({ column: "status", value: "paid" }, "event");
    expect(made.when).toEqual([{ field: "status", of: "event", test: "is_not", value: "paid" }]);
  });
});

describe("the publish check names what shows nothing yet", () => {
  test("a List with nothing placed, a Pivot with one breakdown, a detail with no record", () => {
    const list: PageWidget = { id: "l", type: "core/list", at: { x: 0, y: 0, w: 6, h: 6 } };
    expect(showsNothing(list)).toMatch(/Nothing is placed/);
    expect(showsNothing({ ...list, config: { title: "number" } })).toBeUndefined();
    const pivot: PageWidget = {
      id: "p",
      type: "core/pivot",
      at: { x: 0, y: 0, w: 6, h: 6 },
      data: {
        rows: { source: { visual: { table: "invoices", groupBy: [{ column: "status" }] } } },
      },
    };
    expect(showsNothing(pivot)).toMatch(/rows and the columns/);
    const record: PageWidget = { id: "d", type: "core/detail", at: { x: 0, y: 0, w: 6, h: 6 } };
    expect(showsNothing(record)).toMatch(/where the record comes from/);
    expect(
      showsNothing({ ...record, data: { record: { source: { record: "this" } } } }),
    ).toBeUndefined();
  });
});

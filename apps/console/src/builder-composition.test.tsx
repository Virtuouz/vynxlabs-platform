// @vitest-environment happy-dom

import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import {
  checkInterface,
  containerHeight,
  type InterfaceBody,
  type PageWidget,
  type TableBody,
} from "@volvel/manifest";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { InterfaceBuilder } from "./screens/builder/AppBuilder.tsx";
import {
  type PageContext,
  suggestionsFor,
  type TableInfo,
  textColumns,
} from "./screens/builder/records.ts";
import { blankPage, listPage, recordPage } from "./screens/builder/starters.ts";
import {
  detailActionsToGroup,
  groupButtons,
  groupCandidates,
  searchEdit,
  wrapInSection,
} from "./screens/builder/suggest.ts";
import { show } from "./testing.tsx";

// Phase 27, M8: suggestions first in "Add to page", grouping buttons, a Section around
// widgets, and "+ Page" from a table.

// The Record detail, Button and Form views are drawn with nothing: these tests read what is written.
vi.mock("@volvel/widgets-core/views", async (original) => {
  const real = await original<typeof import("@volvel/widgets-core/views")>();
  const nothing = () => null;
  return {
    ...real,
    corePack: {
      ...real.corePack,
      views: {
        "core/detail": nothing,
        "core/button": nothing,
        "core/form": nothing,
        ...real.corePack.views,
      },
    },
  };
});

const root = "/tenants/t1/workspaces/w1";
const api = `/api/v1${root}`;
let stored: InterfaceBody;

const invoices: TableInfo = {
  name: "invoices",
  columns: [
    { name: "number", type: "text", required: true, values: [] },
    { name: "note", type: "long_text", required: false, values: [] },
    { name: "total", type: "number", required: true, values: [] },
    { name: "status", type: "enum", required: false, values: ["unpaid", "paid"] },
    { name: "customer", type: "reference", required: false, references: "customers", values: [] },
  ],
};
const definitions: Record<string, TableBody> = {
  invoices: {
    columns: {
      number: { type: "text" },
      note: { type: "long_text" },
      total: { type: "integer" },
      status: { type: "enum", values: ["unpaid", "paid"] },
      customer: { type: "reference", references: "customers" },
    },
  } as unknown as TableBody,
  customers: { columns: { name: { type: "text" } } } as unknown as TableBody,
  visits: {
    columns: { reason: { type: "text" }, invoice: { type: "reference", references: "invoices" } },
  } as unknown as TableBody,
};
const tableOf = (path: string) => definitions[path];
const problems = (body: InterfaceBody) =>
  checkInterface(body, tableOf).map((issue) => `${issue.path} ${issue.message}`);

const stat = (id: string, x: number, measure: "count" | "sum"): PageWidget => ({
  id,
  type: "core/stat",
  title: id,
  at: { x, y: 0, w: 3, h: 3 },
  data: {
    value: {
      source: {
        visual: {
          table: "invoices",
          measures: [
            measure === "count"
              ? { fn: "count", as: "n" }
              : { fn: "sum", column: "total", as: "n" },
          ],
        },
      },
    },
  },
});
const button = (
  id: string,
  label: string,
  at: { x: number; y: number },
  tone?: "primary" | "default" | "danger",
): PageWidget => ({
  id,
  type: "core/button",
  title: label,
  at: { ...at, w: 3, h: 1 },
  config: { label, ...(tone ? { tone } : {}) },
  on: { click: { steps: [{ do: "message", text: `${label} pressed` }] } },
});
const table = (): PageWidget => ({
  id: "invoices",
  type: "core/table",
  title: "All invoices",
  at: { x: 0, y: 6, w: 12, h: 8 },
  data: { rows: { source: { visual: { table: "invoices" } } } },
});
const money = (): InterfaceBody => ({
  title: "Sales",
  pages: [
    {
      id: "money",
      title: "Money",
      widgets: [
        stat("count", 0, "count"),
        stat("total", 3, "sum"),
        button("remind", "Send reminders", { x: 0, y: 3 }, "default"),
        button("export", "Export", { x: 3, y: 3 }, "primary"),
        button("archive", "Archive", { x: 0, y: 5 }, "danger"),
        table(),
      ],
    },
  ],
});
const context = (body: InterfaceBody = money()): PageContext => ({
  widgets: body.pages[0]?.widgets ?? [],
  filters: [],
  pages: body.pages,
  page: body.pages[0] as never,
});

beforeEach(() => {
  history.replaceState(null, "", "/");
  stored = money();
  const columns = [
    { name: "number", type: "text", required: true, status: "active" },
    { name: "note", type: "long_text", status: "active" },
    { name: "total", type: "number", required: true, status: "active" },
    { name: "status", type: "enum", values: ["unpaid", "paid"], status: "active" },
    { name: "customer", type: "reference", references: "customers", status: "active" },
  ];
  const routes: Record<string, (body: unknown) => [number, unknown]> = {
    [`GET ${api}/drafts/screens/sales`]: () => [200, { revision: 1, body: stored }],
    [`PUT ${api}/drafts/screens/sales`]: (saved) => {
      stored = (saved as { body: InterfaceBody }).body;
      return [200, { revision: 2, body: stored }];
    },
    [`GET ${api}/interfaces`]: () => [
      200,
      {
        items: [
          {
            path: "screens/sales",
            title: "Sales",
            deployed: false,
            draft: true,
            removing: false,
            app: "sales",
          },
        ],
      },
    ],
    [`GET ${api}/drafts`]: () => [200, { items: [{ path: "screens/sales" }] }],
    [`GET ${api}/apps`]: () => [200, { items: [] }],
    [`GET ${api}/tables/invoices`]: () => [200, { columns }],
    [`GET ${api}/rows/invoices`]: () => [200, { items: [], nextCursor: null }],
    [`GET ${api}/queries/schema`]: () => [
      200,
      {
        tables: [
          {
            name: "invoices",
            columns: columns.map((one) => ({
              name: one.name,
              type: one.type,
              references: "references" in one ? one.references : null,
            })),
          },
          {
            name: "visits",
            columns: [
              { name: "reason", type: "text", references: null },
              { name: "invoice", type: "reference", references: "invoices" },
            ],
          },
        ],
        functions: [],
        maySql: false,
      },
    ],
    [`GET ${api}/queries`]: () => [200, { items: [] }],
    [`GET ${api}/widget-data`]: () => [200, { inputs: {} }],
  };
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const sent = init.body ? JSON.parse(init.body as string) : undefined;
    const path = address.split("?")[0] as string;
    const handler = routes[`${method} ${address}`] ?? routes[`${method} ${path}`];
    const [status, reply] =
      handler?.(sent) ??
      (/\/(rows|aggregate)\//.test(path)
        ? [200, { items: [], nextCursor: null, truncated: false }]
        : [404, { detail: "No mock" }]);
    return new Response(reply === null ? null : JSON.stringify(reply), { status });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const open = async () => {
  show(<InterfaceBuilder root={root} link="/t/t1/workspaces/w1" path="screens/sales" />);
  await screen.findByRole("heading", { name: "Pages" });
};
const saved = async (check: (body: InterfaceBody) => boolean) =>
  waitFor(() => expect(check(stored)).toBe(true), { timeout: 4000 });
const money0 = () => stored.pages[0]?.widgets ?? [];
const suggestions = async () => {
  fireEvent.click(screen.getAllByRole("button", { name: "Add to page" })[0] as HTMLElement);
  const dialog = within(await screen.findByRole("dialog", { name: "Add to page" }));
  return {
    dialog,
    group: within(await dialog.findByRole("region", { name: "Suggested for Invoices" })),
  };
};

// ----- Suggestions, as the dialog shows them -----

test("Add to page opens with what the page lacks, above the categories, and the search narrows it", async () => {
  await open();
  const { dialog, group } = await suggestions();
  for (const name of [
    "Search invoices",
    "Invoice detail",
    "New invoice form",
    "Group the buttons",
    "A section for the numbers",
  ]) {
    expect(group.getByRole("button", { name: new RegExp(`^${name}`) })).toBeTruthy();
  }
  // The group is first: before any category of widgets.
  const first = dialog.getAllByRole("heading", { level: 3 })[0];
  expect(first?.textContent).toBe("Suggested for Invoices");

  const field = dialog.getByLabelText("Find something to add");
  fireEvent.change(field, { target: { value: "group" } });
  const left = within(dialog.getByRole("region", { name: "Suggested for Invoices" }));
  expect(left.getAllByRole("button")).toHaveLength(1);
  expect(left.getByRole("button", { name: /^Group the buttons/ })).toBeTruthy();
  fireEvent.change(field, { target: { value: "" } });

  // The arrow keys walk down from the search field and back.
  (field as HTMLElement).focus();
  fireEvent.keyDown(field, { key: "ArrowDown" });
  expect(document.activeElement).toBe(group.getAllByRole("button")[0]);
  fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowDown" });
  expect(document.activeElement).toBe(group.getAllByRole("button")[1]);
  fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowUp" });
  fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowUp" });
  expect(document.activeElement).toBe(field);
});

test("Search invoices puts a search bar at the top, bound to the widgets of the table on its text columns", async () => {
  await open();
  const { group } = await suggestions();
  fireEvent.click(group.getByRole("button", { name: /^Search invoices/ }));
  await saved((body) => (body.pages[0]?.widgets ?? []).some((one) => one.type === "core/filter"));
  const widgets = money0();
  const bar = widgets.find((one) => one.type === "core/filter");
  expect(bar).toMatchObject({
    at: { x: 0, y: 0, w: 12 },
    config: { filters: [{ name: "search", type: "search", label: "Search invoices" }] },
  });
  // Everything that read invoices follows it, in the columns that hold words; the rest moved down.
  for (const id of ["count", "total", "invoices"]) {
    expect(widgets.find((one) => one.id === id)?.data).toMatchObject({
      [id === "invoices" ? "rows" : "value"]: {
        filters: [{ filter: "search", columns: ["number", "note"] }],
      },
    });
  }
  expect(widgets.find((one) => one.id === "count")?.at.y).toBe(2);
  expect(problems(stored)).toEqual([]);
  // A search the page has is not offered again.
  const again = await suggestions();
  expect(again.group.queryByRole("button", { name: /^Search invoices/ })).toBeNull();
});

test("A section for the numbers holds the stats, and Undo takes it back whole", async () => {
  await open();
  const { group } = await suggestions();
  fireEvent.click(group.getByRole("button", { name: /^A section for the numbers/ }));
  await saved((body) => (body.pages[0]?.widgets ?? []).some((one) => one.type === "core/section"));
  const widgets = money0();
  const section = widgets.find((one) => one.type === "core/section") as PageWidget;
  expect(section.title).toBe("The numbers");
  for (const id of ["count", "total"]) {
    expect(widgets.find((one) => one.id === id)?.in).toEqual({ widget: section.id });
  }
  expect(widgets.find((one) => one.id === "total")?.at).toEqual({ x: 3, y: 0, w: 3, h: 3 });
  expect(section.at.h).toBe(containerHeight(section, widgets));
  expect(problems(stored)).toEqual([]);
  fireEvent.click(await screen.findByRole("button", { name: /^Undo (adding|a)/ }));
  await saved((body) => !(body.pages[0]?.widgets ?? []).some((one) => one.type === "core/section"));
  expect(money0().find((one) => one.id === "count")?.in).toBeUndefined();
});

test("Group the buttons makes one Action group of them, at the first one's place", async () => {
  await open();
  const { group } = await suggestions();
  fireEvent.click(group.getByRole("button", { name: /^Group the buttons/ }));
  await saved((body) => (body.pages[0]?.widgets ?? []).some((one) => one.type === "core/actions"));
  const widgets = money0();
  expect(widgets.some((one) => one.type === "core/button")).toBe(false);
  const bar = widgets.find((one) => one.type === "core/actions") as PageWidget;
  expect(bar.at).toMatchObject({ x: 0, y: 3, h: 1 });
  expect(bar.config?.actions).toEqual([
    {
      id: "remind",
      label: "Send reminders",
      tone: "default",
      action: { steps: [{ do: "message", text: "Send reminders pressed" }] },
    },
    {
      id: "export",
      label: "Export",
      tone: "primary",
      action: { steps: [{ do: "message", text: "Export pressed" }] },
    },
    {
      id: "archive",
      label: "Archive",
      tone: "danger",
      action: { steps: [{ do: "message", text: "Archive pressed" }] },
    },
  ]);
  expect(problems(stored)).toEqual([]);
});

test("a button offers Group with other buttons, the ones on its row checked first; the toast says what happened", async () => {
  await open();
  fireEvent.click(screen.getAllByRole("button", { name: "Export" })[0] as HTMLElement);
  const offer = within(await screen.findByRole("region", { name: "Buttons together" }));
  fireEvent.click(offer.getByRole("button", { name: "Group with other buttons…" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Group with other buttons" }));
  const boxes = dialog.getAllByRole("checkbox") as HTMLInputElement[];
  // Send reminders shares Export's row; Archive does not.
  expect(boxes.map((one) => [one.closest("label")?.textContent, one.checked])).toEqual([
    ["Send reminders (on the same row)", true],
    ["Archive", false],
  ]);
  fireEvent.click(dialog.getByRole("button", { name: "Group the buttons" }));
  await saved((body) => (body.pages[0]?.widgets ?? []).some((one) => one.type === "core/actions"));
  const widgets = money0();
  expect(widgets.filter((one) => one.type === "core/button").map((one) => one.id)).toEqual([
    "archive",
  ]);
  const bar = widgets.find((one) => one.type === "core/actions") as PageWidget;
  expect(((bar.config?.actions ?? []) as { id: string }[]).map((one) => one.id)).toEqual([
    "remind",
    "export",
  ]);
  expect(await screen.findByText("2 buttons are now one Action group.")).toBeTruthy();
});

// ----- The pure changes -----

test("what a page lacks is suggested, and what it has is not", () => {
  const keys = (widgets: PageWidget[], pages = money().pages) =>
    suggestionsFor({ ...context(), widgets, pages }, invoices).map((one) => one.key);
  expect(keys(money0())).toEqual([
    "search",
    "detail",
    "form",
    "mark",
    "filter",
    "group",
    "section",
  ]);
  // Fewer than two buttons or two stats: nothing to group.
  const few = money0().filter((one) => one.id !== "export" && one.id !== "archive");
  expect(keys(few.filter((one) => one.id !== "total"))).not.toContain("group");
  expect(keys(few.filter((one) => one.id !== "total"))).not.toContain("section");
  // A search the page has, a detail the app has.
  const withSearch = context();
  expect(
    suggestionsFor(
      {
        ...withSearch,
        filters: [{ name: "q", type: "search" }],
      },
      invoices,
    ).map((one) => one.key),
  ).not.toContain("search");
  const detailed = [
    ...money().pages,
    {
      id: "invoice-detail",
      title: "Invoice detail",
      kind: "sheet" as const,
      record: { table: "invoices" },
      widgets: [
        { id: "detail", type: "core/detail", at: { x: 0, y: 0, w: 12, h: 8 } } as PageWidget,
      ],
    },
  ];
  expect(keys(money0(), detailed)).not.toContain("detail");
  // Stats already in a section are not top-level numbers.
  const inside = wrapInSection(money0(), ["count", "total"], "The numbers");
  expect(keys(inside?.widgets ?? [])).not.toContain("section");
  expect(textColumns(invoices)).toEqual(["number", "note"]);
});

test("a search is bound to the table's widgets, and to a filter widget the page already has", () => {
  const widgets: PageWidget[] = [
    {
      id: "filters",
      type: "core/filter",
      at: { x: 0, y: 0, w: 12, h: 2 },
      config: {
        filters: [
          { name: "status", type: "choice", from: { table: "invoices", column: "status" } },
        ],
      },
    },
    { ...table(), at: { x: 0, y: 2, w: 12, h: 8 } },
  ];
  const edit = searchEdit(
    { ...context(), widgets, filters: [{ name: "status", type: "choice" }] },
    invoices,
    ["number"],
  );
  expect(edit.widgets.filter((one) => one.type === "core/filter")).toHaveLength(1);
  expect(edit.filters.map((one) => one.name)).toEqual(["status", "search"]);
  expect(edit.widgets.find((one) => one.id === "invoices")?.data?.rows?.filters).toEqual([
    { filter: "search", columns: ["number"] },
  ]);
});

test("wrapInSection holds the widgets on its own grid and moves what lay below", () => {
  const made = wrapInSection(money0(), ["count", "total"], "Numbers");
  const section = made?.section as PageWidget;
  expect(section).toMatchObject({
    type: "core/section",
    title: "Numbers",
    at: { x: 0, y: 0, w: 12 },
  });
  expect(made?.widgets.find((one) => one.id === "count")).toMatchObject({
    at: { x: 0, y: 0, w: 3, h: 3 },
    in: { widget: section.id },
  });
  // The heading takes a row: what lay below sinks by one.
  expect(made?.widgets.find((one) => one.id === "remind")?.at.y).toBe(4);
  expect(made?.widgets.find((one) => one.id === "invoices")?.at.y).toBe(7);
  expect(section.at.h).toBe(containerHeight(section, made?.widgets ?? []));
  expect(wrapInSection(money0(), ["nothing"], "x")).toBeUndefined();
  expect(
    problems({ title: "t", pages: [{ id: "a", title: "A", widgets: made?.widgets ?? [] }] }),
  ).toEqual([]);
});

test("grouping buttons keeps their order, labels and tones; candidates on the row come first", () => {
  const widgets = money0();
  const remind = widgets.find((one) => one.id === "remind") as PageWidget;
  expect(groupCandidates(widgets, remind).map((one) => one.id)).toEqual(["export", "archive"]);
  const made = groupButtons(widgets, ["archive", "export"]);
  expect(made?.group.at).toMatchObject({ x: 3, y: 3 });
  expect(((made?.group.config?.actions ?? []) as { id: string }[]).map((one) => one.id)).toEqual([
    "export",
    "archive",
  ]);
  expect(made?.widgets.map((one) => one.id)).toEqual([
    "count",
    "total",
    "remind",
    made?.group.id,
    "invoices",
  ]);
  expect(groupButtons(widgets, ["remind"])).toBeUndefined();
});

test("a record detail's actions move to an Action group above it, and the detail keeps none", () => {
  const actions = [
    { id: "paid", label: "Mark paid", action: { steps: [{ do: "message", text: "ok" }] } },
    {
      id: "void",
      label: "Void",
      tone: "danger",
      action: { steps: [{ do: "message", text: "no" }] },
    },
  ];
  const detail: PageWidget = {
    id: "detail",
    type: "core/detail",
    at: { x: 0, y: 0, w: 12, h: 8 },
    data: { record: { source: { record: "this" } } },
    config: { heading: "number", actions },
  };
  const below: PageWidget = { ...table(), at: { x: 0, y: 8, w: 12, h: 4 } };
  const made = detailActionsToGroup([detail, below], "detail");
  expect(made?.group).toMatchObject({
    type: "core/actions",
    at: { x: 0, y: 0, w: 12, h: 1 },
    config: { actions },
  });
  const moved = made?.widgets.find((one) => one.id === "detail");
  expect(moved?.at.y).toBe(1);
  expect(moved?.config?.actions).toBeUndefined();
  expect(moved?.config?.heading).toBe("number");
  expect(made?.widgets.find((one) => one.id === "invoices")?.at.y).toBe(9);
  const body: InterfaceBody = {
    title: "t",
    pages: [
      {
        id: "invoice",
        title: "Invoice",
        kind: "record",
        record: { table: "invoices" },
        widgets: made?.widgets ?? [],
      },
    ],
  };
  expect(problems(body)).toEqual([]);
  expect(detailActionsToGroup([{ ...detail, config: {} }], "detail")).toBeUndefined();
});

// ----- "+ Page" from a table -----

test("the page starters make valid pages: a list with its sheet and form, and a record page", () => {
  const pages = money().pages;
  const list = listPage(invoices, "Invoices", pages);
  expect(list.pages.map((one) => [one.id, one.kind ?? "page"])).toEqual([
    ["invoices", "page"],
    ["invoice-detail", "sheet"],
    ["new-invoice", "modal"],
  ]);
  expect(list.open).toBe("invoices");
  const page = list.pages[0];
  expect(page?.widgets.map((one) => one.type)).toEqual([
    "core/filter",
    "core/button",
    "core/table",
  ]);
  const grid = page?.widgets.find((one) => one.type === "core/table");
  expect(grid?.on?.rowClick).toEqual({
    steps: [{ do: "open", page: "invoice-detail", record: "event" }],
  });
  expect(grid?.data?.rows?.filters).toEqual([{ filter: "search", columns: ["number", "note"] }]);
  expect(page?.widgets.find((one) => one.type === "core/button")).toMatchObject({
    config: { label: "New invoice" },
    on: { click: { steps: [{ do: "open", page: "new-invoice" }] } },
  });
  expect(problems({ title: "t", pages: [...pages, ...list.pages] })).toEqual([]);

  // A sheet or form the app has is used, not made again.
  const again = listPage(invoices, "All invoices", [...pages, ...list.pages]);
  expect(again.pages).toHaveLength(1);
  expect(again.pages[0]?.widgets.find((one) => one.type === "core/table")?.on?.rowClick).toEqual({
    steps: [{ do: "open", page: "invoice-detail", record: "event" }],
  });

  const catalog = {
    tables: [
      { name: "invoices", columns: [{ name: "number", type: "text", references: null }] },
      {
        name: "visits",
        columns: [
          { name: "reason", type: "text", references: null },
          { name: "invoice", type: "reference", references: "invoices" },
        ],
      },
    ],
    queries: [],
    maySql: false,
  };
  const record = recordPage(invoices, "Invoice record", pages, catalog);
  expect(record.pages).toHaveLength(1);
  expect(record.pages[0]).toMatchObject({ kind: "record", record: { table: "invoices" } });
  expect(record.pages[0]?.widgets.map((one) => one.type)).toEqual(["core/detail", "core/table"]);
  expect(record.pages[0]?.widgets[1]?.data?.rows?.source).toEqual({
    visual: {
      table: "visits",
      filters: [{ column: "invoice", op: "eq", value: { record: "id" } }],
    },
  });
  expect(problems({ title: "t", pages: [...pages, ...record.pages] })).toEqual([]);
  expect(blankPage("Reports", pages).pages[0]).toEqual({
    id: "reports",
    title: "Reports",
    widgets: [],
  });
});

test("+ Page starts a list of a table in one step, opens it, and Undo takes all of it back", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Page" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Add a page" }));
  fireEvent.click(await dialog.findByRole("radio", { name: /A list of Invoices/ }));
  expect((dialog.getByLabelText("Name of the page") as HTMLInputElement).value).toBe("Invoices");
  await waitFor(() =>
    expect(
      (dialog.getByRole("button", { name: "Add the page" }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  fireEvent.click(dialog.getByRole("button", { name: "Add the page" }));
  await saved((body) => body.pages.length === 4);
  expect(stored.pages.map((one) => one.id)).toEqual([
    "money",
    "invoices",
    "invoice-detail",
    "new-invoice",
  ]);
  expect(problems(stored)).toEqual([]);
  // The new page is the one shown.
  expect(await screen.findByRole("region", { name: "Page settings" })).toBeTruthy();
  fireEvent.click(await screen.findByRole("button", { name: /^Undo (adding|a)/ }));
  await saved((body) => body.pages.length === 1);
});

test("+ Page starts a record page on a table, with the rows that refer to it", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Page" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Add a page" }));
  fireEvent.click(await dialog.findByRole("radio", { name: /An Invoice record page/ }));
  await waitFor(() =>
    expect(
      (dialog.getByRole("button", { name: "Add the page" }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  fireEvent.click(dialog.getByRole("button", { name: "Add the page" }));
  await saved((body) => body.pages.length === 2);
  const page = stored.pages[1];
  expect(page).toMatchObject({ kind: "record", record: { table: "invoices" } });
  expect(page?.widgets.map((one) => one.type)).toEqual(["core/detail", "core/table"]);
  expect(problems(stored)).toEqual([]);
});

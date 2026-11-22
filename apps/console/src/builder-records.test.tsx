// @vitest-environment happy-dom

import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { filtersOf, type InterfaceBody } from "@volvel/manifest";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { InterfaceBuilder } from "./screens/builder/AppBuilder.tsx";
import { KIND_LINE, pageLine, withKind } from "./screens/builder/pageKinds.ts";
import {
  controlWords,
  defaultPlan,
  detailEdit,
  formEdit,
  formLine,
  formModal,
  formPlacement,
  formWidget,
  onThisRecord,
  type PageContext,
  submitAction,
  type TableInfo,
} from "./screens/builder/records.ts";
import { show } from "./testing.tsx";

// The views of the Record detail, Button and Form are other streams' (B2, B3): until they are in
// the core pack, a page that holds one is drawn with nothing, which is all these tests need of it.
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
let calls: { method: string; url: string; body: unknown }[];
let routes: Record<string, (body: unknown) => [number, unknown]>;
let stored: InterfaceBody;

const at = { x: 0, y: 0, w: 12, h: 8 };
const invoices: TableInfo = {
  name: "invoices",
  columns: [
    { name: "number", type: "text", required: true, values: [] },
    { name: "total", type: "number", required: true, values: [] },
    { name: "status", type: "enum", required: false, values: ["unpaid", "paid"] },
    { name: "customer", type: "reference", required: false, references: "customers", values: [] },
  ],
};
const markPaid = {
  steps: [{ do: "update", record: "event", set: { status: { value: "paid" } } }],
  when: [{ field: "status", of: "event", test: "is_not", value: "paid" }],
};
const money = (): InterfaceBody => ({
  title: "Sales",
  pages: [
    {
      id: "money",
      title: "Money",
      widgets: [
        {
          id: "invoices",
          type: "core/table",
          title: "All invoices",
          at,
          data: { rows: { source: { visual: { table: "invoices" } } } },
          config: { rowActions: [{ id: "mark-paid", label: "Mark paid", action: markPaid }] },
        },
      ],
    },
  ],
});

beforeEach(() => {
  calls = [];
  history.replaceState(null, "", "/");
  stored = money();
  routes = {
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
    [`GET ${api}/tables/invoices`]: () => [
      200,
      {
        columns: [
          { name: "number", type: "text", required: true, status: "active" },
          { name: "total", type: "number", required: true, status: "active" },
          { name: "status", type: "enum", values: ["unpaid", "paid"], status: "active" },
          { name: "customer", type: "reference", references: "customers", status: "active" },
        ],
      },
    ],
    [`GET ${api}/rows/invoices`]: () => [
      200,
      {
        items: [
          { id: "r1", number: "INV-9339", total: 113, status: "unpaid" },
          { id: "r2", number: "INV-9340", total: 65, status: "paid" },
        ],
        nextCursor: null,
      },
    ],
    [`GET ${api}/queries/schema`]: () => [
      200,
      {
        tables: [
          {
            name: "invoices",
            columns: [
              { name: "number", type: "text", references: null },
              { name: "total", type: "number", references: null },
              { name: "status", type: "enum", references: null },
              { name: "customer", type: "reference", references: "customers" },
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
    calls.push({ method, url: address, body: sent });
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
const pageOf = (id: string) => stored.pages.find((page) => page.id === id);

test("a page's kind is listed beside it, set in its settings, and a page is reordered and removed", async () => {
  stored.pages.push({
    id: "invoice-detail",
    title: "Invoice detail",
    kind: "sheet",
    record: { table: "invoices" },
    widgets: [],
  });
  await open();
  expect(pageLine(stored.pages[1] as never)).toBe("Invoice detail — Side sheet");
  const list = within(
    screen.getByRole("heading", { name: "Pages" }).closest("section") as HTMLElement,
  );
  expect(list.getByRole("button", { name: /Money\s*Page/ })).toBeTruthy();
  expect(list.getByRole("button", { name: /Invoice detail\s*Side sheet/ })).toBeTruthy();

  // Choosing a page shows its own settings.
  fireEvent.click(list.getByRole("button", { name: /Money\s*Page/ }));
  const settings = within(await screen.findByRole("region", { name: "Page settings" }));
  expect(settings.getByText(KIND_LINE)).toBeTruthy();
  fireEvent.click(settings.getByRole("radio", { name: "Modal" }));
  await saved((body) => body.pages[0]?.kind === "modal");
  // A modal that makes a new record opens on none; a side sheet opens on one, so the table of it is asked.
  expect(pageOf("money")?.record).toBeUndefined();
  fireEvent.click(settings.getByRole("radio", { name: "Side sheet" }));
  await saved((body) => body.pages[0]?.kind === "sheet");
  expect(pageOf("money")?.record).toEqual({ table: "invoices" });
  // The table of its record is on the Data tab.
  fireEvent.click(settings.getByRole("tab", { name: /^Data/ }));
  expect(settings.getByLabelText("Table of its record")).toBeTruthy();
  fireEvent.click(settings.getByRole("tab", { name: /^Display/ }));
  fireEvent.click(settings.getByRole("radio", { name: "Page" }));
  await saved((body) => body.pages[0]?.kind === undefined && body.pages[0]?.record === undefined);

  // Reordered.
  fireEvent.click(list.getByRole("button", { name: "Move Money down" }));
  await saved((body) => body.pages.map((page) => page.id).join() === "invoice-detail,money");

  // Renamed: the title is the one in the app's menu.
  fireEvent.change((await screen.findAllByLabelText("Title in the app menu"))[0] as HTMLElement, {
    target: { value: "Takings" },
  });
  await saved((body) => body.pages.some((page) => page.title === "Takings"));

  // Removed, after asking.
  fireEvent.click(screen.getByRole("button", { name: /^More about / }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Remove page" }));
  fireEvent.click(
    await within(await screen.findByRole("dialog")).findByRole("button", {
      name: "Remove the page",
    }),
  );
  await saved((body) => body.pages.length === 1);
});

test("a side sheet is previewed with a sample record, and another can be chosen", async () => {
  stored.pages.push({
    id: "invoice-detail",
    title: "Invoice detail",
    kind: "sheet",
    record: { table: "invoices" },
    widgets: [
      {
        id: "detail",
        type: "core/detail",
        at,
        data: { record: { source: { record: "this" } } },
        config: { heading: "number" },
      },
    ],
  });
  await open();
  fireEvent.click(screen.getByRole("button", { name: /Invoice detail\s*Side sheet/ }));
  expect(await screen.findByText(/Preview of/)).toBeTruthy();
  expect(screen.getByText(/Preview of/).textContent).toBe("Preview of Invoice detail for INV-9339");
  // The page is drawn at a sheet's width, and its widgets are read for that record.
  expect(document.querySelector("[data-page-kind=sheet]")).toBeTruthy();
  await waitFor(() =>
    expect(
      calls.some((call) => call.url.includes("/widget-data") && call.url.includes("record=r1")),
    ).toBe(true),
  );
  fireEvent.change(screen.getByLabelText("Preview with another record"), {
    target: { value: "r2" },
  });
  await waitFor(() =>
    expect(
      calls.some((call) => call.url.includes("/widget-data") && call.url.includes("record=r2")),
    ).toBe(true),
  );
  expect(screen.getByText(/Preview of/).textContent).toBe("Preview of Invoice detail for INV-9340");
});

test("a table that does nothing on a click can be made to open an Invoice detail, which makes the sheet and the click", async () => {
  await open();
  fireEvent.click(screen.getAllByRole("button", { name: "All invoices" })[0] as HTMLElement);
  // The click is the table's Actions tab.
  fireEvent.click(await screen.findByRole("tab", { name: /^Actions/ }));
  const offer = within(
    (await screen.findAllByRole("region", { name: "When a row is clicked" })).at(-1) as HTMLElement,
  );
  fireEvent.click(await offer.findByRole("radio", { name: /Open record detail/ }));
  await saved((_body) => pageOf("invoice-detail") !== undefined);
  const sheet = pageOf("invoice-detail");
  expect(sheet).toMatchObject({
    kind: "sheet",
    record: { table: "invoices" },
    title: "Invoice detail",
  });
  const detail = sheet?.widgets[0];
  expect(detail).toMatchObject({
    type: "core/detail",
    data: { record: { source: { record: "this" } } },
    config: { heading: "number", status: "status" },
  });
  expect(
    (detail?.config?.fields as { column: string }[] | undefined)?.map((field) => field.column),
  ).toEqual(["total", "customer"]);
  // The row actions go with it, and read the record it is open on.
  expect((detail?.config?.actions as { action: unknown }[] | undefined)?.[0]?.action).toMatchObject(
    {
      steps: [{ do: "update", record: "this" }],
      when: [{ field: "status", of: "this" }],
    },
  );
  expect(pageOf("money")?.widgets[0]?.on?.rowClick).toEqual({
    steps: [{ do: "open", page: "invoice-detail", record: "event" }],
  });
  // With a detail for the table, the offer is to open it.
  fireEvent.click(screen.getAllByRole("button", { name: "All invoices" })[0] as HTMLElement);
  // The click is the table's Actions tab.
  fireEvent.click(await screen.findByRole("tab", { name: /^Actions/ }));
  const again = within(
    (await screen.findAllByRole("region", { name: "When a row is clicked" })).at(-1) as HTMLElement,
  );
  expect(
    (again.getByRole("radio", { name: /Open record detail/ }) as HTMLInputElement).checked,
  ).toBe(true);
  expect(again.getByLabelText("Record detail")).toBeTruthy();
  expect(again.getByRole("radio", { name: "Side sheet" })).toBeTruthy();
});

test("Add a form writes the form, the modal it opens in and the button that opens it", async () => {
  await open();
  fireEvent.click(screen.getAllByRole("button", { name: "Add to page" })[0] as HTMLElement);
  fireEvent.click(
    await within(await screen.findByRole("dialog", { name: "Add to page" })).findByRole("button", {
      name: /Form/,
    }),
  );
  const dialog = within(await screen.findByRole("dialog", { name: "Add a form" }));
  expect((await dialog.findAllByText("Picker · customers")).length).toBeGreaterThan(0);
  expect(dialog.getByText(/Set automatically/)).toBeTruthy();
  expect(dialog.getByText(/Also adds a “New invoice” button/)).toBeTruthy();
  // A modal named as a page of the app already is said to be so.
  const title = dialog.getByLabelText(/Title of the modal/);
  expect(dialog.queryByText(/already called/)).toBeNull();
  fireEvent.change(title, { target: { value: "Money" } });
  expect(dialog.getByText(/already called “Money”/)).toBeTruthy();
  fireEvent.change(title, { target: { value: "New invoice" } });
  fireEvent.click(dialog.getByRole("button", { name: "Create form" }));
  await saved((_body) => pageOf("new-invoice") !== undefined);
  const modal = pageOf("new-invoice");
  expect(modal).toMatchObject({ kind: "modal", title: "New invoice" });
  expect(modal?.record).toBeUndefined();
  expect(modal?.widgets[0]).toMatchObject({
    type: "core/form",
    config: {
      mode: "create",
      submit: {
        steps: [
          {
            do: "create",
            table: "invoices",
            set: {
              number: { asked: "number" },
              total: { asked: "total" },
              status: { asked: "status" },
              customer: { asked: "customer" },
            },
          },
          { do: "close" },
          { do: "message", text: "Invoice created" },
        ],
      },
    },
  });
  // The page has the Invoices table, so the button goes on it, not beside it.
  const grid = pageOf("money")?.widgets.find((widget) => widget.id === "invoices");
  expect(grid?.config?.buttons).toMatchObject([
    { label: "New invoice", action: { steps: [{ do: "open", page: "new-invoice" }] } },
  ]);
  expect(pageOf("money")?.widgets.some((widget) => widget.type === "core/button")).toBe(false);
});

test("Add to page suggests what follows from the table the page shows, each correctly connected", async () => {
  // The table has no "Mark paid" yet.
  delete stored.pages[0]?.widgets[0]?.config;
  await open();
  const suggestions = async () => {
    fireEvent.click(screen.getAllByRole("button", { name: "Add to page" })[0] as HTMLElement);
    const dialog = within(await screen.findByRole("dialog", { name: "Add to page" }));
    return within(await dialog.findByRole("region", { name: "Suggested for Invoices" }));
  };
  let next = await suggestions();
  expect(next.getByRole("heading", { name: "Suggested for this page" })).toBeTruthy();
  expect(next.getByRole("button", { name: /^Invoice detail/ })).toBeTruthy();
  expect(next.getByRole("button", { name: /^New invoice form/ })).toBeTruthy();
  fireEvent.click(next.getByRole("button", { name: /^Mark paid button/ }));
  // On a page of rows the button belongs to each row, and does what the row says.
  await saved((body) => body.pages[0]?.widgets[0]?.config?.rowActions !== undefined);
  expect(pageOf("money")?.widgets[0]?.config?.rowActions).toMatchObject([
    {
      label: "Mark paid",
      action: { steps: [{ do: "update", record: "event", set: { status: { value: "paid" } } }] },
    },
  ]);
  next = await suggestions();
  expect(next.queryByRole("button", { name: /^Mark paid button/ })).toBeNull();
  fireEvent.click(next.getByRole("button", { name: /^Status filter/ }));
  await saved((body) => filtersOf(body.pages[0]?.widgets ?? []).length === 1);
  expect(filtersOf(pageOf("money")?.widgets ?? [])[0]).toEqual({
    name: "status",
    label: "Status",
    type: "choice",
    from: { table: "invoices", column: "status" },
  });
  // The table is narrowed by it.
  expect(
    pageOf("money")?.widgets.find((one) => one.type === "core/table")?.data?.rows?.filters,
  ).toEqual([{ filter: "status", column: "status" }]);
});

test("what is written is the same when it is made without the screen", () => {
  const context: PageContext = {
    widgets: money().pages[0]?.widgets ?? [],
    filters: [],
    pages: money().pages,
    page: money().pages[0] as never,
  };
  const made = detailEdit(context, context.widgets[0] as never, invoices);
  expect(made.addPages[0]?.id).toBe("invoice-detail");
  const form = formEdit(context, { ...defaultPlan(invoices), where: "page" });
  expect(form.addPages).toEqual([]);
  expect(form.widgets.at(-1)).toMatchObject({
    type: "core/form",
    data: { record: { source: { visual: { table: "invoices" } } } },
  });
  const edit = formEdit(
    {
      ...context,
      page: { ...(context.page as object), kind: "record", record: { table: "invoices" } } as never,
    },
    defaultPlan(invoices, "edit"),
  );
  expect(edit.addPages[0]).toMatchObject({ kind: "modal", record: { table: "invoices" } });
  // The page has the table, so each of its rows can open the form.
  expect(edit.widgets.find((one) => one.id === "invoices")?.config?.rowActions).toContainEqual(
    expect.objectContaining({
      label: "Edit invoice",
      action: { steps: [{ do: "open", page: "edit-invoice", record: "event" }] },
    }),
  );
  expect(onThisRecord(markPaid as never).steps[0]).toMatchObject({ record: "this" });
  expect(withKind({ id: "a", title: "A", widgets: [] }, "sheet", "invoices")).toMatchObject({
    kind: "sheet",
    record: { table: "invoices" },
  });
});

test("the row click editor writes each choice, and Opens as changes the detail's kind", async () => {
  await open();
  fireEvent.click(screen.getAllByRole("button", { name: "All invoices" })[0] as HTMLElement);
  // The click is the table's Actions tab.
  fireEvent.click(await screen.findByRole("tab", { name: /^Actions/ }));
  let offer = within(
    (await screen.findAllByRole("region", { name: "When a row is clicked" })).at(-1) as HTMLElement,
  );
  fireEvent.click(await offer.findByRole("radio", { name: /Open record detail/ }));
  await saved(() => pageOf("invoice-detail") !== undefined);
  offer = within(
    (await screen.findAllByRole("region", { name: "When a row is clicked" })).at(-1) as HTMLElement,
  );
  fireEvent.click(await offer.findByRole("radio", { name: "Modal" }));
  await saved(() => pageOf("invoice-detail")?.kind === "modal");
  fireEvent.click(
    within(
      (await screen.findAllByRole("region", { name: "When a row is clicked" })).at(
        -1,
      ) as HTMLElement,
    ).getByRole("radio", {
      name: /Do nothing/,
    }),
  );
  await saved(() => pageOf("money")?.widgets[0]?.on?.rowClick === undefined);
  expect(pageOf("invoice-detail")?.kind).toBe("modal");
});

test("Add a form draws the form live from the checked fields, and makes the same body", async () => {
  await open();
  fireEvent.click(screen.getAllByRole("button", { name: "Add to page" })[0] as HTMLElement);
  fireEvent.click(
    await within(await screen.findByRole("dialog", { name: "Add to page" })).findByRole("button", {
      name: /^Form/,
    }),
  );
  const dialog = within(await screen.findByRole("dialog", { name: "Add a form" }));
  const preview = within(dialog.getByLabelText("Preview"));
  await waitFor(() => expect(preview.getAllByText(/Customer/).length).toBeGreaterThan(0));
  fireEvent.click(dialog.getByRole("checkbox", { name: "Customer" }));
  await waitFor(() => expect(preview.queryAllByText(/Customer/).length).toBe(0));
  expect(dialog.getByText(/Required marks and checks come from the table/)).toBeTruthy();
  fireEvent.click(dialog.getByRole("button", { name: "Create form" }));
  await saved(() => pageOf("new-invoice") !== undefined);
  const submit = pageOf("new-invoice")?.widgets[0]?.config?.submit as
    | { steps: { set?: Record<string, unknown> }[] }
    | undefined;
  const set = submit?.steps[0]?.set;
  expect(Object.keys(set ?? {})).toEqual(["number", "total", "status"]);
});

test("a new form starts a date today, and the Add a form row says so", () => {
  const dated: TableInfo = {
    name: "invoices",
    columns: [
      { name: "number", type: "text", required: true, values: [] },
      { name: "issued_on", type: "date", required: false, values: [] },
    ],
  };
  const make = (mode: "create" | "edit") =>
    formEdit(
      { widgets: [], filters: [], pages: [], page: { id: "p", title: "P", widgets: [] } as never },
      { ...defaultPlan(dated, mode), where: "page" },
    ).widgets.at(-1) as unknown as { config: { fields: unknown[] } };
  expect(make("create").config.fields).toEqual([
    { column: "number", required: true },
    { column: "issued_on", initial: { kind: "today" } },
  ]);
  expect(make("edit").config.fields).toEqual([
    { column: "number", required: true },
    { column: "issued_on" },
  ]);
  expect(controlWords(dated.columns[1] as never, "create")).toBe("Date · today by default");
  expect(controlWords(dated.columns[1] as never, "edit")).toBe("Date");
});

test("the button of a form goes on the table, and the line under Add a form says where", () => {
  const table = (id: string, more: object = {}) => ({
    id,
    type: "core/table",
    at,
    data: { rows: { source: { visual: { table: "invoices" } } } },
    ...more,
  });
  const context = (widgets: object[], record?: string) =>
    ({
      widgets,
      filters: [],
      pages: [],
      page: {
        id: "p",
        title: "P",
        widgets: [],
        ...(record ? { kind: "record", record: { table: record } } : {}),
      },
    }) as never as PageContext;
  const plan = (mode: "create" | "edit") => ({
    ...defaultPlan(invoices, mode),
    where: "modal" as const,
  });

  // One table: its `buttons` gain the button, in one edit, and no widget is added.
  const one = context([table("a")]);
  const made = formEdit(one, plan("create"));
  expect(made.widgets).toHaveLength(1);
  expect(made.widgets[0]?.config?.buttons).toEqual([
    {
      id: "new",
      label: "New invoice",
      tone: "primary",
      action: { steps: [{ do: "open", page: made.addPages[0]?.id }] },
    },
  ]);
  expect(formLine(plan("create"), formPlacement(one, plan("create")))).toBe(
    "Also adds a “New invoice” button to the Invoices table.",
  );
  // Several: the one it was added from, else the first, said in the line.
  const two = context([table("a"), table("b")]);
  expect(
    formEdit(two, plan("create"), "b").widgets.map(
      (w) => (w.config?.buttons as unknown[] | undefined)?.length ?? 0,
    ),
  ).toEqual([0, 1]);
  expect(
    formEdit(two, plan("create")).widgets.map(
      (w) => (w.config?.buttons as unknown[] | undefined)?.length ?? 0,
    ),
  ).toEqual([1, 0]);
  expect(formLine(plan("create"), formPlacement(two, plan("create")))).toMatch(/the first/);
  // None: a button at the end of the page, said so.
  const none = context([]);
  expect(formEdit(none, plan("create")).widgets).toHaveLength(1);
  expect(formEdit(none, plan("create")).widgets[0]?.type).toBe("core/button");
  expect(formLine(plan("create"), formPlacement(none, plan("create")))).toMatch(
    /no Invoices table/,
  );
  // Edit: a row action on the table; with no table, a button only on a record page of it.
  expect(formEdit(one, plan("edit")).widgets[0]?.config?.rowActions).toEqual([
    {
      id: "edit",
      label: "Edit invoice",
      action: { steps: [{ do: "open", page: "edit-invoice", record: "event" }] },
    },
  ]);
  expect(formLine(plan("edit"), formPlacement(one, plan("edit")))).toMatch(/to each row/);
  expect(formEdit(none, plan("edit")).widgets).toHaveLength(0);
  expect(formLine(plan("edit"), formPlacement(none, plan("edit")))).toMatch(
    /No button is added here/,
  );
  expect(formEdit(context([], "invoices"), plan("edit")).widgets).toHaveLength(1);
});

test("each After saving choice writes the steps it says", () => {
  const base = defaultPlan(invoices);
  const steps = (plan: typeof base) => submitAction(plan).steps.map((one) => one.do);
  expect(steps({ ...base, where: "modal" })).toEqual(["create", "close", "message"]);
  expect(steps({ ...base, where: "modal", message: "" })).toEqual(["create", "close"]);
  expect(steps({ ...base, where: "page" })).toEqual(["create", "message"]);
  expect(steps({ ...base, where: "page", message: "" })).toEqual(["create"]);
  expect(steps({ ...defaultPlan(invoices, "edit"), where: "modal" })[0]).toBe("update");
});

test("a form in a modal leaves the title to the modal, and one on the page keeps its own", () => {
  const modal = formModal({ ...defaultPlan(invoices), where: "modal" }, []);
  expect(modal.widgets[0]?.title).toBeUndefined();
  const onPage = formWidget({ ...defaultPlan(invoices), where: "page" }, "f", {
    x: 0,
    y: 0,
    w: 12,
    h: 10,
  });
  expect(onPage.title).toBe("New invoice");
});

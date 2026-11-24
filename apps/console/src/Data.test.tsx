// @vitest-environment happy-dom
import { cleanup, configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { parseValue } from "@volvel/ui";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetPreferences } from "./prefs.ts";
import { navigate } from "./router.tsx";
import {
  bodyToRestore,
  moveColumn,
  nextSort,
  pickerFilter,
  Sources,
  SourceView,
  Tables,
  TableView,
  toFilter,
  viewsOf,
} from "./screens/Data.tsx";
import { answer, show } from "./testing.tsx";

// The whole suite runs in parallel with tests that use a database, so waits are generous.
configure({ asyncUtilTimeout: 5000 });

const root = "/tenants/t1/workspaces/w1";
let calls: { method: string; url: string; body: unknown }[];
let routes: Record<string, (body: unknown, url: URL) => [number, unknown]>;

const orders = (managedIn: string) => ({
  name: "orders",
  status: "active",
  managedIn,
  policy: { type: "owner", column: "owner_id" },
  rowCount: 2,
  stored: { schema: "ws_abc", table: "orders" },
  columns: [
    {
      name: "number",
      type: "text",
      required: true,
      unique: true,
      default: null,
      references: null,
      status: "active",
      held: null,
    },
    {
      name: "total",
      type: "number",
      required: false,
      unique: false,
      default: 0,
      references: null,
      status: "active",
      held: null,
    },
    {
      name: "owner_id",
      type: "uuid",
      required: false,
      unique: false,
      default: null,
      references: null,
      status: "active",
      held: null,
    },
    {
      name: "notes",
      type: "text",
      required: false,
      unique: false,
      default: null,
      references: null,
      status: "retired",
      held: 2,
    },
  ],
});
const rows = [
  {
    id: "r1",
    number: "A-1",
    total: 10,
    owner_id: null,
    created_at: "2026-11-01T10:00:00.000Z",
    updated_at: "2026-11-01T10:00:00.000Z",
  },
  {
    id: "r2",
    number: "A-2",
    total: 250,
    owner_id: null,
    created_at: "2026-11-02T10:00:00.000Z",
    updated_at: "2026-11-02T10:00:00.000Z",
  },
];

beforeEach(() => {
  calls = [];
  routes = {
    [`GET /api/v1${root}/tables/orders`]: () => [200, orders("code")],
    [`GET /api/v1${root}/rows/orders`]: () => [200, { items: rows, nextCursor: "NTA" }],
  };
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const url = new URL(address, "http://console.test");
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, url: `${url.pathname}${url.search}`, body });
    const handler = routes[`${method} ${url.pathname}`];
    const [status, answer] = handler
      ? handler(body, url)
      : [404, { status: 404, detail: `No mock for ${method} ${url.pathname}` }];
    return new Response(answer === null ? "" : JSON.stringify(answer), { status });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const asked = (index: number) => new URL(calls[index]?.url ?? "", "http://x").searchParams;
const lastRows = () =>
  asked(calls.findLastIndex((call) => call.method === "GET" && call.url.includes("/rows/orders")));

test("a table's rows are browsed with sorting, filters and paging", async () => {
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  await screen.findByText("A-1");
  expect(
    screen.getByText(/2 rows\. Each person sees their own rows \(owner_id\)\. Managed as code\./),
  ).toBeTruthy();
  expect(screen.getByText(/^2 rows on this page/)).toBeTruthy();

  fireEvent.click(screen.getByRole("columnheader", { name: /^total/ }));
  await waitFor(() => expect(lastRows().get("sort")).toBe("total"));
  fireEvent.click(screen.getByRole("columnheader", { name: /^total/ }));
  await waitFor(() => expect(lastRows().get("sort")).toBe("-total"));

  fireEvent.change(screen.getByLabelText("Filter by total"), { target: { value: "> 100" } });
  fireEvent.change(screen.getByLabelText("Filter by number"), { target: { value: "A-" } });
  await waitFor(() =>
    expect(JSON.parse(lastRows().get("filter") ?? "null")).toEqual({
      and: [
        { column: "number", op: "contains", value: "A-" },
        { column: "total", op: "gt", value: 100 },
      ],
    }),
  );

  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() => expect(lastRows().get("cursor")).toBe("NTA"));
  await waitFor(() => expect(screen.getByRole("button", { name: "Previous" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Previous" }));
  await waitFor(() => expect(lastRows().get("cursor")).toBeNull());

  // A filter that is not the column's type is explained and sends nothing wrong.
  fireEvent.change(screen.getByLabelText("Filter by total"), { target: { value: "lots" } });
  expect((await screen.findByRole("alert")).textContent).toBe("total: Enter a number.");
});

test("a value is changed in place, and a row is added and deleted", async () => {
  routes[`PATCH /api/v1${root}/row/r1/orders`] = (body) => [
    200,
    { ...rows[0], ...(body as object) },
  ];
  routes[`POST /api/v1${root}/rows/orders`] = (body) =>
    (body as { number?: string }).number
      ? [201, { items: [{ id: "r3", ...(body as object) }] }]
      : [
          400,
          {
            status: 400,
            detail: "The row is not valid.",
            errors: [{ path: "/number", message: "is required" }],
          },
        ];
  routes[`POST /api/v1${root}/row-deletions/orders`] = () => [
    200,
    { deleted: ["r2"], missing: [] },
  ];
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);

  // Each element that appears after an action is waited for: under a loaded machine the
  // screen may not have caught up by the next line.
  // A cell is changed where it is: double-clicked here, or Enter or F2 from the keyboard.
  fireEvent.doubleClick(await screen.findByText("10"));
  const editing = await screen.findByLabelText("total");
  fireEvent.input(editing, { target: { value: "15" } });
  fireEvent.focusOut(editing);
  await screen.findByText("15");
  await waitFor(() =>
    expect(calls.find((call) => call.method === "PATCH")?.body).toEqual({ total: 15 }),
  );
  // The platform's own columns cannot be edited.
  expect(screen.getByText("r1").closest("button")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Add row" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.input(await screen.findByLabelText("total", { selector: "input[name=total]" }), {
    target: { value: "7" },
  });
  fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
  expect(await screen.findByText("number needs a value.")).toBeTruthy();
  fireEvent.input(screen.getByLabelText("number", { selector: "input[name=number]" }), {
    target: { value: "A-3" },
  });
  fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
  await waitFor(() =>
    expect(calls.filter((call) => call.method === "POST").at(-1)?.body).toEqual({
      number: "A-3",
      total: 7,
    }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  // Rows are checked, then deleted together.
  fireEvent.click(await screen.findByLabelText("Check row r2"));
  fireEvent.click(
    within(screen.getByRole("toolbar", { name: "What to do with the checked rows" })).getByRole(
      "button",
      { name: "Delete" },
    ),
  );
  await answer("Delete the row");
  await waitFor(() =>
    expect(
      calls.find((call) => call.method === "POST" && call.url.endsWith("/row-deletions/orders"))
        ?.body,
    ).toEqual({ ids: ["r2"] }),
  );
});

test("a table from the repository is read-only in its definition, and shows what retired columns hold", async () => {
  routes[`POST /api/v1${root}/table-purges`] = () => [200, { dropped: "orders.notes" }];
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Definition" }));
  expect(screen.getByText(/defined in code, in the tenant's repository/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Add column" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Retire" })).toBeNull();
  expect(screen.getByText("2 values")).toBeTruthy();
  expect(screen.getByText("ws_abc.orders")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Delete for good" }));
  // Nothing is destroyed until its name is typed.
  await answer("Delete for good", "notes");
  await waitFor(() =>
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({
      table: "orders",
      column: "notes",
    }),
  );
});

test("a table made in the console is changed by saving its definition", async () => {
  const body = {
    columns: {
      number: { type: "text", required: true, unique: true },
      total: { type: "number", default: 0 },
      owner_id: { type: "uuid" },
    },
    policy: { type: "owner", column: "owner_id" },
  };
  routes[`GET /api/v1${root}/tables/orders`] = () => [200, orders("ui")];
  routes[`GET /api/v1${root}/resources/orders`] = () => [200, { body }];
  routes[`PUT /api/v1${root}/resources/orders`] = () => [200, {}];
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Definition" }));
  const saved = () =>
    calls.filter((call) => call.method === "PUT").at(-1)?.body as {
      ownership: string;
      body: typeof body & { columns: Record<string, unknown> };
    };

  fireEvent.click(screen.getAllByRole("button", { name: "Rename" })[1] as HTMLElement);
  await answer("Rename", "amount");
  await waitFor(() =>
    expect(saved()?.body.columns).toEqual({
      number: body.columns.number,
      owner_id: body.columns.owner_id,
      amount: { type: "number", default: 0, renamedFrom: "total" },
    }),
  );
  expect(saved().ownership).toBe("ui");

  fireEvent.click(screen.getAllByRole("button", { name: "Retire" })[1] as HTMLElement);
  await answer("Retire");
  await waitFor(() => expect(Object.keys(saved().body.columns)).toEqual(["number", "owner_id"]));

  fireEvent.click(screen.getByRole("button", { name: "Bring back" }));
  await waitFor(() => expect(saved().body.columns.notes).toEqual({ type: "text" }));

  fireEvent.click(screen.getByRole("button", { name: "Add column" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.input(screen.getByLabelText("Name"), { target: { value: "paid" } });
  fireEvent.change(screen.getByLabelText("It holds"), { target: { value: "boolean" } });
  // A yes/no column is given its value by a choice, not by typing a word.
  fireEvent.change(screen.getByLabelText("Value when none is given"), {
    target: { value: "false" },
  });
  fireEvent.change(screen.getByLabelText("Must every row's value be different?"), {
    target: { value: "yes" },
  });
  fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
  await waitFor(() =>
    expect(saved().body.columns.paid).toEqual({ type: "boolean", default: false, unique: true }),
  );
  // It says what was made, not only that something was.
  expect(await screen.findByText("The column paid was added.")).toBeTruthy();
});

test("a refused save of an enum's values or a reference's rule keeps its dialog open, with what was typed", async () => {
  const table = orders("ui");
  const columns = table.columns as Record<string, unknown>[];
  columns.push(
    {
      name: "state",
      type: "enum",
      values: [{ value: "open" }, { value: "closed" }],
      required: false,
      unique: false,
      default: null,
      references: null,
      status: "active",
      held: null,
    },
    {
      name: "customer",
      type: "uuid",
      required: false,
      unique: false,
      default: null,
      references: "customers",
      status: "active",
      held: null,
    },
  );
  routes[`GET /api/v1${root}/tables/orders`] = () => [200, table];
  routes[`GET /api/v1${root}/resources/orders`] = () => [
    200,
    {
      body: {
        columns: {
          state: { type: "enum", values: ["open", "closed"] },
          customer: { type: "uuid", references: "customers" },
        },
      },
    },
  ];
  routes[`PUT /api/v1${root}/resources/orders`] = () => [
    400,
    { status: 400, code: "invalid", detail: "A row rule needs the value open." },
  ];
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Definition" }));

  fireEvent.click(await screen.findByRole("button", { name: "Values" }));
  let dialog = await screen.findByRole("dialog");
  const first = within(dialog).getAllByLabelText("Value")[0] as HTMLInputElement;
  fireEvent.input(first, { target: { value: "opened" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  expect(await within(dialog).findByText(/A row rule needs the value open\./)).toBeTruthy();
  expect(screen.getByRole("dialog")).toBe(dialog);
  expect((within(dialog).getAllByLabelText("Value")[0] as HTMLInputElement).value).toBe("opened");
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  // It was said in the dialog, and is not said again over the columns.
  expect(screen.queryByText(/A row rule needs the value open\./)).toBeNull();

  fireEvent.click(await screen.findByRole("button", { name: "On delete" }));
  dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText(/What happens to the row/), {
    target: { value: "cascade" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  expect(await within(dialog).findByText(/A row rule needs the value open\./)).toBeTruthy();
  expect(
    (within(dialog).getByLabelText(/What happens to the row/) as HTMLSelectElement).value,
  ).toBe("cascade");

  // Saved, it closes.
  routes[`PUT /api/v1${root}/resources/orders`] = () => [200, {}];
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

test("an external source's tables are browsed, and one without a key cannot be changed", async () => {
  routes[`GET /api/v1${root}/data-source-tables/erp`] = () => [
    200,
    {
      items: [
        {
          name: "customers",
          key: "id",
          columns: [
            { name: "id", type: "integer", required: true, writable: true },
            { name: "name", type: "text", required: true, writable: true },
          ],
        },
        {
          name: "log",
          key: null,
          columns: [{ name: "message", type: "text", required: false, writable: true }],
        },
      ],
    },
  ];
  routes[`GET /api/v1${root}/source-rows/customers/erp`] = () => [
    200,
    { items: [{ id: 1, name: "Ada" }], nextCursor: null },
  ];
  routes[`GET /api/v1${root}/source-rows/log/erp`] = () => [
    200,
    { items: [{ message: "hello" }], nextCursor: null },
  ];
  routes[`PATCH /api/v1${root}/source-row/customers/1/erp`] = (body) => [
    200,
    { id: 1, ...(body as object) },
  ];
  show(<SourceView root={root} path="erp" link="/t/t1/workspaces/w1" />);
  fireEvent.doubleClick(await screen.findByText("Ada"));
  fireEvent.input(await screen.findByLabelText("name"), { target: { value: "Ada L." } });
  fireEvent.focusOut(screen.getByLabelText("name"));
  await screen.findByText("Ada L.");

  fireEvent.click(screen.getByRole("button", { name: "log" }));
  await screen.findByText("hello");
  expect(screen.getByText(/no primary key/)).toBeTruthy();
  expect(screen.getByText("hello").closest("button")).toBeNull();
  expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  // What the note says can be done is offered (DAT-23).
  expect(screen.getByText(/rows can be added but not changed or deleted/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Add row" })).toBeTruthy();
});

test("DAT-23, DAT-21: a table with no key is added to, and a table's name with a space is encoded in its address", async () => {
  routes[`GET /api/v1${root}/data-source-tables/erp`] = () => [
    200,
    {
      items: [
        {
          name: "order items",
          key: null,
          columns: [{ name: "what", type: "text", required: false, writable: true }],
        },
      ],
    },
  ];
  routes[`GET /api/v1${root}/source-rows/order%20items/erp`] = () => [
    200,
    { items: [{ what: "pen" }], nextCursor: null },
  ];
  routes[`POST /api/v1${root}/source-rows/order%20items/erp`] = (body) => [201, { items: [body] }];
  show(<SourceView root={root} path="erp" link="/t/t1/workspaces/w1" />);
  await screen.findByText("pen");
  fireEvent.click(screen.getByRole("button", { name: "Add row" }));
  fireEvent.input(await screen.findByLabelText("what"), { target: { value: "ink" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Add row" }).at(-1) as HTMLElement);
  await waitFor(() => expect(calls.some((call) => call.method === "POST")).toBe(true));
});

test("a source's column the database fills in is not asked for when a row is added (P31)", async () => {
  routes[`GET /api/v1${root}/data-source-tables/erp`] = () => [
    200,
    {
      items: [
        {
          name: "customers",
          key: "id",
          columns: [
            { name: "id", type: "integer", required: true, hasDefault: true, writable: true },
            { name: "name", type: "text", required: true, hasDefault: false, writable: true },
          ],
        },
      ],
    },
  ];
  routes[`GET /api/v1${root}/source-rows/customers/erp`] = () => [
    200,
    { items: [{ id: 1, name: "Ada" }], nextCursor: null },
  ];
  routes[`POST /api/v1${root}/source-rows/customers/erp`] = (body) => [201, body];
  show(<SourceView root={root} path="erp" link="/t/t1/workspaces/w1" />);
  await screen.findByText("Ada");
  fireEvent.click(screen.getByRole("button", { name: "Add row" }));
  fireEvent.input(await screen.findByLabelText("name"), { target: { value: "Bo" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Add row" }).at(-1) as HTMLElement);
  await waitFor(() => expect(calls.some((call) => call.method === "POST")).toBe(true));
  expect(screen.queryByText("id needs a value.")).toBeNull();
  expect(calls.find((call) => call.method === "POST")?.body).toEqual({ name: "Bo" });
});

test("the Data sources screens use the product's words, not the platform (P31)", async () => {
  // A description read in an earlier test is folded behind help: start as a first visit.
  localStorage.clear();
  resetPreferences();
  routes[`GET /api/v1${root}/data-source-tables/erp`] = () => [200, { items: [] }];
  routes[`GET /api/v1${root}/data-source-bindings`] = () => [200, { items: [] }];
  show(<SourceView root={root} path="erp" link="/t/t1/workspaces/w1" />);
  await screen.findByText(/An external database/);
  expect(document.body.textContent).not.toMatch(/the platform/i);
  cleanup();
  show(<Sources root={root} link="/t/t1/workspaces/w1" />);
  await waitFor(() => expect(document.body.textContent).toContain("outside Volvel"));
  expect(document.body.textContent).not.toMatch(/the platform/i);
});

test("filter text becomes a filter of the column's type", () => {
  expect(toFilter("text", " ada ")).toEqual({ op: "contains", value: "ada" });
  expect(toFilter("text", "!~ ada")).toEqual({ op: "not_contains", value: "ada" });
  expect(() => toFilter("integer", "!~5")).toThrow(/Only text/);
  expect(toFilter("integer", ">= 5")).toEqual({ op: "gte", value: 5 });
  expect(toFilter("boolean", "yes")).toEqual({ op: "eq", value: true });
  expect(toFilter("date", "< 2026-01-01")).toEqual({ op: "lt", value: "2026-01-01" });
  expect(toFilter("number", "empty")).toEqual({ op: "is_null", value: true });
  expect(toFilter("number", "  ")).toBeNull();
  expect(() => toFilter("integer", "many")).toThrow("Enter a number.");
});

test("a data source that does not answer its test says so as a failure", async () => {
  routes[`GET /api/v1${root}/data-source-bindings`] = () => [
    200,
    {
      items: [
        {
          path: "erp",
          description: "The ERP",
          bound: true,
          config: { host: "erp.internal", database: "erp", user: "reader" },
          hasPassword: true,
          health: null,
        },
      ],
    },
  ];
  routes[`POST /api/v1${root}/data-source-checks/erp`] = () => [
    200,
    { ok: false, problem: "connection refused" },
  ];
  show(<Sources root={root} link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Test" }));
  const said = await screen.findByText("erp: connection refused");
  expect(said.closest("[role]")?.className).toContain("bg-danger-soft");
});

test("a row's unsaved edits are not dropped by choosing another row without asking", async () => {
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByText("A-1"));
  const field = await screen.findByLabelText("number", { selector: "input[name=number]" });
  fireEvent.input(field, { target: { value: "A-1 changed" } });
  // Another row is asked about first, and Stay keeps the edit.
  fireEvent.click(screen.getByText("A-2"));
  expect(await answer("Stay")).toContain("Your changes to this row are not saved.");
  await waitFor(() => expect(screen.queryByText("Leave without saving?")).toBeNull());
  expect(
    (screen.getByLabelText("number", { selector: "input[name=number]" }) as HTMLInputElement).value,
  ).toBe("A-1 changed");
  // Leave goes on to the other row, with its own values.
  fireEvent.click(screen.getByText("A-2"));
  await answer("Leave");
  await waitFor(() =>
    expect(
      (screen.getByLabelText("number", { selector: "input[name=number]" }) as HTMLInputElement)
        .value,
    ).toBe("A-2"),
  );
  // With nothing typed, another row is chosen at once.
  fireEvent.click(screen.getByText("A-1"));
  await waitFor(() =>
    expect(
      (screen.getByLabelText("number", { selector: "input[name=number]" }) as HTMLInputElement)
        .value,
    ).toBe("A-1"),
  );
  expect(screen.queryByText("Leave without saving?")).toBeNull();
});

test("a table's Definition keeps room for a column's actions, and they wrap rather than run past the card (r-build)", async () => {
  const body = {
    columns: { number: { type: "text" }, total: { type: "number" } },
    policy: { type: "owner", column: "owner_id" },
  };
  routes[`GET /api/v1${root}/tables/orders`] = () => [200, orders("ui")];
  routes[`GET /api/v1${root}/resources/orders`] = () => [
    200,
    { kind: "table", schemaVersion: 1, key: "k1", title: null, body },
  ];
  routes[`GET /api/v1${root}/drafts/orders`] = () => [404, { status: 404, detail: "none" }];
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Definition" }));
  const describe = (await screen.findAllByRole("button", { name: "Describe" }))[0] as HTMLElement;
  const buttons = describe.parentElement as HTMLElement;
  expect(buttons.className).toContain("flex-wrap");
  const cell = describe.closest("td") as HTMLElement;
  const index = [...(cell.parentElement as HTMLElement).children].indexOf(cell);
  const header = (describe.closest("table") as HTMLElement).querySelectorAll("thead th")[index];
  expect(header?.className).toContain("w-[14rem]");
});

test("a table made in the console is renamed and described where it is edited", async () => {
  const body = {
    description: "What customers bought.",
    columns: { number: { type: "text" }, total: { type: "number" }, owner_id: { type: "uuid" } },
    policy: { type: "owner", column: "owner_id" },
  };
  routes[`GET /api/v1${root}/tables/orders`] = () => [200, orders("ui")];
  routes[`GET /api/v1${root}/resources/orders`] = () => [
    200,
    { kind: "table", schemaVersion: 1, key: "k1", title: null, body },
  ];
  routes[`GET /api/v1${root}/drafts/orders`] = () => [404, { status: 404, detail: "none" }];
  routes[`PUT /api/v1${root}/resources/orders`] = () => [200, {}];
  routes[`PUT /api/v1${root}/drafts/orders`] = () => [200, { revision: 1 }];
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Definition" }));

  fireEvent.click(await screen.findByRole("button", { name: "Describe the table" }));
  await answer("Save", "Orders from the shop.");
  const lastPut = () =>
    calls.filter((call) => call.method === "PUT").at(-1)?.body as
      | { body: { description?: string } }
      | undefined;
  await waitFor(() => expect(lastPut()?.body.description).toBe("Orders from the shop."));

  fireEvent.click(screen.getByRole("button", { name: "Rename table" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.input(await within(dialog).findByLabelText("Path"), { target: { value: "purchases" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save as a draft" }));
  await waitFor(() =>
    expect(
      calls.find((call) => call.method === "PUT" && call.url === `/api/v1${root}/drafts/orders`)
        ?.body,
    ).toMatchObject({
      kind: "table",
      path: "purchases",
    }),
  );
});

test("a change to a table's definition is taken back and made again, a rename included", async () => {
  const start = {
    columns: { number: { type: "text" }, total: { type: "number" }, owner_id: { type: "uuid" } },
    policy: { type: "owner", column: "owner_id" },
  };
  let stored: Record<string, unknown> = structuredClone(start);
  routes[`GET /api/v1${root}/tables/orders`] = () => [200, orders("ui")];
  routes[`GET /api/v1${root}/resources/orders`] = () => [200, { body: stored }];
  routes[`PUT /api/v1${root}/resources/orders`] = (sent) => {
    stored = (sent as { body: Record<string, unknown> }).body;
    return [200, {}];
  };
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Definition" }));
  const undo = () => screen.getByRole("button", { name: /^Undo/ }) as HTMLButtonElement;
  const redo = () => screen.getByRole("button", { name: /^Redo/ }) as HTMLButtonElement;
  expect(undo().disabled).toBe(true);

  fireEvent.click(screen.getAllByRole("button", { name: "Rename" })[1] as HTMLElement);
  await answer("Rename", "amount");
  await waitFor(() => expect(undo().disabled).toBe(false));
  expect(undo().getAttribute("aria-label")).toBe("Undo renaming total to amount");
  expect(Object.keys((stored as typeof start).columns)).toContain("amount");

  fireEvent.click(undo());
  await waitFor(() => expect(Object.keys((stored as typeof start).columns)).toContain("total"));
  // It goes back to the column's old name, and says the one it has now so its data comes along.
  expect((stored as { columns: Record<string, unknown> }).columns.total).toEqual({
    type: "number",
    renamedFrom: "amount",
  });
  expect(undo().disabled).toBe(true);

  fireEvent.click(redo());
  await waitFor(() => expect(Object.keys((stored as typeof start).columns)).toContain("amount"));
});

test("a connected data source is changed from what it is, and the stored password stays", async () => {
  routes[`GET /api/v1${root}/data-source-bindings`] = () => [
    200,
    {
      items: [
        {
          path: "erp",
          description: "The ERP",
          bound: true,
          config: { host: "erp.internal", port: 5433, database: "erp", user: "reader", ssl: true },
          hasPassword: true,
          health: null,
        },
      ],
    },
  ];
  routes[`PUT /api/v1${root}/data-source-bindings/erp`] = () => [200, {}];
  show(<Sources root={root} link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Change" }));
  const dialog = await screen.findByRole("dialog");
  const host = within(dialog).getByLabelText("Host") as HTMLInputElement;
  expect(host.value).toBe("erp.internal");
  expect((within(dialog).getByLabelText("Port") as HTMLInputElement).value).toBe("5433");
  expect((within(dialog).getByLabelText("Password") as HTMLInputElement).value).toBe("");
  // The same address with no password typed keeps the stored one.
  fireEvent.input(within(dialog).getByLabelText("Schema"), { target: { value: "sales" } });
  fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
  await waitFor(() =>
    expect(calls.find((call) => call.method === "PUT")?.body).toEqual({
      config: {
        host: "erp.internal",
        port: 5433,
        database: "erp",
        user: "reader",
        schema: "sales",
        ssl: true,
      },
    }),
  );
});

test("a data source's stored password is removed from its Change form: password null (DAT-MP5)", async () => {
  routes[`GET /api/v1${root}/data-source-bindings`] = () => [
    200,
    {
      items: [
        {
          path: "erp",
          description: "The ERP",
          bound: true,
          config: { host: "erp.internal", port: 5433, database: "erp", user: "reader", ssl: true },
          hasPassword: true,
          health: null,
        },
      ],
    },
  ];
  routes[`PUT /api/v1${root}/data-source-bindings/erp`] = () => [200, {}];
  show(<Sources root={root} link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Change" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByLabelText("Remove the stored password"));
  fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
  await waitFor(() =>
    expect(
      ((calls.find((call) => call.method === "PUT")?.body ?? {}) as { password?: null }).password,
    ).toBe(null),
  );
});

test("WLK-07: another host asks for the password again instead of dropping it in silence", async () => {
  routes[`GET /api/v1${root}/data-source-bindings`] = () => [
    200,
    {
      items: [
        {
          path: "erp",
          description: "The ERP",
          bound: true,
          config: { host: "erp.internal", port: 5433, database: "erp", user: "reader", ssl: true },
          hasPassword: true,
          health: null,
        },
      ],
    },
  ];
  routes[`PUT /api/v1${root}/data-source-bindings/erp`] = () => [200, {}];
  show(<Sources root={root} link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Change" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.input(within(dialog).getByLabelText("Host"), { target: { value: "erp2.internal" } });
  fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
  expect((await within(dialog).findByRole("alert")).textContent).toMatch(/Type the password again/);
  expect(calls.find((call) => call.method === "PUT")).toBeUndefined();
  fireEvent.input(within(dialog).getByLabelText("Password"), { target: { value: "s3cret" } });
  fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
  await waitFor(() =>
    expect(
      ((calls.find((call) => call.method === "PUT")?.body ?? {}) as { password?: string }).password,
    ).toBe("s3cret"),
  );
});

/** An orders table with a reference to customers and a file, and its first row open in the inspector. */
function openOrderWithCustomerAndFile(
  row: Record<string, unknown>,
  customers: object = { display: "name" },
) {
  const table = orders("ui");
  const extra = (name: string, type: string, references: string | null) => ({
    name,
    type,
    required: false,
    unique: false,
    default: null,
    references,
    status: "active",
    held: null,
  });
  (table.columns as unknown[]).push(
    extra("customer", "reference", "customers"),
    extra("attachment", "file", null),
  );
  routes[`GET /api/v1${root}/tables/orders`] = () => [200, table];
  routes[`GET /api/v1${root}/tables/customers`] = () => [200, customers];
  routes[`GET /api/v1${root}/rows/orders`] = () => [
    200,
    { items: [{ ...rows[0], customer: null, attachment: null, ...row }], nextCursor: null },
  ];
  history.replaceState(history.state, "", "?row=r1");
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
}

test("a reference is found by typing: the server is asked for the rows whose name has what was typed", async () => {
  const everyone = Array.from({ length: 50 }, (_, n) => ({ id: `c${n}`, name: `Customer ${n}` }));
  routes[`GET /api/v1${root}/rows/customers`] = (_body, url) => {
    const filter = url.searchParams.get("filter");
    return filter
      ? [200, { items: [{ id: "c900", name: "Zelda Corp" }], nextCursor: null }]
      : [200, { items: everyone, nextCursor: "NTA" }];
  };
  openOrderWithCustomerAndFile({});
  const box = await screen.findByRole("combobox");
  // The first 50 are asked for, and there are more.
  await screen.findByText(/Type to find more/);
  const first = calls.find((call) => call.url.includes("/rows/customers"));
  expect(new URL(first?.url ?? "", "http://x").searchParams.get("limit")).toBe("50");

  fireEvent.click(box);
  fireEvent.keyDown(box, { key: "ArrowDown" });
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "Zel" } });
  await waitFor(() => {
    const found = calls.filter(
      (call) => call.url.includes("/rows/customers") && call.url.includes("filter="),
    );
    expect(found.length).toBeGreaterThan(0);
    const sent = new URL(found.at(-1)?.url ?? "", "http://x").searchParams;
    expect(JSON.parse(sent.get("filter") ?? "null")).toEqual({
      column: "name",
      op: "contains",
      value: "Zel",
    });
  });
  fireEvent.click(await screen.findByRole("option", { name: "Zelda Corp" }));
  fireEvent.click(await screen.findByRole("button", { name: "Save row" }));
  await waitFor(() =>
    expect(calls.find((call) => call.method === "PATCH")?.body).toEqual({ customer: "c900" }),
  );
});

test("a file in the inspector is replaced and removed after asking, and the old one is said to stay in history", async () => {
  routes[`POST /api/v1${root}/files`] = () => [201, { id: "f2", name: "new.txt" }];
  routes[`PATCH /api/v1${root}/row/r1/orders`] = (body) => [
    200,
    { ...rows[0], ...(body as object) },
  ];
  openOrderWithCustomerAndFile({ attachment: "f1" });
  const input = (await screen.findByLabelText("New file for attachment")) as HTMLInputElement;
  const file = new File(["hello"], "new.txt", { type: "text/plain" });
  fireEvent.change(input, { target: { files: [file] } });
  const said = await answer("Replace");
  expect(said).toMatch(/old file stays in this row's history/);
  await waitFor(() => {
    expect(
      calls.some((call) => call.method === "POST" && call.url.includes("/files?name=new.txt")),
    ).toBe(true);
    expect(calls.find((call) => call.method === "PATCH")?.body).toEqual({ attachment: "f2" });
  });

  fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
  expect(await answer("Remove")).toMatch(/old file stays in this row's history/);
  await waitFor(() =>
    expect(calls.filter((call) => call.method === "PATCH").at(-1)?.body).toEqual({
      attachment: null,
    }),
  );
});

test("a removal that is not confirmed changes nothing", async () => {
  openOrderWithCustomerAndFile({ attachment: "f1" });
  fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
  await answer("Cancel");
  await waitFor(() => expect(screen.queryByText(/Remove the file from/)).toBeNull());
  expect(calls.some((call) => call.method === "PATCH")).toBe(false);
});

test("TAB-10: rows checked on one page are not checked, or deleted, on another", async () => {
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByLabelText("Check row r1"));
  expect(screen.getByRole("toolbar", { name: "What to do with the checked rows" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() => expect(lastRows().get("cursor")).toBe("NTA"));
  await waitFor(() =>
    expect(screen.queryByRole("toolbar", { name: "What to do with the checked rows" })).toBeNull(),
  );
  // The heading's box follows the rows that are shown.
  const all = screen.getByLabelText("Check every row on this page") as HTMLInputElement;
  expect(all.checked).toBe(false);
  fireEvent.click(all);
  expect((screen.getByLabelText("Check every row on this page") as HTMLInputElement).checked).toBe(
    true,
  );
  // Another filter leaves none of them checked either.
  fireEvent.change(screen.getByLabelText("Filter by number"), { target: { value: "A-1" } });
  await waitFor(() => expect(lastRows().get("filter")).toBeTruthy());
  await waitFor(() =>
    expect(screen.queryByRole("toolbar", { name: "What to do with the checked rows" })).toBeNull(),
  );
});

test("TAB-06: a column is not renamed, added or brought back over one that has the name", async () => {
  const body = {
    columns: {
      number: { type: "text" },
      total: { type: "number" },
      notes: { type: "text" },
    },
  };
  routes[`GET /api/v1${root}/tables/orders`] = () => [200, orders("ui")];
  routes[`GET /api/v1${root}/resources/orders`] = () => [200, { body, version: 3 }];
  routes[`PUT /api/v1${root}/resources/orders`] = () => [200, { version: 4 }];
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Definition" }));
  const puts = () => calls.filter((call) => call.method === "PUT");

  // Rename: said on the field, and nothing is sent.
  fireEvent.click(screen.getAllByRole("button", { name: "Rename" })[1] as HTMLElement);
  await answer("Rename", "number");
  expect(await screen.findByText(/already a column called "number"/)).toBeTruthy();
  expect(puts()).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

  // Bring back: a live column has the name of the retired one.
  fireEvent.click(await screen.findByRole("button", { name: "Bring back" }));
  expect(await screen.findByText(/already a column called "notes"/)).toBeTruthy();
  expect(puts()).toHaveLength(0);
});

test("TAB-12: a save names the version it read, and an undo after someone else's change is refused", async () => {
  let stored: Record<string, unknown> = {
    columns: { number: { type: "text" }, total: { type: "number" }, owner_id: { type: "uuid" } },
  };
  let version = 1;
  const refuse = false;
  routes[`GET /api/v1${root}/tables/orders`] = () => [200, orders("ui")];
  routes[`GET /api/v1${root}/resources/orders`] = () => [200, { body: stored, version }];
  routes[`PUT /api/v1${root}/resources/orders`] = (sent) => {
    const asked = sent as { body: Record<string, unknown>; version?: number };
    if (refuse || asked.version !== version)
      return [
        409,
        {
          status: 409,
          code: "draft_changed",
          detail:
            "Someone else saved orders after you opened it. Reload it, then make your change again.",
        },
      ];
    stored = asked.body;
    version += 1;
    return [200, { version }];
  };
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Definition" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Rename" })[1] as HTMLElement);
  await answer("Rename", "amount");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /^Undo/ }).hasAttribute("disabled")).toBe(false),
  );
  expect(calls.filter((call) => call.method === "PUT")[0]?.body).toMatchObject({ version: 1 });
  // Someone else saves in between.
  version += 1;
  fireEvent.click(screen.getByRole("button", { name: /^Undo/ }));
  // The page is read again, so it already shows their change: it is not told to reload.
  expect(await screen.findByText(/Someone else changed orders after you opened it/)).toBeTruthy();
  expect(screen.queryByText(/Reload it/)).toBeNull();
  expect(Object.keys((stored as { columns: object }).columns)).toContain("amount");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /^Undo/ }).hasAttribute("disabled")).toBe(true),
  );
});

test("TAB-11: undoing a renamed choice puts the old spelling back on the rows that hold the new one", () => {
  const before = { columns: { status: { type: "enum", values: ["open", "closed"] } } };
  const now = {
    columns: {
      status: { type: "enum", values: [{ value: "todo", renamedFrom: "open" }, "closed"] },
    },
  };
  expect(bodyToRestore(before, now).columns.status?.values).toEqual([
    { value: "open", renamedFrom: "todo" },
    "closed",
  ]);
});

test("TAB-05: Create table asks for a new table, so a name in use is refused and not replaced", async () => {
  routes[`GET /api/v1${root}/tables`] = () => [200, { items: [] }];
  routes[`PUT /api/v1${root}/resources/codes`] = () => [
    409,
    { status: 409, code: "path_taken", detail: 'Something is already at "codes".' },
  ];
  show(<Tables root={root} link="/t/t1/workspaces/w1" />);
  fireEvent.click(
    (await screen.findAllByRole("button", { name: "Create table" }))[0] as HTMLElement,
  );
  const dialog = await screen.findByRole("dialog");
  fireEvent.input(within(dialog).getByLabelText("Name"), { target: { value: "codes" } });
  fireEvent.input(within(dialog).getByLabelText("First column"), { target: { value: "title" } });
  fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
  expect(await screen.findByText(/already at "codes"/)).toBeTruthy();
  expect(calls.find((call) => call.method === "PUT")?.body).toMatchObject({ create: true });
});

test("D41: a new data source starts with the connection encrypted", async () => {
  routes[`GET /api/v1${root}/data-source-bindings`] = () => [
    200,
    { items: [{ path: "erp", description: "", bound: false, config: null, hasPassword: false }] },
  ];
  show(<Sources root={root} link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Connect database" }));
  const dialog = await screen.findByRole("dialog");
  expect((within(dialog).getByLabelText("Encrypt the connection") as HTMLSelectElement).value).toBe(
    "yes",
  );
});
const settle = (ms: number) => new Promise((done) => setTimeout(done, ms));

test("TAB-13: a saved view's filter stays, in the address and in the boxes, past the pause after it is chosen", async () => {
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  await screen.findByText("A-1");
  // A view is applied: the address is changed from outside the boxes.
  navigate(
    `/t/t1/workspaces/w1/tables/orders?filter=${encodeURIComponent(JSON.stringify({ number: "A-" }))}`,
  );
  await waitFor(() =>
    expect(JSON.parse(lastRows().get("filter") ?? "null")).toEqual({
      and: [{ column: "number", op: "contains", value: "A-" }],
    }),
  );
  // Longer than the pause a typed box waits: the old, empty boxes must not write themselves back.
  await settle(700);
  expect(new URLSearchParams(location.search).get("filter")).toBe('{"number":"A-"}');
  expect((screen.getByLabelText("Filter by number") as HTMLInputElement).value).toBe("A-");
  expect(JSON.parse(lastRows().get("filter") ?? "null")).toMatchObject({
    and: [{ column: "number" }],
  });
});

test("TAB-20: a filter that cannot be read asks for nothing and exports nothing, and its message goes with its text", async () => {
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  await screen.findByText("A-1");
  fireEvent.change(screen.getByLabelText("Filter by total"), { target: { value: "abc" } });
  expect((await screen.findByRole("alert")).textContent).toBe("total: Enter a number.");
  expect(screen.getByLabelText("Filter by total").getAttribute("aria-invalid")).toBe("true");
  const asks = calls.filter((call) => call.url.includes("/rows/orders")).length;
  await settle(500);
  // No rows are shown as though they were filtered, no request is made, and CSV is off.
  expect(calls.filter((call) => call.url.includes("/rows/orders")).length).toBe(asks);
  expect(screen.queryByText("A-1")).toBeNull();
  const csv = screen.getByRole("button", { name: /CSV/ });
  expect(csv.hasAttribute("disabled")).toBe(true);
  expect(screen.queryByRole("link", { name: /CSV/ })).toBeNull();
  // Put right, the message goes and the rows come back filtered.
  fireEvent.change(screen.getByLabelText("Filter by total"), { target: { value: "5" } });
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  await waitFor(() =>
    expect(JSON.parse(lastRows().get("filter") ?? "null")).toEqual({
      and: [{ column: "total", op: "eq", value: 5 }],
    }),
  );
  expect(screen.getByRole("link", { name: /CSV/ })).toBeTruthy();
});

test("TAB-18: Create table sends the values of a list it makes, and says why when it is refused", async () => {
  routes[`GET /api/v1${root}/tables`] = () => [200, { items: [] }];
  routes[`PUT /api/v1${root}/resources/states`] = () => [
    400,
    {
      status: 400,
      detail: "The table's definition is not valid.",
      errors: [{ path: "/body/columns/state/values", message: "needs at least one value" }],
    },
  ];
  show(<Tables root={root} link="/t/t1/workspaces/w1" />);
  fireEvent.click(
    (await screen.findAllByRole("button", { name: "Create table" }))[0] as HTMLElement,
  );
  const dialog = await screen.findByRole("dialog");
  fireEvent.input(within(dialog).getByLabelText("Name"), { target: { value: "states" } });
  fireEvent.input(within(dialog).getByLabelText("First column"), { target: { value: "state" } });
  fireEvent.change(within(dialog).getByLabelText("It holds"), { target: { value: "enum" } });
  const values = await within(dialog).findByLabelText("Values");
  fireEvent.input(values, { target: { value: "new, paid" } });
  fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
  expect(await within(dialog).findByText(/needs at least one value/)).toBeTruthy();
  expect(calls.find((call) => call.method === "PUT")?.body).toMatchObject({
    body: { columns: { state: { type: "enum", values: ["new", "paid"] } } },
  });
});

test("TAB-19: a column is moved or retired everywhere the definition names it", () => {
  const body = () => ({
    columns: { a: { type: "text" }, b: { type: "text" }, who: { type: "uuid" } },
    display: "a",
    indexes: [["a"], ["a", "b"], ["b"]],
    policy: {
      type: "rules",
      rules: [{ allow: "read", when: { column: "who", is: "principal" } }],
    },
  });
  const renamed = body();
  moveColumn(renamed as never, "a", "z");
  expect(Object.keys(renamed.columns)).toEqual(["b", "who", "z"]);
  expect((renamed.columns as Record<string, object>).z).toMatchObject({ renamedFrom: "a" });
  expect(renamed.display).toBe("z");
  expect(renamed.indexes).toEqual([["z"], ["z", "b"], ["b"]]);
  const retired = body();
  moveColumn(retired as never, "a");
  expect(retired.display).toBeUndefined();
  expect(retired.indexes).toEqual([["b"], ["b"]]);
  expect(Object.keys(retired.columns)).toEqual(["b", "who"]);
  // A rule that needs the column names itself.
  expect(() => moveColumn(body() as never, "who")).toThrow(/rule 1 of who sees rows/);
  const followed = body();
  moveColumn(followed as never, "who", "owner");
  expect(followed.policy.rules[0]?.when).toMatchObject({ column: "owner" });
});

test("TAB-21: a row picker searches by what the display column is, and a failed search keeps the picker", () => {
  expect(pickerFilter("name", "text", "ab")).toEqual({
    column: "name",
    op: "contains",
    value: "ab",
  });
  expect(pickerFilter("code", "integer", "12")).toEqual({ column: "code", op: "eq", value: 12 });
  expect(pickerFilter("code", "integer", "x")).toBeNull();
  expect(pickerFilter("meta", "json", "x")).toBeNull();
  expect(pickerFilter(undefined, "text", "x")).toBeNull();
  expect(pickerFilter("name", "text", "  ")).toBeNull();
});

test("TAB-21: typing in the picker of a column named by a number keeps the picker", async () => {
  routes[`GET /api/v1${root}/rows/customers`] = (_body, url) =>
    url.searchParams.get("filter")?.includes('"contains"')
      ? [400, { status: 400, detail: "contains works on text columns" }]
      : [200, { items: [{ id: "c1", code: 7 }], nextCursor: "NTA" }];
  openOrderWithCustomerAndFile(
    {},
    { display: "code", columns: [{ name: "code", type: "integer", status: "active" }] },
  );
  const box = await screen.findByRole("combobox");
  await screen.findByText(/Type to find more/);
  fireEvent.click(box);
  fireEvent.keyDown(box, { key: "ArrowDown" });
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "12" } });
  await settle(600);
  const filters = calls
    .filter((call) => call.url.includes("/rows/customers"))
    .map((call) => new URL(call.url, "http://x").searchParams.get("filter"));
  expect(filters.some((one) => one?.includes('"contains"'))).toBe(false);
  expect(filters).toContain(JSON.stringify({ column: "code", op: "eq", value: 12 }));
  // Still a picker, not a box for the row's ID.
  expect(screen.queryByText(/The ID of a row/)).toBeNull();
  expect(screen.getByRole("combobox")).toBeTruthy();
});

test("TAB-38: saved views belong to the table, not to how its name is spelled", () => {
  const at = (name: string) => `/tenants/t1/workspaces/w1/rows/${name}`;
  expect(viewsOf(at("crm/orders"), "0192aaaa-bbbb-7ccc-8ddd-111111111111")?.list).not.toBe(
    viewsOf(at("crm-orders"), "0192aaaa-bbbb-7ccc-8ddd-222222222222")?.list,
  );
  // Renamed, the table keeps its views.
  expect(viewsOf(at("old"), "0192aaaa-bbbb-7ccc-8ddd-111111111111")?.list).toBe(
    viewsOf(at("new"), "0192aaaa-bbbb-7ccc-8ddd-111111111111")?.list,
  );
  expect(viewsOf(at("x"), "0192aaaa-bbbb-7ccc-8ddd-111111111111")?.list).toMatch(
    /^[a-z][a-z0-9-]{0,39}$/,
  );
});

test("TAB-28: a time is shown, typed and read in the reader's zone, with UTC on hover, and one that does not exist is refused", async () => {
  expect(parseValue("timestamp", "2026-06-01T12:00:00Z")).toBe("2026-06-01T12:00:00.000Z");
  expect(parseValue("timestamp", "2026-06-01 09:00")).toBe(
    new Date(2026, 5, 1, 9, 0).toISOString(),
  );
  expect(parseValue("timestamp", "2026-06-01T09:00")).toBe(
    new Date(2026, 5, 1, 9, 0).toISOString(),
  );
  expect(() => parseValue("timestamp", "2026-02-31 10:00")).toThrow(/exists/);
  expect(() => parseValue("timestamp", "1")).toThrow(/exists/);
  expect(() => parseValue("date", "2026-02-31")).toThrow(/exists/);
  expect(parseValue("date", "2026-02-28")).toBe("2026-02-28");
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  await screen.findByText("A-1");
  expect(await screen.findAllByTitle("2026-11-01T10:00:00.000Z (UTC)")).not.toHaveLength(0);
});

test("a data source's row says which scripts use it (REL-MP7)", async () => {
  routes[`GET /api/v1${root}/data-source-bindings`] = () => [
    200,
    {
      items: [
        {
          path: "erp",
          description: "",
          bound: true,
          config: { host: "erp.internal", port: 5433, database: "erp", user: "reader", ssl: true },
          hasPassword: true,
          health: null,
        },
      ],
    },
  ];
  routes[`GET /api/v1${root}/references`] = () => [
    200,
    {
      items: [
        {
          target: { kind: "data_source", name: "erp" },
          by: { kind: "script", path: "orders/sync" },
          how: "reads and writes it",
        },
      ],
    },
  ];
  show(<Sources root={root} link="/t/t1/workspaces/w1" />);
  expect(await screen.findByRole("link", { name: "orders/sync" })).toBeTruthy();
});

const bound = {
  path: "erp",
  description: "The ERP",
  bound: true,
  config: { host: "erp.internal", port: 5433, database: "erp", user: "reader", ssl: true },
  hasPassword: true,
  health: null,
};

test("cfg2: the page of a data source has Test, Change and Unbind, as its list row has", async () => {
  routes[`GET /api/v1${root}/data-source-tables/erp`] = () => [
    200,
    { items: [{ name: "customers", key: "id", columns: [{ name: "id", type: "integer" }] }] },
  ];
  routes[`GET /api/v1${root}/source-rows/customers/erp`] = () => [
    200,
    { items: [], nextCursor: null },
  ];
  routes[`GET /api/v1${root}/data-source-bindings`] = () => [200, { items: [bound] }];
  routes[`DELETE /api/v1${root}/data-source-bindings/erp`] = () => [204, null];
  show(<SourceView root={root} path="erp" link="/t/t1/workspaces/w1" />);
  expect(await screen.findByRole("button", { name: "Test" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Change" }));
  const dialog = await screen.findByRole("dialog");
  expect((within(dialog).getByLabelText("Host") as HTMLInputElement).value).toBe("erp.internal");
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove from here" }));
  await answer("Remove from here");
  await waitFor(() => expect(calls.some((call) => call.method === "DELETE")).toBe(true));
});

test("WLK-09d: the buttons of a source's row wrap on a phone instead of widening the page", async () => {
  routes[`GET /api/v1${root}/data-source-bindings`] = () => [200, { items: [bound] }];
  show(<Sources root={root} link="/t/t1/workspaces/w1" />);
  const unbind = await screen.findByRole("button", { name: "Remove from here" });
  expect(unbind.parentElement?.className).toMatch(/flex-wrap/);
  // Round 5: no stacking or right alignment of its own; the list's column says where they sit.
  expect(unbind.parentElement?.className).not.toMatch(/max-sm:/);
});

test("WLK-09b: a retired table keeps its pill whole and says where it was managed", async () => {
  const item = (name: string, status: string, id?: string, managedIn = "code") => ({
    ...(id ? { id } : {}),
    name,
    status,
    managedIn,
    description: "",
    columnCount: 1,
    rowCount: 3,
    policy: { type: "open" },
  });
  routes[`GET /api/v1${root}/tables`] = () => [
    200,
    {
      items: [
        item("notes", "retired", "id-1", "ui"),
        item("notes", "retired", "id-2"),
        item("orders", "active"),
      ],
    },
  ];
  show(<Tables root={root} link="/t/t1/workspaces/w1" />);
  // Two retired tables of one name are two rows, each opened by its own ID.
  const links = (await screen.findAllByRole("link", { name: "notes" })).map((one) =>
    one.getAttribute("href"),
  );
  expect(links).toEqual([
    "/t/t1/workspaces/w1/tables/notes?id=id-1",
    "/t/t1/workspaces/w1/tables/notes?id=id-2",
  ]);
  const pill = (await screen.findAllByText("Retired"))[0] as HTMLElement;
  expect(pill.closest("span.shrink-0")).toBeTruthy();
  // Each says where it is managed, or where it was.
  expect(screen.getAllByText("Code")).toHaveLength(2);
  expect(screen.getAllByText("Files")).toHaveLength(1);
  cleanup();
  history.replaceState(null, "", "/?id=id-2");
  routes[`GET /api/v1${root}/tables/orders`] = () => [
    200,
    { ...orders("code"), status: "retired" },
  ];
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  await screen.findByText(/This table is retired/);
  expect(screen.queryByText(/\sManaged as/)).toBeNull();
  // A retired table that was made in the console can be brought back; one from the repository cannot.
  expect(screen.queryByRole("button", { name: /Bring back/ })).toBeNull();
  // Opened with its ID, the page asks for that table.
  expect(calls.some((call) => call.url.endsWith("/tables/orders?id=id-2"))).toBe(true);
  history.replaceState(null, "", "/");
});

/** A table made in the console, whose stored definition is read and saved as the screen changes it. */
function editable(extra: Record<string, object> = {}, columns: object[] = []) {
  const body = {
    columns: {
      number: { type: "text", required: true, unique: true },
      total: { type: "number", default: 0 },
      owner_id: { type: "uuid" },
      ...extra,
    },
    policy: { type: "owner", column: "owner_id" },
  };
  const table = orders("ui");
  (table.columns as object[]).push(...columns);
  routes[`GET /api/v1${root}/tables/orders`] = () => [200, table];
  routes[`GET /api/v1${root}/resources/orders`] = () => [200, { body, version: 3 }];
  routes[`PUT /api/v1${root}/resources/orders`] = () => [200, { version: 4 }];
  return () =>
    calls.filter((call) => call.method === "PUT" && call.url.endsWith("/resources/orders")).at(-1)
      ?.body as {
      body: { columns: Record<string, Record<string, unknown>>; indexes?: string[][] };
    };
}
const column = (name: string, type: string, more: object = {}) => ({
  name,
  type,
  required: false,
  unique: false,
  default: null,
  references: null,
  status: "active",
  held: null,
  ...more,
});

test("TAB-P1 and TAB-P2: a column's required, no-two-alike and default are changed from its row, and a refusal names the values", async () => {
  const saved = editable();
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Definition" }));
  // The number column was required and unique: both are taken off, and a default is given.
  fireEvent.click(screen.getAllByRole("button", { name: "Rules" })[0] as HTMLElement);
  let dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Must every row have one?"), {
    target: { value: "no" },
  });
  fireEvent.change(within(dialog).getByLabelText("Must every row's value be different?"), {
    target: { value: "no" },
  });
  fireEvent.input(within(dialog).getByLabelText("Value when none is given"), {
    target: { value: "none yet" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(saved().body.columns.number).toEqual({ type: "text", default: "none yet" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  // Unique on a column whose rows share values is refused, and the refusal is read in the dialog.
  routes[`PUT /api/v1${root}/resources/orders`] = () => [
    409,
    {
      status: 409,
      code: "conflict",
      detail:
        'The table "orders" cannot be changed: column "total" is now unique, and some rows share a value: "0" is in 3 rows. Make the values distinct first.',
    },
  ];
  fireEvent.click(screen.getAllByRole("button", { name: "Rules" })[1] as HTMLElement);
  dialog = await screen.findByRole("dialog");
  // The default is shown in the control that fits its type, with what it is now.
  expect(
    (within(dialog).getByLabelText("Value when none is given") as HTMLInputElement).value,
  ).toBe("0");
  fireEvent.change(within(dialog).getByLabelText("Must every row's value be different?"), {
    target: { value: "yes" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  expect(await within(dialog).findByText(/"0" is in 3 rows/)).toBeTruthy();
  expect(screen.getByRole("dialog")).toBe(dialog);
  expect(
    (within(dialog).getByLabelText("Must every row's value be different?") as HTMLSelectElement)
      .value,
  ).toBe("yes");
});

test("TAB-P2: a default is given in the column's own control, and one that does not read is said at the field", async () => {
  const saved = editable(
    {
      state: { type: "enum", values: ["open", "closed"] },
      paid: { type: "boolean" },
    },
    [
      column("state", "enum", {
        values: [{ value: "open" }, { value: "closed", label: "Closed" }],
      }),
      column("paid", "boolean"),
    ],
  );
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Definition" }));
  const rulesOf = (name: string) => {
    const at = ["number", "total", "owner_id", "state", "paid"].indexOf(name);
    fireEvent.click(screen.getAllByRole("button", { name: "Rules" })[at] as HTMLElement);
  };
  rulesOf("state");
  let dialog = await screen.findByRole("dialog");
  const choice = within(dialog).getByLabelText("Value when none is given") as HTMLSelectElement;
  expect(choice.tagName).toBe("SELECT");
  expect([...choice.options].map((one) => one.textContent)).toEqual(["None", "open", "Closed"]);
  fireEvent.change(choice, { target: { value: "closed" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(saved().body.columns.state?.default).toBe("closed"));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  rulesOf("paid");
  dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Value when none is given"), {
    target: { value: "true" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(saved().body.columns.paid?.default).toBe(true));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  // A number that is not one is said under its field, and nothing is saved.
  const puts = calls.filter((call) => call.method === "PUT").length;
  rulesOf("total");
  dialog = await screen.findByRole("dialog");
  fireEvent.input(within(dialog).getByLabelText("Value when none is given"), {
    target: { value: "lots" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  expect(await within(dialog).findByText("Enter a number.")).toBeTruthy();
  expect(calls.filter((call) => call.method === "PUT").length).toBe(puts);
});

test("TAB-P3: a column's type is changed to what keeps its values, and a reference is pointed at another table", async () => {
  const saved = editable({ customer: { type: "reference", references: "customers" } }, [
    column("customer", "reference", { references: "customers", onDelete: "restrict" }),
  ]);
  routes[`GET /api/v1${root}/tables`] = () => [
    200,
    {
      items: [
        { name: "orders", status: "active" },
        { name: "customers", status: "active" },
        { name: "clients", status: "active" },
        { name: "old", status: "retired" },
      ],
    },
  ];
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Definition" }));
  // Number can become text, and keeps its default as text. A text column can become a list only.
  expect(screen.getAllByRole("button", { name: "Change type" }).length).toBe(3);
  fireEvent.click(screen.getAllByRole("button", { name: "Change type" })[1] as HTMLElement);
  let dialog = await screen.findByRole("dialog");
  const kinds = within(dialog).getByLabelText("It holds") as HTMLSelectElement;
  expect([...kinds.options].map((one) => one.value)).toEqual(["number", "text"]);
  fireEvent.change(kinds, { target: { value: "text" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(saved().body.columns.total).toEqual({ type: "text", default: "0" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  // A reference's table is changed, among the active tables.
  fireEvent.click(await screen.findByRole("button", { name: "Change table" }));
  dialog = await screen.findByRole("dialog");
  const box = within(dialog).getByRole("combobox");
  fireEvent.click(box);
  fireEvent.keyDown(box, { key: "ArrowDown" });
  await screen.findByRole("option", { name: "customers" });
  expect(screen.queryByRole("option", { name: "old" })).toBeNull();
  fireEvent.click(await screen.findByRole("option", { name: "clients" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(saved().body.columns.customer?.references).toBe("clients"));
});

test("TAB-P4: a table's indexes are listed, added with the platform's own columns, and removed", async () => {
  const saved = editable();
  const table = orders("ui") as ReturnType<typeof orders> & { indexes?: string[][] };
  table.indexes = [["total"]];
  routes[`GET /api/v1${root}/tables/orders`] = () => [200, table];
  routes[`GET /api/v1${root}/resources/orders`] = () => [
    200,
    {
      body: {
        columns: {
          number: { type: "text" },
          total: { type: "number" },
          owner_id: { type: "uuid" },
        },
        indexes: [["total"]],
      },
      version: 3,
    },
  ];
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Definition" }));
  const list = await screen.findByRole("table", { name: "Indexes" });
  expect(within(list).getByText("total")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Add an index" }));
  const dialog = await screen.findByRole("dialog");
  const box = within(dialog).getByRole("combobox");
  fireEvent.click(box);
  fireEvent.keyDown(box, { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "owner_id" }));
  fireEvent.click(await screen.findByRole("option", { name: "created_at" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Add index" }));
  await waitFor(() =>
    expect(saved().body.indexes).toEqual([["total"], ["owner_id", "created_at"]]),
  );

  fireEvent.click(await screen.findByRole("button", { name: "Remove the index on total" }));
  await waitFor(() => expect(calls.filter((call) => call.method === "PUT").length).toBe(2));
  await waitFor(() => expect(saved().body.indexes).toBeUndefined());
});

test("TAB-P4: a read stopped for taking too long links to the indexes of a table made in the console, and only there", async () => {
  routes[`GET /api/v1${root}/tables/orders`] = () => [200, orders("ui")];
  routes[`GET /api/v1${root}/rows/orders`] = () => [
    422,
    {
      status: 422,
      code: "too_slow",
      detail:
        "This took longer than 8 seconds and was stopped. Narrow the filter, or add an index.",
    },
  ];
  const view = show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  const link = await screen.findByRole("link", { name: "Add an index" });
  expect(link.getAttribute("href")).toContain("/tables/orders?view=definition&at=indexes");
  view.unmount();
  // A table from the repository is changed there, not here.
  routes[`GET /api/v1${root}/tables/orders`] = () => [200, orders("code")];
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  await screen.findByText(/took longer than 8 seconds/);
  expect(screen.queryByRole("link", { name: "Add an index" })).toBeNull();
});

test("TAB-P6: a retired table of the console is brought back from its own screen, with the definition it had", async () => {
  const retired = { ...orders("ui"), status: "retired", display: "number" };
  routes[`GET /api/v1${root}/tables/orders`] = () => [200, retired];
  routes[`PUT /api/v1${root}/resources/orders`] = () => [200, { version: 1 }];
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  expect(await screen.findByText(/This table is retired/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Bring back" }));
  await waitFor(() =>
    expect(calls.find((call) => call.method === "PUT")?.body).toEqual({
      kind: "table",
      schemaVersion: 1,
      ownership: "ui",
      body: {
        columns: {
          number: { type: "text", required: true, unique: true },
          total: { type: "number", default: 0 },
          owner_id: { type: "uuid" },
        },
        policy: { type: "owner", column: "owner_id" },
        display: "number",
      },
    }),
  );
  expect(await screen.findByText("The table orders is back, with its rows.")).toBeTruthy();
});

test("TAB-P6: a retired table of the repository says a deploy brings it back, and has no button", async () => {
  routes[`GET /api/v1${root}/tables/orders`] = () => [
    200,
    { ...orders("code"), status: "retired" },
  ];
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  expect(
    await screen.findByText(/Deploying a definition with this name brings it back/),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Bring back" })).toBeNull();
});

test("TAB-P7: a table's rules are seen as a group, of end users or of members, with the total that group would see", async () => {
  editable();
  routes["GET /api/v1/tenants/t1/end-users"] = () => [200, { items: [] }];
  routes["GET /api/v1/tenants/t1/end-user-groups"] = () => [
    200,
    { items: [{ id: "g-end", name: "Customers" }] },
  ];
  routes["GET /api/v1/tenants/t1/groups"] = () => [
    200,
    { items: [{ id: "g-mem", name: "Billing" }] },
  ];
  routes[`GET /api/v1${root}/aggregate/orders`] = () => [
    200,
    { items: [{ values: { count: 7 } }] },
  ];
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Definition" }));
  const box = await screen.findByRole("combobox", { name: "See it as a group" });
  fireEvent.click(box);
  fireEvent.keyDown(box, { key: "ArrowDown" });
  expect(await screen.findByRole("option", { name: /Billing/ })).toBeTruthy();
  fireEvent.click(await screen.findByRole("option", { name: /Customers/ }));
  await waitFor(() =>
    expect(
      calls.some(
        (call) =>
          call.url.startsWith(`/api/v1${root}/rows/orders`) && call.url.includes("asGroup=g-end"),
      ),
    ).toBe(true),
  );
  expect(await screen.findByText("Someone in this group would see 7 rows in all.")).toBeTruthy();
  expect(calls.some((call) => call.url === `/api/v1${root}/aggregate/orders?asGroup=g-end`)).toBe(
    true,
  );
});

test("TAB-P5: Create table takes a description, several columns, a reference, and who sees rows", async () => {
  routes[`GET /api/v1${root}/tables`] = () => [
    200,
    {
      items: [
        {
          name: "customers",
          description: "",
          status: "active",
          managedIn: "ui",
          columnCount: 1,
          rowCount: 0,
          policy: { type: "open" },
        },
      ],
    },
  ];
  routes[`PUT /api/v1${root}/resources/visits`] = () => [201, {}];
  show(<Tables root={root} link="/t/t1/workspaces/w1" />);
  fireEvent.click(
    (await screen.findAllByRole("button", { name: "Create table" }))[0] as HTMLElement,
  );
  const dialog = await screen.findByRole("dialog");
  fireEvent.input(within(dialog).getByLabelText("Name"), { target: { value: "visits" } });
  fireEvent.input(within(dialog).getByLabelText("What it holds"), {
    target: { value: "  Who came in.  " },
  });
  // The first column points to another table, chosen from the tables there are.
  fireEvent.input(within(dialog).getByLabelText("First column"), { target: { value: "customer" } });
  fireEvent.change(within(dialog).getByLabelText("It holds"), { target: { value: "reference" } });
  const box = await within(dialog).findByRole("combobox", { name: "Which table" });
  fireEvent.click(box);
  fireEvent.keyDown(box, { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "customers" }));
  // More columns, each with its own kind.
  fireEvent.click(within(dialog).getByRole("button", { name: "Add another column" }));
  fireEvent.input(within(dialog).getByLabelText("Column 2"), { target: { value: "state" } });
  fireEvent.change(within(dialog).getByLabelText("Column 2 holds"), { target: { value: "enum" } });
  fireEvent.input(within(dialog).getByLabelText("Column 2 values"), {
    target: { value: "new, done" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add another column" }));
  fireEvent.input(within(dialog).getByLabelText("Column 3"), { target: { value: "minutes" } });
  fireEvent.change(within(dialog).getByLabelText("Column 3 holds"), {
    target: { value: "integer" },
  });
  fireEvent.change(within(dialog).getByLabelText("Who sees rows"), { target: { value: "owner" } });
  fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
  await waitFor(() =>
    expect(calls.find((call) => call.method === "PUT")?.body).toEqual({
      kind: "table",
      schemaVersion: 1,
      ownership: "ui",
      create: true,
      body: {
        description: "Who came in.",
        columns: {
          customer: { type: "reference", references: "customers" },
          state: { type: "enum", values: ["new", "done"] },
          minutes: { type: "integer" },
          owner_id: { type: "uuid" },
        },
        policy: { type: "owner", column: "owner_id" },
      },
    }),
  );
});

test("TAB-P5: Create table says which column is wrong, and sends nothing, when two have one name or a reference has no table", async () => {
  routes[`GET /api/v1${root}/tables`] = () => [200, { items: [] }];
  show(<Tables root={root} link="/t/t1/workspaces/w1" />);
  fireEvent.click(
    (await screen.findAllByRole("button", { name: "Create table" }))[0] as HTMLElement,
  );
  const dialog = await screen.findByRole("dialog");
  fireEvent.input(within(dialog).getByLabelText("Name"), { target: { value: "visits" } });
  fireEvent.input(within(dialog).getByLabelText("First column"), { target: { value: "title" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add another column" }));
  fireEvent.input(within(dialog).getByLabelText("Column 2"), { target: { value: "title" } });
  fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
  expect(await within(dialog).findByText(/There is already a column called "title"/)).toBeTruthy();
  fireEvent.input(within(dialog).getByLabelText("Column 2"), { target: { value: "other" } });
  fireEvent.change(within(dialog).getByLabelText("Column 2 holds"), {
    target: { value: "reference" },
  });
  fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
  expect(await within(dialog).findByText(/Choose the table that "other" points to/)).toBeTruthy();
  expect(calls.some((call) => call.method === "PUT")).toBe(false);
});

test("TAB-P8: a filter box says not, any of, not empty and a range, and the boxes may be any-of or all-of", async () => {
  expect(toFilter("number", "!empty")).toEqual({ op: "is_null", value: false });
  expect(toFilter("text", "!ada")).toEqual({ op: "ne", value: "ada" });
  expect(toFilter("integer", "10..20")).toEqual({
    and: [
      { op: "gte", value: 10 },
      { op: "lte", value: 20 },
    ],
  });
  expect(toFilter("integer", "..20")).toEqual({ op: "lte", value: 20 });
  expect(toFilter("date", "2026-01-01..")).toEqual({ op: "gte", value: "2026-01-01" });
  expect(toFilter("enum", "new | paid")).toEqual({ op: "in", value: ["new", "paid"] });
  expect(toFilter("text", "ada | bob")).toEqual({
    or: [
      { op: "contains", value: "ada" },
      { op: "contains", value: "bob" },
    ],
  });
  expect(() => toFilter("enum_list", "!a")).toThrow(/cannot be searched with not/);

  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  await screen.findByText("A-1");
  fireEvent.change(screen.getByLabelText("Filter by total"), { target: { value: "5..300" } });
  await waitFor(() =>
    expect(JSON.parse(lastRows().get("filter") ?? "null")).toEqual({
      and: [
        {
          and: [
            { column: "total", op: "gte", value: 5 },
            { column: "total", op: "lte", value: 300 },
          ],
        },
      ],
    }),
  );
  // Two boxes: rows may match either, when that is asked for, and it is in the address.
  fireEvent.change(screen.getByLabelText("Filter by number"), { target: { value: "A-1 | A-2" } });
  const match = await screen.findByLabelText("Rows must match");
  fireEvent.change(match, { target: { value: "any" } });
  await waitFor(() =>
    expect(JSON.parse(lastRows().get("filter") ?? "null")).toEqual({
      or: [
        {
          or: [
            { column: "number", op: "contains", value: "A-1" },
            { column: "number", op: "contains", value: "A-2" },
          ],
        },
        {
          and: [
            { column: "total", op: "gte", value: 5 },
            { column: "total", op: "lte", value: 300 },
          ],
        },
      ],
    }),
  );
  expect(new URLSearchParams(location.search).get("match")).toBe("any");
  navigate("/t/t1/workspaces/w1/tables/orders");
});

test("TAB-P9: Shift on a heading sorts by several columns, in the address and in the request", async () => {
  expect(nextSort([], "total", false)).toBe("total");
  expect(nextSort([{ column: "total", descending: false }], "total", false)).toBe("-total");
  expect(nextSort([{ column: "total", descending: true }], "total", false)).toBeUndefined();
  expect(nextSort([{ column: "total", descending: false }], "number", true)).toBe("total,number");
  expect(
    nextSort(
      [
        { column: "total", descending: false },
        { column: "number", descending: false },
      ],
      "number",
      true,
    ),
  ).toBe("total,-number");
  expect(
    nextSort(
      [
        { column: "total", descending: false },
        { column: "number", descending: true },
      ],
      "number",
      true,
    ),
  ).toBe("total");
  navigate("/t/t1/workspaces/w1/tables/orders");
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  await screen.findByText("A-1");
  fireEvent.click(screen.getByRole("columnheader", { name: /^total/ }));
  await waitFor(() => expect(lastRows().get("sort")).toBe("total"));
  fireEvent.click(screen.getByRole("columnheader", { name: /^number/ }), { shiftKey: true });
  await waitFor(() => expect(lastRows().get("sort")).toBe("total,number"));
  expect(new URLSearchParams(location.search).get("sort")).toBe("total,number");
  expect(screen.getByRole("columnheader", { name: /^number/ }).getAttribute("aria-sort")).toBe(
    "ascending",
  );
  // CSV is asked for with the same order.
  expect(screen.getByRole("link", { name: /CSV/ }).getAttribute("href")).toContain(
    "sort=total%2Cnumber",
  );
});

/** A table with a choice, a list, a reference, a day and a yes/no column, none of them filled in. */
function openEmptyCells() {
  const table = orders("ui");
  const more = (name: string, type: string, extra: object = {}) => ({
    name,
    type,
    required: false,
    unique: false,
    default: null,
    references: null,
    status: "active",
    held: null,
    ...extra,
  });
  (table.columns as unknown[]).push(
    more("state", "enum", { values: [{ value: "open" }, { value: "closed", label: "Closed" }] }),
    more("tags", "enum_list", { values: [{ value: "rush" }, { value: "gift" }] }),
    more("customer", "reference", { references: "customers" }),
    more("due", "date"),
    more("paid", "boolean"),
  );
  routes[`GET /api/v1${root}/tables/orders`] = () => [200, table];
  routes[`GET /api/v1${root}/tables/customers`] = () => [200, { display: "name" }];
  routes[`GET /api/v1${root}/rows/customers`] = () => [
    200,
    { items: [{ id: "c1", name: "Zelda Corp" }], nextCursor: null },
  ];
  const empty = { state: null, tags: null, customer: null, due: null, paid: null };
  routes[`GET /api/v1${root}/rows/orders`] = () => [
    200,
    { items: [{ ...rows[0], ...empty }], nextCursor: null },
  ];
  routes[`PATCH /api/v1${root}/row/r1/orders`] = (body) => [
    200,
    { ...rows[0], ...empty, ...(body as object) },
  ];
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
}
/** The cell of a column in the first row. */
async function firstRowCell(name: string) {
  const grid = await screen.findByRole("grid");
  await screen.findByText("A-1");
  const heads = within(grid).getAllByRole("columnheader");
  const at = heads.findIndex((head) => head.textContent?.startsWith(name));
  return grid.querySelector(`[data-cell="1:${at}"]`) as HTMLElement;
}
const patched = () => calls.filter((call) => call.method === "PATCH").map((call) => call.body);

test("TAB-P11 and TAB-31: an empty choice, list, reference or day opens its own control, and a yes/no goes round to empty", async () => {
  openEmptyCells();
  // A choice: a select of what it offers, and picking one saves it.
  fireEvent.doubleClick(await firstRowCell("state"));
  const choice = (await screen.findByLabelText("state")) as HTMLSelectElement;
  expect(choice.tagName).toBe("SELECT");
  expect([...choice.options].map((one) => one.textContent)).toEqual(["No value", "open", "Closed"]);
  fireEvent.change(choice, { target: { value: "closed" } });
  await waitFor(() => expect(patched()).toEqual([{ state: "closed" }]));
  await waitFor(() => expect(screen.queryByLabelText("state")).toBeNull());

  // A list, by Enter from the keyboard: the values to tick, in a dialog that Escape leaves.
  const tags = await firstRowCell("tags");
  fireEvent.focus(tags);
  fireEvent.keyDown(tags, { key: "Enter" });
  let dialog = await screen.findByRole("dialog", { name: "Change tags" });
  const box = within(dialog).getByRole("combobox");
  fireEvent.click(box);
  fireEvent.keyDown(box, { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "gift" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(patched().at(-1)).toEqual({ tags: ["gift"] }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  // A reference: the row is picked by its name, and the ID is never typed.
  fireEvent.doubleClick(await firstRowCell("customer"));
  dialog = await screen.findByRole("dialog", { name: "Change customer" });
  const picker = within(dialog).getByRole("combobox");
  fireEvent.click(picker);
  fireEvent.keyDown(picker, { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "Zelda Corp" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(patched().at(-1)).toEqual({ customer: "c1" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  // A day: a date field, and Cancel leaves the cell as it was.
  fireEvent.doubleClick(await firstRowCell("due"));
  dialog = await screen.findByRole("dialog", { name: "Change due" });
  expect(within(dialog).getByLabelText("due")).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(patched().length).toBe(3);

  // A yes/no that may be empty goes round: yes, no, empty again.
  const paid = await firstRowCell("paid");
  fireEvent.focus(paid);
  fireEvent.keyDown(paid, { key: "Enter" });
  await waitFor(() => expect(patched().at(-1)).toEqual({ paid: true }));
  await screen.findByText("Yes");
  fireEvent.keyDown(paid, { key: "Enter" });
  await waitFor(() => expect(patched().at(-1)).toEqual({ paid: false }));
  await screen.findByText("No");
  fireEvent.keyDown(paid, { key: "Enter" });
  await waitFor(() => expect(patched().at(-1)).toEqual({ paid: null }));
});
test("QSD-MP1: the list of data sources offers a new declaration and an edit of each declared one", async () => {
  routes[`GET /api/v1${root}/data-source-bindings`] = () => [
    200,
    {
      items: [
        { path: "erp", description: "The ERP", defined: true, bound: false, hasPassword: false },
        { path: "legacy", description: "", defined: false, bound: true, hasPassword: false },
      ],
    },
  ];
  show(<Sources root={root} link="/t/t1/workspaces/w1" />);
  await screen.findByText("erp");
  fireEvent.click(screen.getByRole("button", { name: "Declare source" }));
  expect(location.pathname).toBe("/t/t1/workspaces/w1/resources/new/data_source");
  const edit = screen.getByRole("link", { name: "Edit erp" });
  expect(edit.getAttribute("href")).toBe("/t/t1/workspaces/w1/resources/edit/data_source/erp");
  // A binding that nothing declares has no declaration to edit.
  expect(screen.queryByRole("link", { name: "Edit legacy" })).toBeNull();
});

test("QSD-MP11: a source that is declared and not connected has its own Connect, with its name in", async () => {
  routes[`GET /api/v1${root}/data-source-bindings`] = () => [
    200,
    {
      items: [
        { path: "erp", description: "The ERP", defined: true, bound: false, hasPassword: false },
      ],
    },
  ];
  routes[`PUT /api/v1${root}/data-source-bindings/erp`] = () => [200, {}];
  show(<Sources root={root} link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Connect erp" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.input(within(dialog).getByLabelText("Host"), { target: { value: "erp.internal" } });
  fireEvent.input(within(dialog).getByLabelText("Database"), { target: { value: "erp" } });
  fireEvent.input(within(dialog).getByLabelText("User"), { target: { value: "reader" } });
  fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
  await waitFor(() =>
    expect(calls.find((call) => call.method === "PUT")?.body).toMatchObject({
      config: { host: "erp.internal", database: "erp", user: "reader" },
    }),
  );
});

test("w-data 7: a text default is shown as a number's is, and 'optional' is said once on a field", async () => {
  editable({}, [
    column("status", "text", { default: "open" }),
    column("qty", "number", { default: 5 }),
  ]);
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Definition" }));
  await screen.findByText("open");
  expect(screen.queryByText('"open"')).toBeNull();
  expect(screen.getByText("5")).toBeTruthy();
  fireEvent.click(screen.getAllByRole("button", { name: "Rules" })[0] as HTMLElement);
  const dialog = await screen.findByRole("dialog");
  within(dialog).getByLabelText("Value when none is given");
  expect(within(dialog).queryByText("Optional.")).toBeNull();
});

test("w-limits 2: the add-row dialog marks a required column required, and an optional one optional", async () => {
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  await screen.findByText("A-1");
  fireEvent.click(screen.getByRole("button", { name: "Add row" }));
  const dialog = await screen.findByRole("dialog");
  const mark = (name: string) =>
    (within(dialog).getByLabelText(name, { selector: `input[name=${name}]` }) as HTMLElement)
      .closest("[class*=flex-col]")
      ?.querySelector("label")?.parentElement?.textContent;
  expect(mark("number")).toContain("*");
  expect(mark("number")).not.toContain("optional");
  expect(mark("total")).toContain("optional");
});

test("w-limits 2: a required yes/no column and a required reference are marked and refused when empty", async () => {
  routes[`GET /api/v1${root}/tables/orders`] = () => [
    200,
    {
      ...orders("code"),
      columns: [
        ...orders("code").columns,
        {
          name: "paid",
          type: "boolean",
          required: true,
          unique: false,
          default: null,
          references: null,
          status: "active",
          held: null,
        },
        {
          name: "shop",
          type: "reference",
          required: true,
          unique: false,
          default: null,
          references: "shops",
          status: "active",
          held: null,
        },
      ],
    },
  ];
  routes[`GET /api/v1${root}/rows/shops`] = () => [200, { items: [], nextCursor: null }];
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  await screen.findByText("A-1");
  fireEvent.click(screen.getByRole("button", { name: "Add row" }));
  const dialog = await screen.findByRole("dialog");
  const paid = within(dialog).getByLabelText("paid") as HTMLElement;
  expect(paid.closest("[class*=flex-col]")?.textContent).toContain("*");
  const shop = await within(dialog).findByLabelText("shop");
  expect(shop.closest("[class*=flex-col]")?.textContent).toContain("*");
  fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
  expect(await within(dialog).findByText("paid needs a value.")).toBeTruthy();
  expect(await within(dialog).findByText("shop needs a value.")).toBeTruthy();
});

test("TAB-36: the names of referenced rows are asked for the columns shown, and a reference box says it takes an ID", async () => {
  const reference = (name: string) => ({
    name,
    type: "reference",
    required: false,
    unique: false,
    default: null,
    references: "customers",
    status: "active",
    held: null,
    writable: true,
  });
  const names = ["a1", "a2", "a3", "a4", "a5", "a6", "a7"];
  routes[`GET /api/v1${root}/tables/orders`] = () => [
    200,
    {
      ...orders("ui"),
      columns: [{ ...orders("ui").columns[0] }, ...names.map(reference)],
    },
  ];
  navigate("/t/t1/workspaces/w1/tables/orders?cols=number&cols=a7&cols=a6");
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  await screen.findByText("A-1");
  await waitFor(() => expect(lastRows().get("expand")).toBe("a7,a6"));
  // A name typed in a reference's box is not an ID: it is said so, and nothing is asked for.
  const before = calls.length;
  fireEvent.change(screen.getByLabelText("Filter by a7"), { target: { value: "Acme" } });
  expect((await screen.findByRole("alert")).textContent).toMatch(/^a7: .*ID/);
  expect(calls.slice(before).some((call) => call.url.includes("filter="))).toBe(false);
  navigate("/t/t1/workspaces/w1/tables/orders");
});

test("TAB-34: Previous survives a reload, and a link to a row opens it when its page is not shown", async () => {
  // The address of page 2 says where Previous goes, so a reload keeps it.
  navigate("/t/t1/workspaces/w1/tables/orders?page=NTA&back=-");
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  await screen.findByText("A-1");
  const previous = screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement;
  expect(previous.disabled).toBe(false);
  fireEvent.click(previous);
  await waitFor(() => expect(lastRows().get("cursor")).toBeNull());
  expect(location.search).not.toContain("back=");
  cleanup();

  // A row that is not on the page shown is read by its ID.
  routes[`GET /api/v1${root}/row/r9/orders`] = () => [200, { ...rows[0], id: "r9", number: "Z-9" }];
  navigate("/t/t1/workspaces/w1/tables/orders?row=r9");
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  expect(await screen.findByLabelText("number")).toBeTruthy();
  expect((screen.getByLabelText("number") as HTMLInputElement).value).toBe("Z-9");
  cleanup();

  // One that is gone says so.
  routes[`GET /api/v1${root}/row/r8/orders`] = () => [
    404,
    { status: 404, detail: "The row was not found." },
  ];
  navigate("/t/t1/workspaces/w1/tables/orders?row=r8");
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  expect(await screen.findByText(/That row is gone/)).toBeTruthy();
  navigate("/t/t1/workspaces/w1/tables/orders");
});

test("TAB-37: a refused row save names the field, and a refused Add row keeps the file it uploaded", async () => {
  const refused = {
    status: 400,
    detail: "The row is not valid.",
    errors: [{ path: "/number", message: "is already used" }],
  };
  routes[`PATCH /api/v1${root}/row/r1/orders`] = () => [400, refused];
  openOrderWithCustomerAndFile({});
  const number = await screen.findByLabelText("number", { selector: "input[name=number]" });
  fireEvent.input(number, { target: { value: "A-2" } });
  fireEvent.click(await screen.findByRole("button", { name: "Save row" }));
  // The message is under the field, not only in a toast.
  await waitFor(() =>
    expect(number.closest("div")?.textContent ?? "").toMatch(
      /number is already used|is already used/,
    ),
  );
  cleanup();
  history.replaceState(history.state, "", location.pathname);

  // Add row: the file is uploaded once, whatever the number of tries.
  const files: string[] = [];
  routes[`POST /api/v1${root}/files`] = () => {
    files.push("up");
    return [201, { id: "f1", name: "a.txt" }];
  };
  routes[`POST /api/v1${root}/rows/orders`] = () => [400, refused];
  openOrderWithCustomerAndFile({});
  history.replaceState(history.state, "", location.pathname);
  fireEvent.click(await screen.findByRole("button", { name: "Add row" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.input(screen.getByLabelText("number", { selector: "input[name=number]" }), {
    target: { value: "A-9" },
  });
  const input = dialog.querySelector("input[type=file]") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], "a.txt")] } });
  fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
  await screen.findByText("The row is not valid.");
  fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
  await waitFor(() =>
    expect(
      calls.filter((call) => call.method === "POST" && call.url.endsWith("/rows/orders")),
    ).toHaveLength(2),
  );
  expect(files).toHaveLength(1);
});

test("item 28: a retired table with one row says '1 row is kept', not '1 rows'", async () => {
  routes[`GET /api/v1${root}/tables/orders`] = () => [
    200,
    { ...orders("code"), status: "retired", rowCount: 1 },
  ];
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  const notice = await screen.findByText(/This table is retired/);
  expect(notice.textContent).toContain("its 1 row is kept");
  expect(document.body.textContent).not.toContain("1 rows");
});

test("item 27: the row editor marks a required column required, and says 'optional' only of an optional one", async () => {
  history.replaceState(history.state, "", "?row=r1");
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  const required = await screen.findByLabelText("number", { selector: "input[name=number]" });
  const optional = await screen.findByLabelText("total", { selector: "input[name=total]" });
  const mark = (input: HTMLElement) =>
    input.closest("[class*=flex-col]")?.querySelector("label")?.parentElement?.textContent;
  expect(mark(required)).not.toContain("optional");
  expect(mark(optional)).toContain("optional");
});

test("item 29: Add row's file column is the inspector's button and name, not the browser's bare control", async () => {
  openOrderWithCustomerAndFile({});
  history.replaceState(history.state, "", location.pathname);
  fireEvent.click(await screen.findByRole("button", { name: "Add row" }));
  const dialog = await screen.findByRole("dialog");
  const input = dialog.querySelector("input[type=file]") as HTMLInputElement;
  expect(input.hidden).toBe(true);
  within(dialog).getByText("No file chosen");
  fireEvent.change(input, { target: { files: [new File(["x"], "a.txt")] } });
  await within(dialog).findByText("a.txt");
  fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
  within(dialog).getByText("No file chosen");
});

test("Phase 30 walk-fix F: a refusal with a code shown in Create table's dialog offers what the code means", async () => {
  routes[`GET /api/v1${root}/tables`] = () => [200, { items: [] }];
  routes[`PUT /api/v1${root}/resources/codes`] = () => [
    409,
    { status: 409, code: "path_taken", detail: 'Something is already at "codes".' },
  ];
  show(<Tables root={root} link="/t/t1/workspaces/w1" />);
  fireEvent.click(
    (await screen.findAllByRole("button", { name: "Create table" }))[0] as HTMLElement,
  );
  const dialog = await screen.findByRole("dialog");
  fireEvent.input(within(dialog).getByLabelText("Name"), { target: { value: "codes" } });
  fireEvent.input(within(dialog).getByLabelText("First column"), { target: { value: "title" } });
  fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
  await within(dialog).findByText(/already at "codes"/);
  expect(within(dialog).getByRole("button", { name: "What does this mean?" })).toBeTruthy();
});

test("Phase 30 walk-fix F: a refusal with a code shown in Add row's sheet offers what the code means", async () => {
  routes[`POST /api/v1${root}/rows/orders`] = () => [
    409,
    { status: 409, code: "draft_changed", detail: "Someone else saved this since you opened it." },
  ];
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Add row" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.input(screen.getByLabelText("number", { selector: "input[name=number]" }), {
    target: { value: "A-9" },
  });
  fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
  await within(dialog).findByText("Someone else saved this since you opened it.");
  expect(within(dialog).getByRole("button", { name: "What does this mean?" })).toBeTruthy();
});

test("m1fix: a file field with no file offers choosing one, and adding it asks nothing about a history", async () => {
  routes[`POST /api/v1${root}/files`] = () => [201, { id: "f2", name: "new.txt" }];
  routes[`PATCH /api/v1${root}/row/r1/orders`] = (body) => [
    200,
    { ...rows[0], ...(body as object) },
  ];
  openOrderWithCustomerAndFile({});
  await screen.findByLabelText("New file for attachment");
  expect(screen.queryByRole("button", { name: "Replace" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  expect(screen.getByRole("button", { name: "Choose a file" })).toBeTruthy();
  const input = screen.getByLabelText("New file for attachment") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["hi"], "new.txt")] } });
  await waitFor(() =>
    expect(calls.find((call) => call.method === "PATCH")?.body).toEqual({ attachment: "f2" }),
  );
  expect(screen.queryByText(/old file stays/)).toBeNull();
});

test("m1fix: Who sees rows says it is saved in rules mode as in owner mode, when the server answers with the keys in its own order", async () => {
  const saved = editable();
  const table = orders("ui");
  (table as { policy: unknown }).policy = { type: "open" };
  routes[`GET /api/v1${root}/tables/orders`] = () => [200, table];
  routes[`PUT /api/v1${root}/resources/orders`] = (body) => {
    const policy = (body as { body: { policy: { rules?: { allow: string; when: object }[] } } })
      .body.policy;
    // The store keeps an object's keys in an order of its own: `when` comes before `allow`.
    table.policy = {
      type: "rules",
      rules: (policy.rules ?? []).map((rule) => ({ when: rule.when, allow: rule.allow })),
    } as never;
    return [200, { version: 4 }];
  };
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Definition" }));
  fireEvent.change(await screen.findByLabelText("Who sees rows"), { target: { value: "rules" } });
  fireEvent.click(screen.getByRole("button", { name: "Save who sees rows" }));
  await waitFor(() => expect(saved().body).toBeTruthy());
  expect(await screen.findByText("Saved. It applies from the next request.")).toBeTruthy();
  // It stays, after the screen has read the table again.
  await new Promise((done) => setTimeout(done, 300));
  expect(screen.getByText("Saved. It applies from the next request.")).toBeTruthy();
}, 15000);

test("m1fix: a table's description past 500 characters is refused at the field, in Create table and when it is edited, and is never cut", async () => {
  const long = "x".repeat(501);
  // Create table.
  routes[`GET /api/v1${root}/tables`] = () => [200, { items: [] }];
  routes[`PUT /api/v1${root}/resources/visits`] = () => [201, {}];
  show(<Tables root={root} link="/t/t1/workspaces/w1" />);
  fireEvent.click(
    (await screen.findAllByRole("button", { name: "Create table" }))[0] as HTMLElement,
  );
  const dialog = await screen.findByRole("dialog");
  fireEvent.input(within(dialog).getByLabelText("Name"), { target: { value: "visits" } });
  fireEvent.input(within(dialog).getByLabelText("What it holds"), { target: { value: long } });
  fireEvent.input(within(dialog).getByLabelText("First column"), { target: { value: "title" } });
  fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
  expect(await within(dialog).findByText("Use at most 500 characters. This is 501.")).toBeTruthy();
  expect(calls.some((call) => call.method === "PUT")).toBe(false);
  cleanup();

  // Editing it from Definition.
  const saved = editable();
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Definition" }));
  fireEvent.click(await screen.findByRole("button", { name: "Describe the table" }));
  const asked = await screen.findByRole("dialog");
  fireEvent.change(within(asked).getByRole("textbox"), { target: { value: long } });
  expect(await within(asked).findByText("Use at most 500 characters. This is 501.")).toBeTruthy();
  expect((within(asked).getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(saved()).toBeUndefined();
}, 20000);

test("round 5: on a phone a source's buttons sit under its name, from the left, in the column that has the room, and wrap there", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  routes[`GET /api/v1${root}/data-source-bindings`] = () => [
    200,
    {
      items: [
        {
          path: "erp",
          description: "The ERP",
          bound: true,
          defined: true,
          config: { host: "erp.internal", database: "erp", user: "reader" },
          hasPassword: true,
          health: null,
        },
      ],
    },
  ];
  show(<Sources root={root} link="/t/t1/workspaces/w1" />);
  const test = await screen.findByRole("button", { name: "Test" });
  // In the first cell, where the name is, not in a column of their own past the edge.
  const cell = test.closest("td") as HTMLElement;
  expect(cell.parentElement?.firstElementChild).toBe(cell);
  const actions = test.closest("[data-row-actions]") as HTMLElement;
  expect(actions.className).toContain("flex-wrap");
  expect(actions.className).toContain("justify-start");
  expect(actions.className).not.toContain("justify-end");
  // That column keeps room for the widest button (14rem), and the table has no column of actions.
  expect(screen.getByRole("columnheader", { name: "Source" }).className).toContain("w-[14rem]");
  expect(screen.queryByRole("columnheader", { name: "Actions" })).toBeNull();
});

test("p31 fc: a source page whose read answers only 'Internal Server Error' while it encrypts says the server may not support encryption", async () => {
  routes[`GET /api/v1${root}/data-source-tables/erp`] = () => [
    500,
    { status: 500, title: "Internal Server Error" },
  ];
  routes[`GET /api/v1${root}/data-source-bindings`] = () => [
    200,
    {
      items: [
        {
          path: "erp",
          bound: true,
          config: { host: "h", database: "d", user: "u", ssl: true },
          hasPassword: true,
          health: null,
        },
      ],
    },
  ];
  show(<SourceView root={root} path="erp" link="/t/t1/workspaces/w1" />);
  await screen.findByText(/does not support encrypted connections|may not support encrypted/);
  expect(document.body.textContent).not.toContain("Internal Server Error");
});

test("a table in code is taken over in the console, after saying what that means, and then edited", async () => {
  const body = { columns: { number: { type: "text", required: true } } };
  let ownership = "code";
  routes[`GET /api/v1${root}/tables/orders`] = () => [200, orders(ownership)];
  routes[`GET /api/v1${root}`] = () => [200, { id: "w1", type: "dev" }];
  routes[`GET /api/v1${root}/resources/orders`] = () => [200, { body, version: 3 }];
  routes[`PUT /api/v1${root}/resources/orders`] = () => {
    ownership = "ui";
    return [200, { version: 4 }];
  };
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Definition" }));
  expect(screen.queryByRole("button", { name: "Add column" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Take over in the console" }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).toContain("manages this table as files");
  expect(dialog.textContent).toContain("as defined twice");
  expect(dialog.textContent).toContain("volvel pull");
  expect(dialog.textContent).toContain('ctx.table("orders")');
  // Nothing is saved until it is confirmed.
  expect(calls.some((call) => call.method === "PUT")).toBe(false);
  fireEvent.click(within(dialog).getByRole("button", { name: "Take over" }));
  await waitFor(() =>
    expect(calls.find((call) => call.method === "PUT")?.body).toEqual({
      kind: "table",
      schemaVersion: 1,
      ownership: "ui",
      takeOver: true,
      body,
      version: 3,
    }),
  );
  expect(await screen.findByRole("button", { name: "Add column" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Take over in the console" })).toBeNull();
});

test("a table in code cannot be taken over in a production workspace", async () => {
  routes[`GET /api/v1${root}`] = () => [200, { id: "w1", type: "production" }];
  show(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Definition" }));
  await screen.findByText(/A production workspace changes by a deploy only/);
  expect(screen.queryByRole("button", { name: "Take over in the console" })).toBeNull();
});

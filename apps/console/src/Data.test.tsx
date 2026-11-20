// @vitest-environment happy-dom
import { cleanup, configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Sources, SourceView, TableView, toFilter } from "./screens/Data.tsx";
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
    screen.getByText(
      /2 rows\. Each person sees their own rows \(owner_id\)\. Managed in the repository\./,
    ),
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
  expect((await screen.findByRole("alert")).textContent).toBe("Enter a number.");
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
  expect(await screen.findByText("is required")).toBeTruthy();
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
  expect(screen.getByText(/defined in the tenant's repository/)).toBeTruthy();
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
  fireEvent.input(screen.getByLabelText("Value when none is given"), { target: { value: "no" } });
  fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
  await waitFor(() =>
    expect(saved().body.columns.paid).toEqual({ type: "boolean", default: false }),
  );
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
});

test("filter text becomes a filter of the column's type", () => {
  expect(toFilter("text", " ada ")).toEqual({ op: "contains", value: "ada" });
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
  fireEvent.input(host, { target: { value: "erp2.internal" } });
  fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
  await waitFor(() =>
    expect(calls.find((call) => call.method === "PUT")?.body).toEqual({
      config: { host: "erp2.internal", port: 5433, database: "erp", user: "reader", ssl: true },
    }),
  );
});

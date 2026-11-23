// @vitest-environment happy-dom
import { cleanup, configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { parseValue } from "@volvel/ui";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { navigate } from "./router.tsx";
import {
  bodyToRestore,
  moveColumn,
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
      return [409, { status: 409, detail: "Someone else saved orders after you opened it." }];
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
  expect(await screen.findByText(/Someone else saved orders/)).toBeTruthy();
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

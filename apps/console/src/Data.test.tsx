// @vitest-environment happy-dom
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SourceView, TableView, toFilter } from "./screens/Data.tsx";

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
  render(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  await screen.findByText("A-1");
  expect(
    screen.getByText(
      /2 rows\. Each person sees their own rows \(owner_id\)\. Managed in the repository\./,
    ),
  ).toBeTruthy();
  expect(screen.getByText("Rows 1 to 2")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: /^total/ }));
  await waitFor(() => expect(lastRows().get("sort")).toBe("total"));
  fireEvent.click(screen.getByRole("button", { name: /^total/ }));
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
  await screen.findByText("Rows 51 to 52");
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
  routes[`DELETE /api/v1${root}/row/r2/orders`] = () => [204, null];
  vi.stubGlobal("confirm", () => true);
  render(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);

  // Each element that appears after an action is waited for: under a loaded machine the
  // screen may not have caught up by the next line.
  fireEvent.click(await screen.findByText("10"));
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

  await waitFor(() => expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(2));
  fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[1] as HTMLElement);
  await waitFor(() =>
    expect(
      calls.some((call) => call.method === "DELETE" && call.url.endsWith("/row/r2/orders")),
    ).toBe(true),
  );
});

test("a table from the repository is read-only in its definition, and shows what retired columns hold", async () => {
  routes[`POST /api/v1${root}/table-purges`] = () => [200, { dropped: "orders.notes" }];
  vi.stubGlobal("confirm", () => true);
  render(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Definition" }));
  expect(screen.getByText(/defined in the tenant's repository/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Add column" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Retire" })).toBeNull();
  expect(screen.getByText("2 values")).toBeTruthy();
  expect(screen.getByText("ws_abc.orders")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Delete for good" }));
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
  vi.stubGlobal("prompt", () => "amount");
  vi.stubGlobal("confirm", () => true);
  render(<TableView root={root} name="orders" link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Definition" }));
  const saved = () =>
    calls.filter((call) => call.method === "PUT").at(-1)?.body as {
      ownership: string;
      body: typeof body & { columns: Record<string, unknown> };
    };

  fireEvent.click(screen.getAllByRole("button", { name: "Rename" })[1] as HTMLElement);
  await waitFor(() =>
    expect(saved()?.body.columns).toEqual({
      number: body.columns.number,
      owner_id: body.columns.owner_id,
      amount: { type: "number", default: 0, renamedFrom: "total" },
    }),
  );
  expect(saved().ownership).toBe("ui");

  fireEvent.click(screen.getAllByRole("button", { name: "Retire" })[1] as HTMLElement);
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
  render(<SourceView root={root} path="erp" link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByText("Ada"));
  fireEvent.input(screen.getByLabelText("name"), { target: { value: "Ada L." } });
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

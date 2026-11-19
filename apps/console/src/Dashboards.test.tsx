// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Dashboards, DashboardView } from "./screens/Dashboards.tsx";
import { answer, show } from "./testing.tsx";

const root = "/tenants/t1/workspaces/w1";
const api = `/api/v1${root}`;
let calls: { method: string; url: string; body: unknown }[];
let routes: Record<string, (body: unknown, url: string) => [number, unknown]>;
// biome-ignore lint/suspicious/noExplicitAny: what was sent is inspected freely
type Any = any;

const result = (names: [string, string][], rows: unknown[][]) => ({
  columns: names.map(([name, type]) => ({ name, type })),
  rows,
  truncated: false,
  tables: ["stock"],
  sql: "",
});
const mine = {
  id: "d1",
  kind: "member",
  path: null,
  title: "Stock",
  mine: true,
  owner: "Mona",
  shared: false,
  revision: 4,
  updatedAt: "2026-11-13T10:00:00.000Z",
  upgraded: false,
  body: {
    version: 2,
    filters: [{ name: "added", label: "Added", type: "date_range", default: "last_30_days" }],
    widgets: [
      {
        id: "held",
        type: "table",
        title: "Held",
        source: { visual: { table: "stock", columns: ["item", "held"] } },
        filters: [{ filter: "added", column: "created_at" }],
      },
      {
        id: "total",
        type: "figure",
        title: "In stock",
        source: {
          visual: { table: "stock", measures: [{ fn: "sum", column: "held", as: "held" }] },
        },
        filters: [{ filter: "added", column: "created_at" }],
        options: { value: "held", compareTo: "added" },
      },
      {
        id: "by-kind",
        type: "pivot",
        title: "By kind",
        source: {
          visual: {
            table: "stock",
            groupBy: [{ column: "kind" }, { column: "shelf" }],
            measures: [{ fn: "sum", column: "held", as: "held" }],
          },
        },
        options: { rows: ["kind"], columns: ["shelf"], value: "held" },
      },
      { id: "note", type: "text", options: { text: "Counted weekly." } },
    ],
  },
};

beforeEach(() => {
  calls = [];
  history.replaceState(null, "", "/");
  routes = {
    [`GET ${api}/dashboards/d1/widgets/held/data`]: () => [
      200,
      result(
        [
          ["item", "text"],
          ["held", "number"],
        ],
        [["Bolts", 40]],
      ),
    ],
    // Asked twice: for the range the filter is set to, and for the one before it.
    [`GET ${api}/dashboards/d1/widgets/total/data`]: (_body, url) => {
      const filters = JSON.parse(new URL(url, "http://x").searchParams.get("filters") ?? "{}");
      const before =
        filters.added && new Date(filters.added.to) < new Date(Date.now() - 20 * 86_400_000);
      return [200, result([["held", "number"]], [[before ? 50 : 65]])];
    },
    [`GET ${api}/dashboards/d1/widgets/by-kind/data`]: () => [
      200,
      result(
        [
          ["kind", "text"],
          ["shelf", "text"],
          ["held", "number"],
        ],
        [
          ["fixings", "A", 40],
          ["fixings", "B", 25],
          ["tools", "A", 3],
        ],
      ),
    ],
    [`GET ${api}/queries/schema`]: () => [
      200,
      {
        tables: [
          {
            name: "stock",
            display: null,
            columns: [
              { name: "item", type: "text", references: null },
              { name: "held", type: "integer", references: null },
            ],
          },
        ],
        functions: [],
        maySql,
      },
    ],
    [`GET ${api}/queries`]: () => [200, { items: [] }],
    [`GET ${api}/queries/visual`]: () => [
      200,
      {
        ...result([["count", "number"]], [[2]]),
        written: { sql: "select count(*) from stock", parameters: [] },
      },
    ],
  };
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const sent = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url: address, body: sent });
    const path = address.split("?")[0] as string;
    const [status, reply] = (routes[`${method} ${address}`] ?? routes[`${method} ${path}`])?.(
      sent,
      address,
    ) ?? [404, { detail: "No mock" }];
    return new Response(reply === null ? null : JSON.stringify(reply), { status });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const sent = (method: string) => calls.filter((call) => call.method === method);
/** What the nth save sent. */
const put = (n: number): Any => (sent("PUT")[n] as { body: Any }).body;

let maySql = false;

test("dashboards are listed with whose they are, and one the workspace keeps says so", async () => {
  routes[`GET ${api}/dashboards`] = () => [
    200,
    {
      items: [
        {
          ...mine,
          id: "r1",
          kind: "resource",
          path: "boards/lending",
          title: "Lending",
          mine: false,
          shared: true,
        },
        mine,
        { ...mine, id: "d2", title: "Sales", mine: false, owner: "Alice", shared: true },
      ],
    },
  ];
  routes[`POST ${api}/dashboards`] = () => [201, { ...mine, id: "d9", title: "Returns" }];
  show(<Dashboards root={root} link="/t/t1/workspaces/w1" />);
  const rows = await screen.findAllByRole("row");
  expect(within(rows[1] as HTMLElement).getByText("Resource")).toBeTruthy();
  expect(within(rows[1] as HTMLElement).getByText("The workspace's")).toBeTruthy();
  expect(within(rows[2] as HTMLElement).getByText("Yours")).toBeTruthy();
  expect(within(rows[2] as HTMLElement).getByText("Only you")).toBeTruthy();
  expect(within(rows[3] as HTMLElement).getByText("Alice")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "New dashboard" }));
  await answer("Make the dashboard", "Returns");
  // A new one opens ready to be added to.
  await waitFor(() => expect(window.location.pathname).toBe("/t/t1/workspaces/w1/dashboards/d9"));
  expect(window.location.search).toBe("?edit=1");
  expect(sent("POST")[0]?.body).toEqual({ title: "Returns" });
});

test("each widget asks for what it shows, with the filters as they are set, and draws it", async () => {
  routes[`GET ${api}/dashboards/d1`] = () => [200, mine];
  show(<DashboardView root={root} link="/t/t1/workspaces/w1" id="d1" />);
  await within(await screen.findByRole("region", { name: "Held" })).findByText("Bolts");
  // A figure, and how it stands against the period before the one its filter is set to.
  const figure = within(screen.getByRole("region", { name: "In stock" }));
  await figure.findByText("65");
  await figure.findByText("30% more than the period before");
  // A pivot: kinds down the side, shelves across the top, and totals.
  const turned = within(screen.getByRole("region", { name: "By kind" }));
  await turned.findByRole("columnheader", { name: "A" });
  expect(turned.getByRole("rowheader", { name: "fixings" })).toBeTruthy();
  expect(turned.getAllByRole("row").map((row) => row.textContent)).toEqual([
    "kindABTotal",
    "fixings402565",
    "tools33",
    "Total432568",
  ]);
  expect(screen.getByText("Counted weekly.")).toBeTruthy();
  // The filter's default is what the widgets were asked with: a range of thirty days ending today.
  const asked = JSON.parse(
    new URL(
      calls.find((call) => call.url.includes("/widgets/held/data"))?.url as string,
      "http://x",
    ).searchParams.get("filters") as string,
  );
  expect(Object.keys(asked)).toEqual(["added"]);
  expect(asked.added.to).toBe(
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`,
  );

  // Set to another range, every widget bound to it asks again, and the address keeps what was set.
  fireEvent.change(screen.getByLabelText("Added"), { target: { value: "all" } });
  await waitFor(() =>
    expect(calls.filter((call) => call.url.includes("/widgets/held/data")).at(-1)?.url).toContain(
      `filters=${encodeURIComponent("{}")}`,
    ),
  );
  expect(JSON.parse(new URLSearchParams(window.location.search).get("f") as string)).toEqual({
    added: "all",
  });
  // With no range there is no period before to compare with.
  await waitFor(() => expect(figure.queryByText(/than the period before/)).toBeNull());
});

test("its maker adds a widget built from menus, moves and removes widgets, and shares it", async () => {
  let stored: Any = mine;
  routes[`GET ${api}/dashboards/d1`] = () => [200, stored];
  routes[`PUT ${api}/dashboards/d1`] = (body) => {
    stored = { ...stored, ...(body as object), revision: stored.revision + 1 };
    return [200, stored];
  };
  show(<DashboardView root={root} link="/t/t1/workspaces/w1" id="d1" />);
  await screen.findByRole("region", { name: "Held" });
  // Looking, there is nothing to change with.
  expect(screen.queryByRole("button", { name: "Add a widget" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));

  fireEvent.click(screen.getByRole("button", { name: "Add a widget" }));
  const sheet = within(await screen.findByRole("dialog"));
  fireEvent.change(sheet.getByLabelText("Title"), { target: { value: "How many" } });
  fireEvent.change(sheet.getByLabelText("It is"), { target: { value: "figure" } });
  fireEvent.change(await sheet.findByLabelText("Table"), { target: { value: "stock" } });
  // Someone without `sql:read` is not offered SQL, which a save would refuse.
  expect(sheet.queryByRole("option", { name: "SQL written here" })).toBeNull();
  fireEvent.change(sheet.getByLabelText("Show"), { target: { value: "totals" } });
  // The answer is shown as the question is built.
  await within(sheet.getByRole("region", { name: "What it gives" })).findByText("2", undefined, {
    timeout: 3000,
  });
  // The dashboard's filter is given a column of this widget's table.
  fireEvent.change(sheet.getByLabelText("Added"), { target: { value: "created_at" } });
  fireEvent.click(sheet.getByRole("button", { name: "Save the widget" }));
  await waitFor(() => expect(sent("PUT")).toHaveLength(1));
  const saved = put(0).body.widgets.at(-1);
  expect(saved).toMatchObject({
    type: "figure",
    title: "How many",
    source: { visual: { table: "stock", measures: [{ fn: "count", as: "count" }] } },
    filters: [{ filter: "added", column: "created_at" }],
  });
  expect(put(0).revision).toBe(4);

  // Moved earlier, and another removed, each saved as it is done.
  fireEvent.click(await screen.findByRole("button", { name: "Move In stock earlier" }));
  await waitFor(() => expect(sent("PUT")).toHaveLength(2));
  expect(
    put(1)
      .body.widgets.map((one: Any) => one.id)
      .slice(0, 2),
  ).toEqual(["total", "held"]);
  fireEvent.click(screen.getByRole("button", { name: "Remove By kind" }));
  await answer("Remove");
  await waitFor(() => expect(sent("PUT")).toHaveLength(3));
  expect(put(2).body.widgets.map((one: Any) => one.id)).not.toContain("by-kind");

  // Sharing is its own step.
  fireEvent.click(screen.getByRole("button", { name: "Share" }));
  fireEvent.click(
    within(await screen.findByRole("dialog")).getByLabelText(
      "Show it to everyone in this workspace",
    ),
  );
  await waitFor(() => expect(sent("PUT")).toHaveLength(4));
  expect(sent("PUT")[3]?.body).toEqual({ shared: true, revision: 7 });
});

test("someone who holds sql:read is offered SQL in a widget", async () => {
  maySql = true;
  routes[`GET ${api}/dashboards/d1`] = () => [200, mine];
  show(<DashboardView root={root} link="/t/t1/workspaces/w1" id="d1" />);
  await screen.findByRole("region", { name: "Held" });
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.click(screen.getByRole("button", { name: "Add a widget" }));
  const sheet = within(await screen.findByRole("dialog"));
  await sheet.findByRole("option", { name: "SQL written here" });
  maySql = false;
});

test("a dashboard someone else shared, or the workspace keeps, is looked at and offers no way to change it", async () => {
  routes[`GET ${api}/dashboards/d1`] = () => [
    200,
    { ...mine, mine: false, owner: "Alice", shared: true },
  ];
  const { unmount } = show(<DashboardView root={root} link="/t/t1/workspaces/w1" id="d1" />);
  await screen.findByText(/Alice's, shared with you\. You see the rows you may read/);
  await within(screen.getByRole("region", { name: "Held" })).findByText("Bolts");
  for (const name of ["Edit", "Share", "Add a widget", "More"]) {
    expect(screen.queryByRole("button", { name })).toBeNull();
  }
  unmount();
  routes[`GET ${api}/dashboards/d1`] = () => [
    200,
    { ...mine, kind: "resource", path: "boards/stock", mine: false, shared: true },
  ];
  show(<DashboardView root={root} link="/t/t1/workspaces/w1" id="d1" />);
  await screen.findByText(/A dashboard the workspace keeps, at boards\/stock/);
  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
});

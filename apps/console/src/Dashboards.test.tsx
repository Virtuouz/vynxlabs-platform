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
  body: {
    widgets: [
      {
        // The dashboard's filter, beside the stat: whoever reads it sets it.
        id: "filters",
        type: "core/filter",
        at: { x: 9, y: 8, w: 3, h: 2 },
        config: {
          filters: [
            { name: "created_at", label: "Added", type: "date_range", default: "last_30_days" },
          ],
        },
      },
      {
        id: "held",
        type: "core/table",
        title: "Held",
        at: { x: 0, y: 0, w: 12, h: 8 },
        data: {
          rows: {
            source: { visual: { table: "stock", columns: ["item", "held"] } },
            filters: [{ filter: "created_at", column: "created_at" }],
          },
        },
      },
      {
        id: "total",
        type: "core/stat",
        title: "In stock",
        at: { x: 0, y: 8, w: 3, h: 3 },
        data: {
          value: {
            source: {
              visual: { table: "stock", measures: [{ fn: "sum", column: "held", as: "held" }] },
            },
            filters: [{ filter: "created_at", column: "created_at" }],
          },
        },
      },
      {
        id: "note",
        type: "core/text",
        at: { x: 3, y: 8, w: 6, h: 2 },
        config: { text: "Counted weekly." },
      },
    ],
  },
};

beforeEach(() => {
  calls = [];
  history.replaceState(null, "", "/");
  routes = {
    // Every widget asks the one endpoint for what it shows.
    [`GET ${api}/widget-data`]: () => [200, { inputs: {} }],
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
              { name: "kind", type: "enum", references: null },
            ],
          },
        ],
        functions: [],
        maySql,
      },
    ],
    [`GET ${api}/queries`]: () => [200, { items: [] }],
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

test("each widget asks the one endpoint for what it shows, as the dashboard, with the filters as they are set", async () => {
  routes[`GET ${api}/dashboards/d1`] = () => [200, mine];
  history.replaceState(
    null,
    "",
    `/?f=${encodeURIComponent(JSON.stringify({ created_at: "last_7_days" }))}`,
  );
  show(<DashboardView root={root} link="/t/t1/workspaces/w1" id="d1" />);
  await screen.findByLabelText("Held", { selector: "section" });
  // The text widget reads nothing, so it asks nothing.
  await waitFor(() =>
    expect(calls.filter((call) => call.url.includes("/widget-data"))).toHaveLength(2),
  );
  const asked = calls
    .filter((call) => call.url.includes("/widget-data"))
    .map((call) => new URL(call.url, "http://x").searchParams);
  expect(asked.map((params) => params.get("widget")).sort()).toEqual(["held", "total"]);
  for (const params of asked) {
    expect(params.get("of")).toBe("dashboard");
    expect(params.get("path")).toBe("d1");
    // A dashboard is read as it is stored, never as a draft.
    expect(params.get("draft")).toBeNull();
    expect(JSON.parse(params.get("filters") as string)).toEqual({ created_at: "last_7_days" });
  }
  expect(screen.getByText(/Refreshes every 5 minutes/)).toBeTruthy();
});

test("its maker adds a widget from Add to page, changes it in its settings, removes widgets, and shares it", async () => {
  let stored: Any = mine;
  routes[`GET ${api}/dashboards/d1`] = () => [200, stored];
  routes[`PUT ${api}/dashboards/d1`] = (body) => {
    stored = { ...stored, ...(body as object), revision: stored.revision + 1 };
    return [200, stored];
  };
  show(<DashboardView root={root} link="/t/t1/workspaces/w1" id="d1" />);
  await screen.findByLabelText("Held", { selector: "section" });
  // Looking, there is nothing to change with.
  expect(screen.queryByRole("button", { name: "Add to page" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));

  // What can be added is what the registry offers a dashboard, by what it is for.
  fireEvent.click(screen.getAllByRole("button", { name: "Add to page" })[0] as HTMLElement);
  const dialog = within(await screen.findByRole("dialog", { name: "Add to page" }));
  expect(dialog.getByText("Work with records")).toBeTruthy();
  expect(dialog.getByText("A trend or a comparison")).toBeTruthy();
  expect(
    dialog.getByText(
      "Click to place at the end of the page, or drag it onto the page where you want it.",
    ),
  ).toBeTruthy();
  fireEvent.change(dialog.getByLabelText("Find something to add"), { target: { value: "chart" } });
  expect(dialog.queryByText("Many records, dense and sortable")).toBeNull();
  fireEvent.click(dialog.getByRole("button", { name: /Chart/ }));
  await waitFor(() => expect(sent("PUT")).toHaveLength(1));
  const added = put(0).body.widgets.at(-1);
  // It goes under the rest, as big as a chart is to begin with, and reads the page's table.
  expect(added).toMatchObject({
    id: "chart",
    type: "core/chart",
    title: "Chart",
    at: { x: 0, y: 11, w: 6, h: 6 },
    config: { mark: "bar", legend: "auto" },
  });
  expect(added.data.rows.source.visual).toMatchObject({
    table: "stock",
    measures: [{ fn: "count", as: "count" }],
  });
  // The dashboard's date filter follows it, since the table has the column.
  expect(added.data.rows.filters).toEqual([{ filter: "created_at", column: "created_at" }]);
  expect(put(0).revision).toBe(4);

  // The new widget is the one being changed: its settings are beside the page.
  const settings = within(screen.getByRole("complementary", { name: "Settings" }));
  fireEvent.click(settings.getByRole("tab", { name: /^Display/ }));
  fireEvent.click(settings.getByRole("button", { name: /^Title/ }));
  fireEvent.change(await screen.findByRole("textbox", { name: "Title" }), {
    target: { value: "How many" },
  });
  await waitFor(() => expect(sent("PUT")).toHaveLength(2));
  expect(put(1).body.widgets.at(-1).title).toBe("How many");

  // Another widget is chosen by clicking it, and removed from its menu; it can be taken back.
  fireEvent.click(screen.getByLabelText("In stock", { selector: "section" }));
  fireEvent.click(await screen.findByRole("button", { name: "More about In stock" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));
  await waitFor(() => expect(sent("PUT")).toHaveLength(3));
  expect(put(2).body.widgets.map((one: Any) => one.id)).not.toContain("total");
  fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
  await waitFor(() => expect(sent("PUT")).toHaveLength(4));
  expect(put(3).body.widgets.map((one: Any) => one.id)).toContain("total");

  // Sharing is its own step.
  fireEvent.click(screen.getByRole("button", { name: "Share" }));
  fireEvent.click(
    within(await screen.findByRole("dialog")).getByLabelText(
      "Show it to everyone in this workspace",
    ),
  );
  await waitFor(() => expect(sent("PUT")).toHaveLength(5));
  expect(sent("PUT")[4]?.body).toEqual({ shared: true, revision: 8 });
});

test("a dashboard's filters are edited through its Search and filter widget, with no section for them under the page", async () => {
  let stored: Any = mine;
  routes[`GET ${api}/dashboards/d1`] = () => [200, stored];
  routes[`PUT ${api}/dashboards/d1`] = (body) => {
    stored = { ...stored, ...(body as object), revision: stored.revision + 1 };
    return [200, stored];
  };
  show(<DashboardView root={root} link="/t/t1/workspaces/w1" id="d1" />);
  await screen.findByLabelText("Held", { selector: "section" });
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  // The old section under the canvas is gone.
  expect(screen.queryByText("Filters for whoever reads this page")).toBeNull();
  expect(screen.queryByRole("button", { name: "Add a filter" })).toBeNull();
  // The widget is chosen, and its Data tab holds the list.
  fireEvent.click(await screen.findByRole("button", { name: "Search and filter" }));
  const settings = within(screen.getByRole("complementary", { name: "Settings" }));
  fireEvent.change(settings.getByLabelText("Called"), { target: { value: "Created" } });
  await waitFor(() => expect(sent("PUT")).toHaveLength(1));
  const saved = put(0);
  // Kept by the widget, not beside the widgets, and the name is what the widgets follow.
  expect(saved.body.filters).toBeUndefined();
  expect(saved.body.widgets.find((one: Any) => one.id === "filters").config.filters).toEqual([
    { name: "created_at", label: "Created", type: "date_range", default: "last_30_days" },
  ]);
  expect(saved.body.widgets.find((one: Any) => one.id === "held").data.rows.filters).toEqual([
    { filter: "created_at", column: "created_at" },
  ]);
  // A search is added to it, and the table follows it by its text columns.
  fireEvent.click(settings.getByRole("button", { name: "Add a search" }));
  await waitFor(() => expect(sent("PUT")).toHaveLength(2));
  const searched = put(1).body.widgets;
  expect(searched.find((one: Any) => one.id === "filters").config.filters.at(-1)).toMatchObject({
    name: "search_stock",
    type: "search",
  });
  expect(searched.find((one: Any) => one.id === "held").data.rows.filters).toContainEqual({
    filter: "search_stock",
    columns: ["item"],
  });
});

test("someone who holds sql:read is offered SQL as a source, and someone who does not is not", async () => {
  routes[`GET ${api}/dashboards/d1`] = () => [200, mine];
  maySql = true;
  const { unmount } = show(<DashboardView root={root} link="/t/t1/workspaces/w1" id="d1" />);
  await screen.findByLabelText("Held", { selector: "section" });
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.click(screen.getByLabelText("Held", { selector: "section" }));
  fireEvent.click(await screen.findByRole("button", { name: /^Source/ }));
  expect(await screen.findByLabelText("SQL written here")).toBeTruthy();
  maySql = false;
  unmount();
  history.replaceState(null, "", "/");
  show(<DashboardView root={root} link="/t/t1/workspaces/w1" id="d1" />);
  await screen.findByLabelText("Held", { selector: "section" });
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.click(screen.getByLabelText("Held", { selector: "section" }));
  fireEvent.click(await screen.findByRole("button", { name: /^Source/ }));
  await screen.findByLabelText("Stock");
  expect(screen.queryByLabelText("SQL written here")).toBeNull();
});

test("a dashboard someone else shared, or the workspace keeps, is looked at and offers no way to change it", async () => {
  routes[`GET ${api}/dashboards/d1`] = () => [
    200,
    { ...mine, mine: false, owner: "Alice", shared: true },
  ];
  const { unmount } = show(<DashboardView root={root} link="/t/t1/workspaces/w1" id="d1" />);
  await screen.findByText(/Alice's, shared with you\. You see the rows you may read/);
  await screen.findByLabelText("Held", { selector: "section" });
  for (const name of ["Edit", "Share", "Add to page", "More"]) {
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

test("a change made right before a share is saved on the revision the change made", async () => {
  let stored: Any = mine;
  routes[`GET ${api}/dashboards/d1`] = () => [200, stored];
  routes[`PUT ${api}/dashboards/d1`] = (body) => {
    const sentRevision = (body as { revision: number }).revision;
    if (sentRevision !== stored.revision) {
      return [409, { status: 409, detail: "Saved elsewhere." }];
    }
    stored = { ...stored, ...(body as object), revision: stored.revision + 1 };
    return [200, stored];
  };
  show(<DashboardView root={root} link="/t/t1/workspaces/w1" id="d1" />);
  await screen.findByLabelText("Held", { selector: "section" });
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.click(screen.getByLabelText("Held", { selector: "section" }));
  const settings = within(await screen.findByRole("complementary", { name: "Settings" }));
  fireEvent.click(settings.getByRole("tab", { name: /^Display/ }));
  fireEvent.click(settings.getByRole("button", { name: /^Title/ }));
  fireEvent.change(await screen.findByRole("textbox", { name: "Title" }), {
    target: { value: "On the shelf" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Share" }));
  fireEvent.click(
    within(await screen.findByRole("dialog")).getByLabelText(
      "Show it to everyone in this workspace",
    ),
  );
  await waitFor(() => expect(sent("PUT")).toHaveLength(2));
  expect(sent("PUT").map((call) => (call.body as Any).revision)).toEqual([4, 5]);
});

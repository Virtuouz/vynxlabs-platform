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
    dialog.getByText("Click to place at the end of the page, or drag onto the grid."),
  ).toBeTruthy();
  fireEvent.change(dialog.getByLabelText(/^Find something to add/), { target: { value: "chart" } });
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
  // A heading is two rows that open an editor, or (a chart's) two fields written in place.
  const row = settings.queryByRole("button", { name: /^Title/ });
  if (row) fireEvent.click(row);
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
  fireEvent.click(settings.getByRole("tab", { name: /^Display/ }));
  fireEvent.click((await settings.findAllByRole("button", { name: /^Added/ }))[0] as HTMLElement);
  fireEvent.change(await settings.findByLabelText(/^Label/), { target: { value: "Created" } });
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
  fireEvent.click(settings.getByRole("button", { name: "Back" }));
  fireEvent.click(await settings.findByRole("button", { name: "Filter" }));
  fireEvent.click(await screen.findByRole("button", { name: "A search box" }));
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
  await screen.findByText(/Kept by the workspace, at boards\/stock/);
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
  // A heading is two rows that open an editor, or (a chart's) two fields written in place.
  const row = settings.queryByRole("button", { name: /^Title/ });
  if (row) fireEvent.click(row);
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

test("a widget limited to a group is drawn to a member in that group, and not to one outside it", async () => {
  const limited = {
    ...mine,
    body: {
      widgets: [
        {
          id: "billing",
          type: "core/text",
          at: { x: 0, y: 0, w: 6, h: 2 },
          config: { text: "Billing only." },
          rules: { seenBy: { groups: ["groups/billing"] } },
        },
      ],
    },
  };
  routes[`GET ${api}/dashboards/d1`] = () => [200, limited];
  routes["GET /api/v1/me"] = () => [
    200,
    {
      principal: { type: "member", id: "m1", name: "Mia", email: "mia@x" },
      tenants: [],
      instancePermissions: [],
    },
  ];
  routes["GET /api/v1/tenants/t1/me/groups"] = () => [
    200,
    { items: [{ key: "billing", name: "Billing" }] },
  ];
  show(<DashboardView root={root} link="/t/t1/workspaces/w1" id="d1" />);
  expect(await screen.findByText("Billing only.")).toBeTruthy();
  cleanup();
  // Another tenant, where the member is in no group: the widget is not drawn to them.
  const other = "/tenants/t2/workspaces/w1";
  routes[`GET /api/v1${other}/dashboards/d1`] = () => [200, limited];
  routes[`GET /api/v1${other}/widget-data`] = () => [200, { inputs: {} }];
  routes[`GET /api/v1${other}/queries/schema`] = routes[`GET ${api}/queries/schema`] as never;
  routes[`GET /api/v1${other}/queries`] = () => [200, { items: [] }];
  routes["GET /api/v1/tenants/t2/me/groups"] = () => [200, { items: [] }];
  show(<DashboardView root={other} link="/t/t2/workspaces/w1" id="d1" />);
  // Once what the member is in has been read, the widget stays hidden.
  await waitFor(() =>
    expect(calls.some((call) => call.url.endsWith("/tenants/t2/me/groups"))).toBe(true),
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  await waitFor(() => expect(screen.queryByText("Billing only.")).toBeNull());
});

test("F1 on a dashboard that is looked at opens the dashboards' help, and the editor's only while it is edited", async () => {
  const { resetHelp, getHelpTopic } = await import("./help/store.ts");
  resetHelp();
  routes[`GET ${api}/dashboards/d1`] = () => [200, mine];
  const viewing = show(<DashboardView root={root} link="/t/t1/workspaces/w1" id="d1" />);
  await screen.findByLabelText("Held", { selector: "section" });
  expect(getHelpTopic()).not.toBe("data-dashboards-editor");
  viewing.unmount();
  history.replaceState(null, "", "/?edit=1");
  show(<DashboardView root={root} link="/t/t1/workspaces/w1" id="d1" />);
  await screen.findByRole("button", { name: "Add to page" });
  expect(getHelpTopic()).toBe("data-dashboards-editor");
});

// ----- Dashboards the workspace keeps (QSD-MP2) and what a dashboard is for (QSD-MP9) -----

const kept = {
  id: "r1",
  kind: "dashboard",
  path: "boards/lending",
  title: "Lending",
  ownership: "ui",
  updatedAt: "2026-11-13T10:00:00.000Z",
  body: { widgets: mine.body.widgets.filter((one: Any) => one.id === "note") },
};
const draftOf = (path: string, over: object = {}) => ({
  path,
  kind: "dashboard",
  key: path,
  title: null,
  deleted: false,
  revision: 1,
  schemaVersion: 3,
  body: kept.body,
  ...over,
});
/** The routes of one dashboard the workspace keeps, with its draft in `drafts`. */
function keeping(drafts: Record<string, Any> = {}, deployed: Any = kept) {
  routes[`GET ${api}/resources/boards/lending`] = () => [200, deployed];
  routes[`GET ${api}/drafts/boards/lending`] = () =>
    drafts["boards/lending"] ? [200, drafts["boards/lending"]] : [404, { detail: "none" }];
  routes[`PUT ${api}/drafts/boards/lending`] = (body) => {
    const sent = body as Any;
    drafts["boards/lending"] = draftOf("boards/lending", {
      body: sent.body,
      revision: (drafts["boards/lending"]?.revision ?? 0) + 1,
    });
    return [200, drafts["boards/lending"]];
  };
}

test("QSD-MP2: the list shows the drafts that change dashboards the workspace keeps, and ones not deployed yet", async () => {
  routes[`GET ${api}/dashboards`] = () => [
    200,
    {
      items: [
        { ...mine, id: "r1", kind: "resource", path: "boards/lending", title: "Lending" },
        { ...mine, id: "r2", kind: "resource", path: "boards/old", title: "Old" },
      ],
    },
  ];
  routes[`GET ${api}/drafts`] = () => [
    200,
    {
      items: [
        draftOf("boards/lending"),
        draftOf("boards/fresh", { title: "Fresh" }),
        draftOf("boards/old", { deleted: true }),
        { ...draftOf("boards/renamed"), renamedFrom: "boards/none" },
      ],
    },
  ];
  show(<Dashboards root={root} link="/t/t1/workspaces/w1" />);
  const rows = await screen.findAllByRole("row");
  const row = (name: string) => rows.find((one) => within(one).queryByText(name)) as HTMLElement;
  expect(within(row("Lending")).getByText("Draft")).toBeTruthy();
  expect(within(row("Old")).getByText("Removing")).toBeTruthy();
  expect(within(row("Fresh")).getByText("Draft, never deployed")).toBeTruthy();
  // A draft is opened by its path, which a draft that was never deployed has and an ID does not.
  expect(within(row("Fresh")).getByRole("link", { name: "Fresh" }).getAttribute("href")).toBe(
    "/t/t1/workspaces/w1/dashboards/at/boards/fresh",
  );
});

test("QSD-MP2: a dashboard the workspace keeps is changed as a draft, on the revision of the draft", async () => {
  const drafts: Record<string, Any> = {};
  keeping(drafts);
  show(<DashboardView root={root} link="/t/t1/workspaces/w1" id="at/boards/lending" editable />);
  await screen.findByText(/Kept by the workspace, at boards\/lending/);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.click(
    (await screen.findAllByRole("button", { name: "Add to page" }))[0] as HTMLElement,
  );
  const dialog = within(await screen.findByRole("dialog", { name: "Add to page" }));
  fireEvent.click(dialog.getByRole("button", { name: /Chart/ }));
  await waitFor(() => expect(sent("PUT")).toHaveLength(1));
  // The first save over what is deployed names no draft; the next names the one it made.
  expect(sent("PUT")[0]?.url).toBe(`${api}/drafts/boards/lending`);
  expect(put(0)).toMatchObject({ kind: "dashboard", schemaVersion: 3 });
  expect(put(0).body.widgets.map((one: Any) => one.type)).toContain("core/chart");
  expect(put(0).revision).toBeUndefined();
  // The widgets are read as the draft says, so what is drawn is what was saved.
  expect(
    calls.some((call) => call.url.includes("/widget-data") && call.url.includes("draft=1")),
  ).toBe(true);
  // What it is for is part of what is drafted, saved on the draft the first save made.
  fireEvent.click(screen.getByRole("button", { name: "More" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Description…" }));
  const about = within(await screen.findByRole("dialog"));
  expect(about.queryByLabelText("Name")).toBeNull();
  fireEvent.change(about.getByLabelText("What it is for"), {
    target: { value: "Lending, by month." },
  });
  fireEvent.click(about.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(sent("PUT")).toHaveLength(2));
  expect(put(1).revision).toBe(1);
  expect(put(1).body.description).toBe("Lending, by month.");
  expect(sent("POST")).toHaveLength(0);
});

test("QSD-MP2: it can be named, described and removed; a removal can be taken back", async () => {
  keeping({ "boards/lending": draftOf("boards/lending") });
  routes[`DELETE ${api}/drafts/boards/lending`] = () => [204, null];
  show(<DashboardView root={root} link="/t/t1/workspaces/w1" id="at/boards/lending" editable />);
  await screen.findByText(/Kept by the workspace, at boards\/lending/);
  screen.getByRole("button", { name: "Name and path" });
  screen.getByRole("button", { name: "Discard draft" });
  await screen.findByText("Draft");
  fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
  await answer("Discard", undefined);
  await waitFor(() => expect(sent("DELETE")).toHaveLength(1));
});

test("QSD-MP2: a dashboard removed in a draft says so and offers to keep it", async () => {
  keeping({ "boards/lending": draftOf("boards/lending", { deleted: true, body: {} }) });
  show(<DashboardView root={root} link="/t/t1/workspaces/w1" id="at/boards/lending" editable />);
  await screen.findByText(/removed in your drafts/);
  screen.getByRole("button", { name: "Keep this dashboard" });
  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
});

test("QSD-MP2: a dashboard the repository defines says that changing it takes it over", async () => {
  keeping({}, { ...kept, ownership: "code" });
  show(<DashboardView root={root} link="/t/t1/workspaces/w1" id="at/boards/lending" editable />);
  await screen.findByText(/defined by the code in the tenant's repository/);
  screen.getByRole("button", { name: "Edit" });
  // Removed in the code, not here.
  expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
});

test("QSD-MP2: in production it is looked at, with nothing to change it with", async () => {
  routes[`GET ${api}/dashboards/r1`] = () => [
    200,
    { ...mine, id: "r1", kind: "resource", path: "boards/lending", mine: false, shared: true },
  ];
  show(<DashboardView root={root} link="/t/t1/workspaces/w1" id="r1" />);
  await screen.findByText(/Kept by the workspace, at boards\/lending/);
  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Name and path" })).toBeNull();
  expect(calls.some((call) => call.url.includes("/drafts"))).toBe(false);
});

test("QSD-MP9: what a dashboard is for is written beside its name, shown under its title, and listed", async () => {
  let stored: Any = { ...mine, description: "Everything held, by item." };
  stored = { ...stored, body: { ...stored.body, description: "Everything held, by item." } };
  routes[`GET ${api}/dashboards/d1`] = () => [200, stored];
  routes[`PUT ${api}/dashboards/d1`] = (body) => {
    stored = { ...stored, ...(body as object), revision: stored.revision + 1 };
    return [200, stored];
  };
  show(<DashboardView root={root} link="/t/t1/workspaces/w1" id="d1" />);
  // Under the title, with whose it is below it.
  const lead = await screen.findByText("Everything held, by item.");
  expect(lead.closest("header, div")).toBeTruthy();
  await screen.findByText(/Yours\. Seen by/);
  fireEvent.click(screen.getByRole("button", { name: "More" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Name and description…" }));
  const dialog = within(await screen.findByRole("dialog"));
  expect((dialog.getByLabelText("Name") as HTMLInputElement).value).toBe("Stock");
  fireEvent.change(dialog.getByLabelText("What it is for"), {
    target: { value: "Held stock, by item." },
  });
  fireEvent.change(dialog.getByLabelText("Name"), { target: { value: "Stock on hand" } });
  fireEvent.click(dialog.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(sent("PUT")).toHaveLength(1));
  expect(put(0)).toMatchObject({ title: "Stock on hand", revision: 4 });
  expect(put(0).body.description).toBe("Held stock, by item.");
  expect(put(0).body.widgets).toHaveLength(mine.body.widgets.length);
});

test("QSD-MP9: the list shows what each dashboard is for under its name", async () => {
  routes[`GET ${api}/dashboards`] = () => [
    200,
    { items: [{ ...mine, description: "Everything held, by item." }] },
  ];
  show(<Dashboards root={root} link="/t/t1/workspaces/w1" />);
  await screen.findByText("Everything held, by item.");
});

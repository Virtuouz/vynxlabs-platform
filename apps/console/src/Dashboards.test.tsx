// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Dashboards, DashboardView } from "./screens/Dashboards.tsx";
import { answer, show } from "./testing.tsx";

const root = "/tenants/t1/workspaces/w1";
const api = `/api/v1${root}`;
let calls: { method: string; url: string; body: unknown }[];
let routes: Record<string, (body: unknown) => [number, unknown]>;
// biome-ignore lint/suspicious/noExplicitAny: what was sent is inspected freely
type Any = any;

const at = { x: 0, y: 0, w: 12, h: 8 };
const mine = {
  id: "d1",
  title: "Stock",
  mine: true,
  owner: "Mona",
  shared: false,
  revision: 4,
  updatedAt: "2026-11-13T10:00:00.000Z",
  page: {
    id: "main",
    title: "Stock",
    widgets: [{ id: "held", type: "table", title: "Held", table: "stock", at }],
  },
  problems: [],
};

beforeEach(() => {
  calls = [];
  history.replaceState(null, "", "/");
  routes = {
    [`GET ${api}/tables`]: () => [200, { items: [{ name: "stock", status: "active" }] }],
    [`GET ${api}/tables/stock`]: () => [
      200,
      { columns: [{ name: "item", type: "text", required: false, status: "active" }] },
    ],
  };
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const sent = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url: address, body: sent });
    const path = address.split("?")[0] as string;
    const [status, reply] =
      (routes[`${method} ${address}`] ?? routes[`${method} ${path}`])?.(sent) ??
      (/\/(rows|aggregate)\//.test(path)
        ? [200, { items: [{ id: "r1", item: "Bolts" }], nextCursor: null }]
        : [404, { detail: "No mock" }]);
    return new Response(reply === null ? null : JSON.stringify(reply), { status });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const sent = (method: string) => calls.filter((call) => call.method === method);

test("dashboards are listed with whose they are, and a new one is named in the console's own dialog", async () => {
  routes[`GET ${api}/dashboards`] = () => [
    200,
    {
      items: [
        mine,
        { ...mine, id: "d2", title: "Sales", mine: false, owner: "Alice", shared: true },
      ],
    },
  ];
  routes[`POST ${api}/dashboards`] = () => [201, { ...mine, id: "d9", title: "Returns" }];
  show(<Dashboards root={root} link="/t/t1/workspaces/w1" />);
  // Saving is a button press, and the description says so.
  expect(await screen.findByText(/saved when you press Save/)).toBeTruthy();
  expect(screen.queryByText(/saved as you make it/)).toBeNull();
  const rows = await screen.findAllByRole("row");
  expect(within(rows[1] as HTMLElement).getByText("Yours")).toBeTruthy();
  expect(within(rows[1] as HTMLElement).getByText("Only you")).toBeTruthy();
  expect(within(rows[2] as HTMLElement).getByText("Alice")).toBeTruthy();
  expect(within(rows[2] as HTMLElement).getByText("Everyone here")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "New dashboard" }));
  await answer("Make the dashboard", "Returns");
  await waitFor(() => expect(window.location.pathname).toBe("/t/t1/workspaces/w1/dashboards/d9"));
  expect(sent("POST")[0]?.body).toEqual({ title: "Returns" });
});

test("a member's own dashboard saves itself, undoes a change, and is shared as a step of its own", async () => {
  let stored: Any = mine;
  routes[`GET ${api}/dashboards/d1`] = () => [200, stored];
  routes[`PUT ${api}/dashboards/d1`] = (body) => {
    stored = { ...stored, ...(body as object), revision: stored.revision + 1 };
    return [200, stored];
  };
  show(<DashboardView root={root} link="/t/t1/workspaces/w1" id="d1" />);
  // The page is drawn from the workspace's rows.
  await within(await screen.findByRole("region", { name: "Held" })).findByText("Bolts");
  const add = within(screen.getByRole("region", { name: "Add" }));
  // A dashboard is for looking: it offers no form and no action.
  expect(add.queryByRole("button", { name: "Form" })).toBeNull();
  expect(add.queryByRole("button", { name: "Action" })).toBeNull();

  fireEvent.click(add.getByRole("button", { name: "Text" }));
  // Saved by itself, a moment after the change, with the revision it was read at.
  await waitFor(() => expect(sent("PUT")).toHaveLength(1), { timeout: 3000 });
  expect(sent("PUT")[0]?.body).toMatchObject({ title: "Stock", revision: 4 });
  const first = sent("PUT")[0] as { body: Any };
  expect(first.body.page.widgets.map((widget: Any) => widget.id)).toEqual(["held", "text"]);
  await screen.findByText(/^Saved\. Only you see it\./);

  // Undone, and saved again as it was.
  fireEvent.click(screen.getByRole("button", { name: /^Undo adding text/ }));
  await waitFor(() => expect(sent("PUT")).toHaveLength(2), { timeout: 3000 });
  const second = sent("PUT")[1] as { body: Any };
  expect(second.body.page.widgets.map((widget: Any) => widget.id)).toEqual(["held"]);
  expect(second.body.revision).toBe(5);

  // Sharing is its own step, said at once.
  fireEvent.click(screen.getByRole("button", { name: "Share" }));
  fireEvent.click(
    within(await screen.findByRole("dialog")).getByLabelText(
      "Show it to everyone in this workspace",
    ),
  );
  await waitFor(() => expect(sent("PUT")).toHaveLength(3));
  expect(sent("PUT")[2]?.body).toEqual({ shared: true, revision: 6 });
});

test("a dashboard someone else shared is looked at, and offers no way to change it", async () => {
  routes[`GET ${api}/dashboards/d2`] = () => [
    200,
    { ...mine, id: "d2", mine: false, owner: "Alice", shared: true },
  ];
  show(<DashboardView root={root} link="/t/t1/workspaces/w1" id="d2" />);
  await screen.findByText(/Shared by Alice\. You see the rows you may read/);
  await within(screen.getByRole("region", { name: "Held" })).findByText("Bolts");
  for (const name of ["Save", "Delete", "Edit", "Table"]) {
    expect(screen.queryByRole("button", { name })).toBeNull();
  }
  expect(screen.queryByRole("complementary", { name: "Settings" })).toBeNull();
});

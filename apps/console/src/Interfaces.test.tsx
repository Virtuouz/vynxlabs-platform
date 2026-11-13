// @vitest-environment happy-dom

import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { InterfaceBody } from "@vynxlabs/manifest";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { InterfaceBuilder, Interfaces } from "./screens/Interfaces.tsx";
import { answer, show } from "./testing.tsx";

const root = "/tenants/t1/workspaces/w1";
const api = `/api/v1${root}`;
let calls: { method: string; url: string; body: unknown }[];
let routes: Record<string, (body: unknown) => [number, unknown]>;

const column = (name: string, type = "text", references?: string) => ({
  name,
  type,
  required: false,
  status: "active",
  ...(references ? { references } : {}),
});
const at = { x: 0, y: 0, w: 12, h: 8 };
const body = (): InterfaceBody => ({
  title: "Sales",
  pages: [
    {
      id: "main",
      title: "Sales",
      widgets: [
        { id: "customers", type: "table", title: "Customers", table: "customers", at },
        { id: "orders", type: "table", title: "Orders", table: "orders", at: { ...at, y: 8 } },
      ],
    },
  ],
});

beforeEach(() => {
  calls = [];
  history.replaceState(null, "", "/");
  routes = {
    [`GET ${api}/tables`]: () => [
      200,
      {
        items: [
          { name: "customers", status: "active" },
          { name: "orders", status: "active" },
        ],
      },
    ],
    [`GET ${api}/tables/customers`]: () => [200, { columns: [column("name")] }],
    [`GET ${api}/tables/orders`]: () => [
      200,
      {
        columns: [
          column("number"),
          column("total", "number"),
          column("customer", "reference", "customers"),
        ],
      },
    ],
    [`GET ${api}/apps`]: () => [200, { items: [] }],
  };
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const sent = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url: address, body: sent });
    const path = address.split("?")[0] as string;
    const handler = routes[`${method} ${address}`] ?? routes[`${method} ${path}`];
    // Rows for the preview: none, unless a test says otherwise.
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
const sent = (method: string, part = "") =>
  calls.filter((call) => call.method === method && call.url.includes(part));

test("an app is made as an interface and the app that serves it, and is then built", async () => {
  routes[`GET ${api}/interfaces`] = () => [200, { items: [] }];
  routes[`PUT ${api}/drafts/screens/stock-room`] = (saved) => [
    200,
    { revision: 1, body: (saved as Any).body },
  ];
  routes[`PUT ${api}/drafts/stock-room`] = (saved) => [
    200,
    { revision: 1, body: (saved as Any).body },
  ];
  show(<Interfaces root={root} link="/t/t1/workspaces/w1" editable />);
  fireEvent.click(
    (await screen.findAllByRole("button", { name: "Make an app" }))[0] as HTMLElement,
  );
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Stock room" } });
  // The address is made from the name.
  expect((within(dialog).getByLabelText("Address") as HTMLInputElement).value).toBe("stock-room");
  fireEvent.click(within(dialog).getByRole("button", { name: "Make the app" }));
  await waitFor(() =>
    expect(window.location.pathname).toBe("/t/t1/workspaces/w1/screens/screens/stock-room"),
  );
  expect(sent("PUT").map((call) => [call.url, call.body])).toEqual([
    [
      `${api}/drafts/screens/stock-room`,
      {
        kind: "interface",
        schemaVersion: 1,
        body: { title: "Stock room", pages: [{ id: "main", title: "Stock room", widgets: [] }] },
      },
    ],
    [
      `${api}/drafts/stock-room`,
      {
        kind: "app",
        schemaVersion: 1,
        body: { title: "Stock room", interface: "screens/stock-room" },
      },
    ],
  ]);
});

test("a workspace that is not a dev workspace lists its apps and builds none", async () => {
  routes[`GET ${api}/interfaces`] = () => [
    200,
    {
      items: [
        {
          path: "screens/sales",
          title: "Sales",
          deployed: true,
          draft: false,
          removing: false,
          app: "sales",
        },
      ],
    },
  ];
  routes[`GET ${api}/apps`] = () => [
    200,
    { items: [{ path: "sales", url: "https://vx.example/apps/acme/main/sales/" }] },
  ];
  show(<Interfaces root={root} link="/t/t1/workspaces/w1" editable={false} />);
  expect(
    (await screen.findByRole("link", { name: /apps\/acme\/main\/sales/ })).getAttribute("href"),
  ).toBe("https://vx.example/apps/acme/main/sales/");
  expect(screen.getByText("Published")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Make an app" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Sales" })).toBeNull();
});

test("a widget is made to follow another by choosing a sentence, and the change is saved by itself", async () => {
  let stored = body();
  routes[`GET ${api}/drafts/screens/sales`] = () => [200, { revision: 3, body: stored }];
  routes[`GET ${api}/interfaces`] = () => [
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
  ];
  routes[`GET ${api}/drafts`] = () => [
    200,
    { items: [{ path: "screens/sales" }, { path: "sales" }] },
  ];
  routes[`PUT ${api}/drafts/screens/sales`] = (saved) => {
    stored = (saved as Any).body;
    return [200, { revision: 4, body: stored, problems: [] }];
  };
  routes[`POST ${api}/changes/deploy`] = () => [201, { applied: ["screens/sales", "sales"] }];
  show(<InterfaceBuilder root={root} link="/t/t1/workspaces/w1" path="screens/sales" />);

  const orders = within(await screen.findByRole("region", { name: "Orders" }));
  fireEvent.click(orders.getByRole("button", { name: "Edit" }));
  const settings = within(screen.getByRole("complementary", { name: "Settings" }));
  // What it can follow is offered as what it would show.
  const follows = (await settings.findByLabelText("What it shows follows")) as HTMLSelectElement;
  await waitFor(() =>
    expect([...follows.options].map((option) => option.textContent)).toEqual([
      "Nothing: it shows the table",
      "Rows whose customer is the row chosen in Customers",
    ]),
  );
  fireEvent.change(follows, { target: { value: follows.options[1]?.value } });
  // The preview follows at once: nothing is chosen yet, so it says so.
  await orders.findByText("Choose a row in Customers to see what goes with it.");
  // The reference can be shown by the customer's name.
  fireEvent.change(settings.getByLabelText("Add"), { target: { value: "customer" } });
  fireEvent.change(await settings.findByLabelText("Shown as (customer)"), {
    target: { value: "name" },
  });

  await waitFor(() => expect(sent("PUT", "/drafts/screens/sales").length).toBeGreaterThan(0), {
    timeout: 4000,
  });
  await waitFor(
    () =>
      expect(stored.pages[0]?.widgets[1]).toMatchObject({
        link: { from: "customers", type: "refersTo", via: "customer" },
        fields: [{ column: "customer", show: "name" }],
      }),
    { timeout: 4000 },
  );
  // Each save carries the revision of the one before, so two people cannot overwrite each other.
  expect(sent("PUT", "/drafts/screens/sales")[0]?.body).toMatchObject({ revision: 3 });
  await screen.findByText("Saved. Not published yet.");

  fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  await waitFor(() => expect(sent("POST", "/changes/deploy")).toHaveLength(1), { timeout: 4000 });
  // Only this app is deployed: its interface, and the app that serves it.
  expect(sent("POST", "/changes/deploy")[0]?.body).toEqual({
    paths: ["screens/sales", "sales"],
    message: "Publish Sales",
  });
});

test("widgets are added and removed, and what is wrong is said before anything can be published", async () => {
  let stored: InterfaceBody = {
    title: "Sales",
    pages: [{ id: "main", title: "Sales", widgets: [] }],
  };
  routes[`GET ${api}/drafts/screens/sales`] = () => [200, { revision: 1, body: stored }];
  routes[`GET ${api}/interfaces`] = () => [
    200,
    {
      items: [
        {
          path: "screens/sales",
          title: "Sales",
          deployed: false,
          draft: true,
          removing: false,
          app: null,
        },
      ],
    },
  ];
  routes[`GET ${api}/drafts`] = () => [200, { items: [{ path: "screens/sales" }] }];
  routes[`PUT ${api}/drafts/screens/sales`] = (saved) => {
    stored = (saved as Any).body;
    const chart = stored.pages[0]?.widgets.find((widget) => widget.type === "chart");
    return [
      200,
      {
        revision: 2,
        body: stored,
        problems: chart
          ? [{ path: "/body/pages/0/widgets/0/options/mark", message: "a chart needs a shape" }]
          : [],
      },
    ];
  };
  show(<InterfaceBuilder root={root} link="/t/t1/workspaces/w1" path="screens/sales" />);
  await screen.findByText("This page has nothing on it yet.");
  // Nothing serves it yet, and the builder says so.
  expect(await screen.findByText("No app serves this yet, so nobody can open it.")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Chart" }));
  // The new widget is the one being edited.
  const settings = within(screen.getByRole("complementary", { name: "Settings" }));
  expect(((await settings.findByLabelText("Title")) as HTMLInputElement).value).toBe("Chart");
  await screen.findByText("Sales › Chart: a chart needs a shape.", undefined, { timeout: 4000 });
  expect((screen.getByRole("button", { name: "Publish" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(stored.pages[0]?.widgets[0]).toMatchObject({
    id: "chart",
    type: "chart",
    at: { x: 0, y: 0, w: 6, h: 8 },
  });

  // A second of the same kind gets a name of its own, below the first.
  fireEvent.click(screen.getByRole("button", { name: "Chart" }));
  await waitFor(
    () => expect(stored.pages[0]?.widgets.map((widget) => widget.id)).toEqual(["chart", "chart_2"]),
    {
      timeout: 4000,
    },
  );
  expect(stored.pages[0]?.widgets[1]?.at.y).toBe(8);
  fireEvent.click(
    within(screen.getByRole("complementary", { name: "Settings" })).getByRole("button", {
      name: "Remove this widget",
    }),
  );
  await waitFor(
    () => expect(stored.pages[0]?.widgets.map((widget) => widget.id)).toEqual(["chart"]),
    {
      timeout: 4000,
    },
  );

  // A page is added through a dialog of the console's own, never the browser's.
  fireEvent.click(screen.getByRole("button", { name: "Page" }));
  await answer("Add the page", "By month");
  await waitFor(() => expect(stored.pages.map((page) => page.id)).toEqual(["main", "by-month"]), {
    timeout: 4000,
  });
});

test("sharing an app gives a group the app and the tables it shows, and stopping takes both back", async () => {
  const tenant = "/api/v1/tenants/t1";
  let held: Any[] = [];
  routes[`GET ${api}/apps`] = () => [
    200,
    {
      items: [
        {
          id: "a1",
          path: "sales",
          title: "Sales",
          description: null,
          url: "https://vx.example/apps/acme/main/sales/",
          domains: [],
          files: 0,
          bytes: 0,
          access: [],
        },
      ],
    },
  ];
  routes[`GET ${api}/resources`] = () => [
    200,
    {
      items: [
        {
          id: "a1",
          kind: "app",
          path: "sales",
          body: { title: "Sales", interface: "screens/sales" },
        },
        { id: "i1", kind: "interface", path: "screens/sales", body: body() },
        { id: "t1", kind: "table", path: "customers", body: {} },
        { id: "t2", kind: "table", path: "orders", body: {} },
        { id: "t3", kind: "table", path: "unrelated", body: {} },
      ],
    },
  ];
  routes[`GET ${tenant}/bindings`] = () => [200, { items: held }];
  routes[`GET ${tenant}/groups`] = () => [200, { items: [] }];
  routes[`GET ${tenant}/end-user-groups`] = () => [200, { items: [{ id: "g1", name: "finance" }] }];
  routes[`GET ${tenant}/roles`] = () => [
    200,
    {
      items: [
        { id: "r1", name: "portal_reader" },
        { id: "r2", name: "portal_user" },
      ],
    },
  ];
  routes[`POST ${tenant}/bindings`] = (sentBody) => {
    const made = sentBody as Any;
    held = [
      ...held,
      {
        id: `b${held.length + 1}`,
        scopeType: "resource",
        resourceId: made.resourceId,
        principalType: made.principalType,
        principalId: made.principalId ?? null,
        principalLabel: "finance",
        roleName: "portal_reader",
        managedByResource: false,
      },
    ];
    return [201, { id: `b${held.length}` }];
  };
  for (const id of ["b1", "b2", "b3"]) {
    routes[`DELETE ${tenant}/bindings/${id}`] = () => {
      held = held.filter((binding) => binding.id !== id);
      return [204, null];
    };
  }
  const { Apps } = await import("./screens/Apps.tsx");
  show(<Apps root={root} />);
  fireEvent.click(await screen.findByRole("button", { name: "Share" }));
  const dialog = within(await screen.findByRole("dialog"));
  await dialog.findByText("Nobody else yet.");
  // It says what comes with the app, so nobody is surprised by it.
  await dialog.findByText(/its tables customers, orders/);
  fireEvent.change(dialog.getByLabelText("Share with"), { target: { value: "end_user_group:g1" } });
  fireEvent.click(dialog.getByRole("button", { name: "Share" }));
  await dialog.findByText("may read");
  expect(sent("POST", "/bindings").map((call) => call.body)).toEqual(
    ["a1", "t1", "t2"].map((resourceId) => ({
      workspaceId: "w1",
      resourceId,
      principalType: "end_user_group",
      principalId: "g1",
      roleId: "r1",
    })),
  );
  fireEvent.click(dialog.getByRole("button", { name: "Stop sharing with finance" }));
  await dialog.findByText("Nobody else yet.");
  expect(sent("DELETE", "/bindings/").map((call) => call.url.split("/").pop())).toEqual([
    "b1",
    "b2",
    "b3",
  ]);
});

// biome-ignore lint/suspicious/noExplicitAny: what was sent is inspected freely
type Any = any;

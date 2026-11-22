// @vitest-environment happy-dom

import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { InterfaceBody } from "@volvel/manifest";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { InterfaceBuilder } from "./screens/builder/AppBuilder.tsx";
import { Interfaces } from "./screens/Interfaces.tsx";
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
        {
          id: "customers",
          type: "core/table",
          title: "Customers",
          at,
          data: { rows: { source: { visual: { table: "customers" } } } },
        },
        {
          id: "orders",
          type: "core/table",
          title: "Orders",
          at: { ...at, y: 8 },
          data: { rows: { source: { visual: { table: "orders" } } } },
        },
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
    [`GET ${api}/queries/schema`]: () => [
      200,
      {
        tables: [
          { name: "customers", columns: [{ name: "name", type: "text", references: null }] },
          {
            name: "orders",
            columns: [
              { name: "number", type: "text", references: null },
              { name: "total", type: "number", references: null },
              { name: "status", type: "enum", references: null },
            ],
          },
        ],
        functions: [],
        maySql: false,
      },
    ],
    [`GET ${api}/queries`]: () => [200, { items: [] }],
    // Every widget asks the one endpoint for what it shows.
    [`GET ${api}/widget-data`]: () => [200, { inputs: {} }],
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
        schemaVersion: 2,
        body: { title: "Stock room", pages: [{ id: "main", title: "Stock room", widgets: [] }] },
        create: true,
      },
    ],
    [
      `${api}/drafts/stock-room`,
      {
        kind: "app",
        schemaVersion: 1,
        body: { title: "Stock room", interface: "screens/stock-room" },
        create: true,
      },
    ],
  ]);
});

test("an app made at an address something holds is refused on the address, and keeps what was typed", async () => {
  routes[`GET ${api}/interfaces`] = () => [200, { items: [] }];
  routes[`PUT ${api}/drafts/screens/stock-room`] = (saved) => [
    200,
    { revision: 1, body: (saved as Any).body },
  ];
  routes[`PUT ${api}/drafts/stock-room`] = () => [
    409,
    { code: "path_taken", detail: "stock-room is the path of an app." },
  ];
  routes[`DELETE ${api}/drafts/screens/stock-room`] = () => [200, {}];
  show(<Interfaces root={root} link="/t/t1/workspaces/w1" editable />);
  fireEvent.click(
    (await screen.findAllByRole("button", { name: "Make an app" }))[0] as HTMLElement,
  );
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Stock room" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Make the app" }));
  expect(await within(dialog).findByText(/Something already exists at this path/)).toBeTruthy();
  expect((within(dialog).getByLabelText("Name") as HTMLInputElement).value).toBe("Stock room");
  expect((within(dialog).getByLabelText("Address") as HTMLInputElement).value).toBe("stock-room");
  // The screen made for it a moment before is not left behind.
  await waitFor(() => expect(sent("DELETE", "/drafts/screens/stock-room")).toHaveLength(1));
  expect(window.location.pathname).toBe("/");
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
    const chart = stored.pages[0]?.widgets.find((widget) => widget.type === "core/chart");
    return [
      200,
      {
        revision: 2,
        body: stored,
        problems: chart
          ? [{ path: "/body/pages/0/widgets/0/config/mark", message: "a chart needs a shape" }]
          : [],
      },
    ];
  };
  show(<InterfaceBuilder root={root} link="/t/t1/workspaces/w1" path="screens/sales" />);
  await screen.findByText("Nothing on this page yet");
  // Nothing serves it yet, and the builder says so.
  expect(await screen.findByText("No app serves this yet, so nobody can open it.")).toBeTruthy();

  const addChart = async () => {
    fireEvent.click(screen.getAllByRole("button", { name: "Add to page" })[0] as HTMLElement);
    const dialog = within(await screen.findByRole("dialog", { name: "Add to page" }));
    fireEvent.click(dialog.getByRole("button", { name: /Chart/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  };
  await addChart();
  // The new widget is the one being changed.
  const settings = within(screen.getByRole("complementary", { name: "Settings" }));
  fireEvent.click(await settings.findByRole("tab", { name: /^Display/ }));
  // The title row says what it is now.
  expect((await settings.findByRole("button", { name: /^Title/ })).textContent).toContain("Chart");
  await screen.findByText("Sales › Chart: a chart needs a shape.", undefined, { timeout: 4000 });
  expect((screen.getByRole("button", { name: "Publish" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(stored.pages[0]?.widgets[0]).toMatchObject({
    id: "chart",
    type: "core/chart",
    at: { x: 0, y: 0, w: 6, h: 6 },
  });
  // The page reads two tables, so nothing is guessed: a chart reads nothing until it is told what.
  expect(stored.pages[0]?.widgets[0]?.data).toBeUndefined();

  // A second of the same kind gets a name of its own, below the first.
  await addChart();
  await waitFor(
    () => expect(stored.pages[0]?.widgets.map((widget) => widget.id)).toEqual(["chart", "chart-2"]),
    { timeout: 4000 },
  );
  expect(stored.pages[0]?.widgets[1]?.at.y).toBe(6);
  // A widget not yet told what to read asks for nothing, and says what to do instead.
  expect(screen.getAllByText("Choose what it shows in Data.").length).toBe(2);
  expect(sent("GET", "/widget-data")).toEqual([]);

  fireEvent.click(await screen.findByRole("button", { name: /More about Chart/ }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));
  await waitFor(
    () => expect(stored.pages[0]?.widgets.map((widget) => widget.id)).toEqual(["chart"]),
    { timeout: 4000 },
  );
  // A removal can be taken back: the widget returns where it was, and is saved again.
  fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
  await waitFor(
    () => expect(stored.pages[0]?.widgets.map((widget) => widget.id)).toEqual(["chart", "chart-2"]),
    { timeout: 4000 },
  );
  expect(stored.pages[0]?.widgets[1]?.at.y).toBe(6);

  // A page is added through a dialog of the console's own, never the browser's.
  fireEvent.click(screen.getByRole("button", { name: "Add a page" }));
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
  // The app's inspector opens on choosing it, and sharing starts there.
  fireEvent.click(await screen.findByText("Sales"));
  fireEvent.click(await screen.findByRole("button", { name: "Share" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Share Sales" }));
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
  // It asks first, and says the tables go too.
  const asked = (await screen.findAllByRole("dialog")).at(-1) as HTMLElement;
  expect(asked.textContent).toContain("their access to its 2 tables goes with it");
  expect(sent("DELETE", "/bindings/")).toEqual([]);
  fireEvent.click(within(asked).getByRole("button", { name: "Stop sharing" }));
  await dialog.findByText("Nobody else yet.");
  expect(sent("DELETE", "/bindings/").map((call) => call.url.split("/").pop())).toEqual([
    "b1",
    "b2",
    "b3",
  ]);
});

// biome-ignore lint/suspicious/noExplicitAny: what was sent is inspected freely
type Any = any;

test("a stat is narrowed to some rows and its number written as dollars from cents", async () => {
  let stored: InterfaceBody = {
    title: "Sales",
    pages: [
      {
        id: "main",
        title: "Sales",
        widgets: [
          {
            id: "owed",
            type: "core/stat",
            title: "Owed",
            at,
            data: {
              value: {
                source: {
                  visual: {
                    table: "orders",
                    measures: [{ fn: "sum", column: "total", as: "owed" }],
                  },
                },
              },
            },
          },
        ],
      },
    ],
  };
  routes[`GET ${api}/drafts/screens/sales`] = () => [200, { revision: 1, body: stored }];
  routes[`GET ${api}/interfaces`] = () => [200, { items: [] }];
  routes[`GET ${api}/drafts`] = () => [200, { items: [{ path: "screens/sales" }] }];
  routes[`PUT ${api}/drafts/screens/sales`] = (saved) => {
    stored = (saved as Any).body;
    return [200, { revision: 2, body: stored, problems: [] }];
  };
  show(<InterfaceBuilder root={root} link="/t/t1/workspaces/w1" path="screens/sales" />);

  fireEvent.click(await screen.findByLabelText("Owed", { selector: "section" }));
  const settings = within(await screen.findByRole("complementary", { name: "Settings" }));
  // The value it works out is a sentence: a sum of a column.
  expect((settings.getByLabelText("What value 1 works out") as HTMLSelectElement).value).toBe(
    "sum",
  );
  expect((settings.getByLabelText("Column value 1 is of") as HTMLSelectElement).value).toBe(
    "total",
  );
  fireEvent.click(settings.getByRole("button", { name: "Add a condition" }));
  fireEvent.change(settings.getByLabelText("Test of condition 1"), { target: { value: "ne" } });
  fireEvent.change(settings.getByLabelText("Value of condition 1"), { target: { value: "paid" } });

  fireEvent.click(settings.getByRole("tab", { name: /^Display/ }));
  fireEvent.click(settings.getByRole("button", { name: /^Numbers/ }));
  const editor = within(await screen.findByRole("dialog"));
  fireEvent.click(editor.getByRole("button", { name: /As it comes/ }));
  fireEvent.change(editor.getByLabelText("Written as"), { target: { value: "currency" } });
  fireEvent.click(await editor.findByLabelText("Kept in cents"));
  expect(await editor.findByText("Shown as $43,120.00")).toBeTruthy();

  await waitFor(
    () =>
      expect(stored.pages[0]?.widgets[0]).toMatchObject({
        config: { format: { style: "currency", currency: "USD", minorUnits: true } },
        data: {
          value: {
            source: {
              visual: {
                table: "orders",
                filters: [{ column: "status", op: "ne", value: "paid" }],
              },
            },
          },
        },
      }),
    { timeout: 4000 },
  );
});

test("an app is renamed in its interface and its app, as one draft, and its address stays", async () => {
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
  routes[`GET ${api}/resources/screens/sales`] = () => [
    200,
    { kind: "interface", schemaVersion: 1, body: { ...body(), title: "Sales" } },
  ];
  routes[`GET ${api}/resources/sales`] = () => [
    200,
    { kind: "app", schemaVersion: 1, body: { title: "Sales", interface: "screens/sales" } },
  ];
  routes[`POST ${api}/drafts/batch`] = () => [200, { paths: ["screens/sales", "sales"] }];
  show(<Interfaces root={root} link="/t/t1/workspaces/w1" editable />);
  fireEvent.click(await screen.findByRole("button", { name: "Rename" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(/Its address does not/)).toBeTruthy();
  const save = within(dialog).getByRole("button", { name: "Save as a draft" }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Revenue" } });
  fireEvent.click(save);
  await waitFor(() => expect(sent("POST", "/drafts/batch")).toHaveLength(1));
  const changes = ((sent("POST", "/drafts/batch")[0] as Any).body as Any).changes;
  expect(changes.map((one: Any) => [one.path, one.kind, one.body.title])).toEqual([
    ["screens/sales", "interface", "Revenue"],
    ["sales", "app", "Revenue"],
  ]);
  // The rest of each is kept, and nothing moves.
  expect(changes[0].body.pages).toEqual(body().pages);
  expect(changes[1].body.interface).toBe("screens/sales");
  expect(changes.some((one: Any) => "to" in one)).toBe(false);
});

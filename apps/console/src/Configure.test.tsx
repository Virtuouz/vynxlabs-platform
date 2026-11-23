// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "./App.tsx";
import { DeployMenu } from "./kit/DeployMenu.tsx";
import { Sources } from "./screens/Data.tsx";
import { Promotion, WorkspaceControls, type WorkspaceSummary } from "./screens/Environments.tsx";
import { ConnectionGroups, Connections, Variables } from "./screens/Execution.tsx";
import { ConnectionPage } from "./screens/ObjectPages.tsx";
import { show } from "./testing.tsx";

/**
 * What a person meets when they set up what a workspace talks to: connections, groups,
 * variables, sources, and the way back from an OAuth provider (phase 29, lane cfg2).
 */

const base = "/tenants/t1";
const root = `${base}/workspaces/w1`;
const link = "/t/t1/workspaces/w1";
let routes: Record<string, (body: unknown) => [number, unknown]>;
let calls: { method: string; url: string; body: unknown }[];

const oauth2 = {
  type: "object",
  properties: {
    baseUrl: { type: "string", title: "API address" },
    authorizeUrl: { type: "string", title: "Authorization address" },
    tokenUrl: { type: "string", title: "Token address" },
    clientId: { type: "string", title: "Client ID" },
  },
  required: ["baseUrl", "authorizeUrl", "tokenUrl", "clientId"],
};
const http = {
  type: "object",
  properties: { baseUrl: { type: "string", title: "Address" } },
  required: ["baseUrl"],
};
const row = (more: Record<string, unknown>) => ({
  description: "",
  defined: true,
  draft: null,
  bound: true,
  config: { baseUrl: "https://shop.example" },
  configSchema: http,
  hasCredential: true,
  health: null,
  oauth: null,
  updatedAt: null,
  ...more,
});
const google = row({
  path: "google",
  connector: "oauth2",
  bound: false,
  config: null,
  configSchema: oauth2,
  hasCredential: false,
});
const needsReconnect = row({
  path: "drive",
  connector: "oauth2",
  configSchema: oauth2,
  config: { baseUrl: "https://drive.example" },
  oauth: {
    status: "needs_reconnect",
    expiresAt: null,
    scopes: [],
    connectedAt: null,
    problem: "The provider refused the refresh: invalid_grant",
  },
});

beforeEach(() => {
  calls = [];
  routes = {};
  history.replaceState(null, "", "/");
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const url = new URL(address, "http://console.test");
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, url: `${url.pathname}${url.search}`, body });
    const path = url.pathname.replace("/api/v1", "");
    const handler = routes[`${method} ${path}${url.search}`] ?? routes[`${method} ${path}`];
    const [status, answer] = handler
      ? handler(body)
      : [404, { status: 404, detail: `No mock for ${method} ${path}` }];
    return new Response(answer === null ? null : JSON.stringify(answer), { status });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

test("CFG-06: setting up an OAuth connection that has no settings starts from a provider's addresses", async () => {
  routes[`GET ${root}/connection-bindings`] = () => [200, { items: [google] }];
  routes[`GET ${root}/connectors`] = () => [
    200,
    { items: [{ name: "oauth2", builtin: true, configSchema: oauth2 }] },
  ];
  routes[`GET ${root}/references`] = () => [200, { items: [] }];
  show(<Connections root={root} />);
  fireEvent.click(await screen.findByRole("button", { name: "Set up" }));
  const sheet = await screen.findByRole("dialog");
  await waitFor(() =>
    expect((within(sheet).getByLabelText("Authorization address") as HTMLInputElement).value).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    ),
  );
});

test("CFG-07, CFG-22: a connection's page changes where it points, and says the list's words", async () => {
  routes[`GET ${root}/connection-bindings/drive`] = () => [200, needsReconnect];
  routes[`GET ${root}/connectors`] = () => [
    200,
    { items: [{ name: "oauth2", builtin: true, configSchema: oauth2 }] },
  ];
  routes[`GET ${root}/references`] = () => [200, { items: [] }];
  show(<ConnectionPage root={root} link={link} path="drive" />);
  expect(await screen.findByText("Needs reconnecting")).toBeTruthy();
  expect(screen.getByText("OAuth 2.0")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Change where it points" }));
  const sheet = await screen.findByRole("dialog");
  expect(within(sheet).getByText(/Set up drive/)).toBeTruthy();
  expect(location.pathname).toBe("/");
});

test("CFG-07: the list opens the connection a page names with ?item=", async () => {
  routes[`GET ${root}/connection-bindings`] = () => [200, { items: [needsReconnect] }];
  routes[`GET ${root}/connectors`] = () => [200, { items: [] }];
  routes[`GET ${root}/references`] = () => [200, { items: [] }];
  history.replaceState(null, "", `${link}/connections?item=drive`);
  show(<Connections root={root} />);
  const sheet = await screen.findByRole("dialog");
  expect(within(sheet).getByText(/Set up drive/)).toBeTruthy();
});

test("CFG-08: a drafted connection says so in the list, and one nothing declares says so", async () => {
  routes[`GET ${root}/connection-bindings`] = () => [
    200,
    {
      items: [
        row({ path: "crm", defined: false, draft: "new", bound: false, config: null }),
        row({ path: "mystery", defined: false, connector: "unknown" }),
      ],
    },
  ];
  routes[`GET ${root}/references`] = () => [200, { items: [] }];
  show(<Connections root={root} />);
  expect(await screen.findByText("Draft, never deployed")).toBeTruthy();
  expect(screen.getByText("Not declared anywhere")).toBeTruthy();
});

test("CFG-16: until what uses a connection is read, the list says it is reading, and a removal says what it does not know", async () => {
  let answer: (value: [number, unknown]) => void = () => {};
  routes[`GET ${root}/connection-bindings`] = () => [
    200,
    { items: [row({ path: "shop", connector: "http" })] },
  ];
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const url = new URL(address, "http://console.test");
    if (url.pathname.endsWith("/references")) {
      const [status, body] = await new Promise<[number, unknown]>((resolve) => {
        answer = resolve;
      });
      return new Response(JSON.stringify(body), { status });
    }
    const handler = routes[`${init.method ?? "GET"} ${url.pathname.replace("/api/v1", "")}`];
    const [status, body] = handler ? handler(undefined) : [200, { items: [] }];
    return new Response(JSON.stringify(body), { status });
  });
  show(<Connections root={root} />);
  expect(await screen.findByText("Reading…")).toBeTruthy();
  expect(screen.queryByText("Nothing deployed uses it")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Unbind" }));
  expect(await answerText()).toMatch(/could not be read/);
  answer([500, { status: 500, detail: "The database is busy." }]);
  await waitFor(() => expect(screen.getByText("Could not be read")).toBeTruthy());
});

async function answerText() {
  const dialog = await screen.findByRole("dialog");
  const said = dialog.textContent ?? "";
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  return said;
}

test("CFG-10: the members of a group nothing declares are listed, with Remove and no Change", async () => {
  routes[`GET ${root}/connection-groups`] = () => [
    200,
    {
      items: [
        {
          path: "crm/accounts",
          description: "",
          connector: "http",
          declared: false,
          draft: null,
          configSchema: http,
          members: [
            {
              key: "east",
              label: "East",
              config: { baseUrl: "https://east.example" },
              hasCredential: true,
              updatedAt: "2026-11-10T10:00:00Z",
            },
          ],
        },
      ],
    },
  ];
  show(<ConnectionGroups root={root} />);
  expect(await screen.findByText("Not declared")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Remove" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Add a member" })).toBeNull();
});

const dev: WorkspaceSummary = {
  id: "w-dev",
  slug: "dev",
  name: "Dev",
  type: "dev",
  linkedWorkspaceId: "w-main",
  triggersPaused: false,
};
const main: WorkspaceSummary = {
  ...dev,
  id: "w-main",
  slug: "main",
  name: "Main",
  type: "production",
  linkedWorkspaceId: null,
};

test("CFG-13: with a new target chosen and not saved, there is no button that promotes to the old one", async () => {
  routes[`GET ${base}/workspaces`] = () => [
    200,
    { items: [dev, main, { ...main, id: "w-other", name: "Other" }] },
  ];
  const { rerender } = show(
    <Promotion base={base} workspace={dev} reload={() => {}} linked="w-main" onLink={() => {}} />,
  );
  expect(await screen.findByRole("button", { name: "Review and promote" })).toBeTruthy();
  rerender(
    <Promotion base={base} workspace={dev} reload={() => {}} linked="w-other" onLink={() => {}} />,
  );
  expect(screen.queryByRole("button", { name: "Review and promote" })).toBeNull();
  expect(screen.getByText(/Save the new target/)).toBeTruthy();
});

test("CFG-11, CFG-12: the settings and the clone say what a clone with Safety off gets", async () => {
  routes[`POST ${base}/workspaces/w-main/clones`] = () => [
    202,
    { id: "c1", workspaceId: "w-new", status: "running", error: null, report: {} },
  ];
  routes[`GET ${base}/workspace-clones/c1`] = () => [
    200,
    {
      id: "c1",
      workspaceId: "w-new",
      status: "succeeded",
      error: null,
      report: {
        resources: 1,
        rows: 0,
        tables: 0,
        files: 0,
        connections: 0,
        secrets: 0,
        dataSources: 0,
        connectionGroupMembers: 2,
      },
    },
  ];
  show(<WorkspaceControls base={base} tenantId="t1" workspace={main} reload={() => {}} />);
  expect(screen.getByText(/With Safety off it gets this workspace's/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Clone workspace" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Safety"), { target: { value: "off" } });
  fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
  await waitFor(() => expect(screen.getByRole("dialog").textContent).toMatch(/group members/));
  expect(screen.getByRole("dialog").textContent).toMatch(/connect it again/);
});

test("CFG-19: a provider's word that comes back to the home page is said, once, and taken out of the address", async () => {
  routes["GET /me"] = () => [
    200,
    {
      principal: { type: "member", id: "m1", name: null, email: "a@acme.example" },
      instancePermissions: [],
      tenants: [{ id: "t1", slug: "acme", name: "Acme" }],
    },
  ];
  routes["GET /me/preferences"] = () => [200, { items: [] }];
  routes["GET /me/recent"] = () => [200, { items: [] }];
  routes["GET /tenants?limit=50"] = () => [200, { items: [], nextCursor: null }];
  history.replaceState(null, "", "/?oauth_error=The%20connection%20crm%20was%20removed");
  show(<App />);
  expect(await screen.findByText("The connection crm was removed")).toBeTruthy();
  await waitFor(() => expect(location.search).toBe(""));
});

test("deploying one change that cannot be deployed lists what it names, with a way to the drafts", async () => {
  routes[`GET ${root}`] = () => [200, { ...dev, id: "w1" }];
  routes[`GET ${base}/workspaces`] = () => [200, { items: [] }];
  routes[`GET ${root}/changes/preview`] = () => [
    200,
    {
      possible: false,
      refusal: {
        detail: "It needs what is not set up.",
        errors: [
          { path: "/connections/crm", message: "the connection crm is not bound" },
          { path: "/secrets/KEY", message: "the secret KEY is not set" },
        ],
      },
    },
  ];
  show(<DeployMenu root={root} link={link} path="orders/sync" onDeployed={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Deploy" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "This change only" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getAllByRole("listitem")).toHaveLength(2);
  expect(calls.some((one) => one.method === "POST")).toBe(false);
});

test("?setup= opens the form that makes what a refused promotion names: a variable and a data source", async () => {
  routes[`GET ${root}/variable-values`] = () => [
    200,
    { items: [{ path: "region", description: "", default: null, value: null, arrives: true }] },
  ];
  routes[`GET ${root}/references`] = () => [200, { items: [] }];
  history.replaceState(null, "", `${link}/variables?setup=region`);
  show(<Variables root={root} />);
  const dialog = await screen.findByRole("dialog");
  await waitFor(() => expect(valuesIn(dialog)).toContain("region"));
  expect(location.search).toBe("");
  cleanup();

  routes[`GET ${root}/data-source-bindings`] = () => [
    200,
    {
      items: [
        {
          path: "warehouse",
          description: "",
          defined: false,
          arrives: true,
          bound: false,
          config: null,
          hasPassword: false,
        },
      ],
    },
  ];
  history.replaceState(null, "", `${link}/sources?setup=warehouse`);
  show(<Sources root={root} link={link} />);
  expect(await screen.findByText("Arrives with the next promotion")).toBeTruthy();
  const sheet = await screen.findByRole("dialog");
  await waitFor(() => expect(valuesIn(sheet)).toContain("warehouse"));
});

/** What the fields of a form hold, the hidden one a chosen option fills included. */
const valuesIn = (form: HTMLElement) =>
  [...form.querySelectorAll("input")].map((input) => (input as HTMLInputElement).value);

test("WLK-17h: a Set up link for a variable shows the variable chosen, not a blank choice", async () => {
  routes[`GET ${root}/variable-values`] = () => [
    200,
    { items: [{ path: "region", description: "", default: null, value: null, arrives: true }] },
  ];
  routes[`GET ${root}/references`] = () => [200, { items: [] }];
  history.replaceState(null, "", `${link}/variables?setup=region`);
  show(<Variables root={root} />);
  const dialog = await screen.findByRole("dialog");
  await waitFor(() =>
    expect((within(dialog).getByRole("combobox") as HTMLInputElement).value).toBe("region"),
  );
});

test("WLK-cfg2: a connection's page can unbind it, after saying what that does", async () => {
  routes[`GET ${root}/connection-bindings/drive`] = () => [200, needsReconnect];
  routes[`GET ${root}/connectors`] = () => [200, { items: [] }];
  routes[`GET ${root}/references`] = () => [200, { items: [] }];
  routes[`DELETE ${root}/connection-bindings/drive`] = () => [204, null];
  show(<ConnectionPage root={root} link={link} path="drive" />);
  fireEvent.click(await screen.findByRole("button", { name: "Unbind" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(/Scripts that use it will fail/)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Unbind" }));
  await waitFor(() =>
    expect(calls.some((one) => one.method === "DELETE" && one.url.endsWith("/drive"))).toBe(true),
  );
});

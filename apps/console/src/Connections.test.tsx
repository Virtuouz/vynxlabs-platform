// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { testText } from "./screens/ConnectionWizard.tsx";
import { Connections } from "./screens/Execution.tsx";
import { show } from "./testing.tsx";

const root = "/tenants/t1/workspaces/w1";
let calls: { method: string; url: string; body: unknown }[];
/** What the next Test's task ends with. */
let testEnds: Record<string, unknown>;
let rows: Record<string, unknown>[];

const http = {
  type: "object",
  properties: {
    baseUrl: { type: "string", title: "Address" },
    headers: { type: "object", additionalProperties: { type: "string" } },
  },
  required: ["baseUrl"],
};
const smtp = {
  type: "object",
  properties: {
    host: { type: "string", title: "Server" },
    port: { type: "integer", title: "Port", default: 587 },
    from: { type: "string", title: "From" },
  },
  required: ["host", "from"],
};
const oauth2 = {
  type: "object",
  properties: {
    baseUrl: { type: "string", title: "API address" },
    authorizeUrl: { type: "string", title: "Authorization address" },
    tokenUrl: { type: "string", title: "Token address" },
    clientId: { type: "string", title: "Client ID" },
    scopes: { type: "array", items: { type: "string" }, title: "Scopes" },
    authorizeParams: {
      type: "object",
      additionalProperties: { type: "string" },
      title: "Extra authorization parameters",
    },
    testPath: { type: "string", title: "What Test asks for" },
  },
  required: ["baseUrl", "authorizeUrl", "tokenUrl", "clientId"],
};
const row = (more: Record<string, unknown>) => ({
  description: "",
  defined: true,
  bound: true,
  config: { baseUrl: "https://shop.example" },
  configSchema: http,
  hasCredential: true,
  health: null,
  oauth: null,
  updatedAt: null,
  ...more,
});

let ownConnectors: object[] = [];
beforeEach(() => {
  calls = [];
  ownConnectors = [];
  history.replaceState(null, "", "/t/t1/workspaces/w1/connections");
  testEnds = { status: "succeeded", result: { ok: true, status: 200, latencyMs: 42 } };
  rows = [
    row({
      path: "shop",
      connector: "http",
      health: {
        ok: false,
        problem: "HTTP 401: answered 401.",
        latencyMs: null,
        checkedAt: "2026-11-15T10:00:00Z",
      },
    }),
    row({
      path: "erp",
      connector: "http",
      health: { ok: true, problem: null, latencyMs: 87, checkedAt: "2026-11-15T10:00:00Z" },
    }),
    row({
      path: "outbox",
      connector: "smtp",
      bound: false,
      config: null,
      configSchema: smtp,
      hasCredential: false,
    }),
    row({
      path: "google",
      connector: "oauth2",
      configSchema: oauth2,
      oauth: {
        status: "needs_reconnect",
        expiresAt: null,
        scopes: [],
        connectedAt: null,
        problem: "The provider refused the refresh: invalid_grant",
      },
    }),
  ];
  vi.spyOn(window.location, "assign").mockImplementation(() => {});
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({
      method,
      url: address,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (method === "PUT") return new Response(null, { status: 204 });
    if (address.endsWith("/connection-oauth")) {
      return json({ url: "https://accounts.example/auth?state=s", callback: "x" });
    }
    if (address.endsWith("/connection-tests")) return json({ id: "task-1" }, 202);
    if (address.endsWith("/tasks/task-1")) return json({ id: "task-1", ...testEnds });
    if (address.endsWith("/connectors")) {
      return json({
        items: [
          { name: "http", builtin: true, configSchema: http },
          { name: "smtp", builtin: true, configSchema: smtp },
          { name: "oauth2", builtin: true, configSchema: oauth2 },
          ...ownConnectors,
        ],
      });
    }
    if (address.endsWith("/connection-bindings")) return json({ items: rows });
    return json({ items: [] });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const put = (url: string) => calls.find((call) => call.method === "PUT" && call.url.endsWith(url));

test("the list says what each connection's last Test found, and what needs a member", async () => {
  show(<Connections root={root} />);
  expect(await screen.findByText("HTTP 401: answered 401.")).toBeTruthy();
  expect(screen.getByText("Reached")).toBeTruthy();
  expect(screen.getByText(/^87 ms · tested/)).toBeTruthy();
  expect(screen.getByText("Needs reconnecting")).toBeTruthy();
  expect(screen.getByText("Not set up here")).toBeTruthy();
  // Reconnect is the OAuth connection's first action, and goes to its provider.
  fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
  await waitFor(() =>
    expect(location.assign).toHaveBeenCalledWith("https://accounts.example/auth?state=s"),
  );
  expect(calls.find((call) => call.url.endsWith("/connection-oauth"))?.body).toEqual({
    path: "google",
    returnTo: "/t/t1/workspaces/w1/connections",
  });
});

test("a new connection is declared in a draft, bound, and tested; a refusal says the status and leads back to the credential", async () => {
  testEnds = {
    status: "succeeded",
    result: { ok: false, status: 401, message: "https://crm.example answered 401.", latencyMs: 30 },
  };
  show(<Connections root={root} />);
  fireEvent.click(await screen.findByRole("button", { name: "New connection" }));
  const sheet = await screen.findByRole("dialog");
  fireEvent.change(within(sheet).getByLabelText("Connection"), { target: { value: "__new" } });
  fireEvent.change(within(sheet).getByLabelText("Name"), { target: { value: "crm" } });
  fireEvent.change(await within(sheet).findByLabelText("Address"), {
    target: { value: "https://crm.example" },
  });
  fireEvent.change(within(sheet).getByLabelText("Token or key"), { target: { value: "wrong" } });
  fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));

  await waitFor(() => expect(put("/connection-bindings/crm")).toBeTruthy());
  expect(put("/drafts/crm")?.body).toEqual({
    kind: "connection",
    schemaVersion: 1,
    body: { connector: "http" },
    create: true,
  });
  // Declared first, then bound.
  expect(calls.findIndex((call) => call.url.endsWith("/drafts/crm"))).toBeLessThan(
    calls.findIndex(
      (call) => call.url.endsWith("/connection-bindings/crm") && call.method === "PUT",
    ),
  );
  expect(put("/connection-bindings/crm")?.body).toEqual({
    config: { baseUrl: "https://crm.example" },
    credential: "wrong",
  });
  expect(
    await within(sheet).findByText("Failed (HTTP 401): https://crm.example answered 401."),
  ).toBeTruthy();
  expect(calls.find((call) => call.url.endsWith("/connection-tests"))?.body).toEqual({
    path: "crm",
  });
  expect(within(sheet).getByRole("button", { name: "Change the token or key" })).toBeTruthy();
});

test("a new connection can be of the workspace's own connector, with the form that connector gives (P31)", async () => {
  ownConnectors = [
    {
      name: "billing/ledger",
      builtin: false,
      configSchema: {
        type: "object",
        properties: { region: { type: "string", title: "Region" } },
        required: ["region"],
      },
    },
  ];
  show(<Connections root={root} />);
  fireEvent.click(await screen.findByRole("button", { name: "New connection" }));
  const sheet = await screen.findByRole("dialog");
  fireEvent.change(within(sheet).getByLabelText("Connection"), { target: { value: "__new" } });
  fireEvent.change(within(sheet).getByLabelText("Name"), { target: { value: "books" } });
  fireEvent.change(await within(sheet).findByLabelText("Kind"), {
    target: { value: "billing/ledger" },
  });
  fireEvent.change(await within(sheet).findByLabelText("Region"), { target: { value: "eu" } });
  fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(put("/connection-bindings/books")).toBeTruthy());
  expect(put("/drafts/books")?.body).toMatchObject({ body: { connector: "billing/ledger" } });
  expect(put("/connection-bindings/books")?.body).toMatchObject({ config: { region: "eu" } });
});

test("a declared connection of another kind is set up with the form its connector gives", async () => {
  show(<Connections root={root} />);
  fireEvent.click(await screen.findByRole("button", { name: "Set up" }));
  const sheet = await screen.findByRole("dialog");
  fireEvent.change(within(sheet).getByLabelText("Server"), {
    target: { value: "mail.acme.example" },
  });
  fireEvent.change(within(sheet).getByLabelText("From"), {
    target: { value: "orders@acme.example" },
  });
  fireEvent.change(within(sheet).getByLabelText("Password"), { target: { value: "s3cret" } });
  fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(put("/connection-bindings/outbox")).toBeTruthy());
  // Declared already: no draft.
  expect(put("/drafts/outbox")).toBeUndefined();
  expect(put("/connection-bindings/outbox")?.body).toEqual({
    config: { host: "mail.acme.example", port: 587, from: "orders@acme.example" },
    credential: "s3cret",
  });
  expect(await within(sheet).findByText("Reached (200) in 42 ms.")).toBeTruthy();
});

test("an OAuth connection starts from a provider's addresses, shows where to send members back, and is connected before it is tested", async () => {
  show(<Connections root={root} />);
  fireEvent.click(await screen.findByRole("button", { name: "New connection" }));
  const sheet = await screen.findByRole("dialog");
  fireEvent.change(within(sheet).getByLabelText("Connection"), { target: { value: "__new" } });
  fireEvent.change(within(sheet).getByLabelText("Name"), { target: { value: "graph" } });
  fireEvent.change(await within(sheet).findByLabelText("Kind"), { target: { value: "oauth2" } });
  fireEvent.change(await within(sheet).findByLabelText("Provider"), {
    target: { value: "microsoft" },
  });
  fireEvent.change(within(sheet).getByLabelText("Directory (tenant)"), {
    target: { value: "contoso.example" },
  });
  expect(
    within(sheet).getByText(`${location.origin}/api/v1/oauth/connections/callback`),
  ).toBeTruthy();
  fireEvent.change(await within(sheet).findByLabelText("Client ID"), {
    target: { value: "client-1" },
  });
  fireEvent.change(within(sheet).getByLabelText("Client secret"), { target: { value: "cs" } });
  fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(put("/connection-bindings/graph")).toBeTruthy());
  expect(put("/connection-bindings/graph")?.body).toEqual({
    config: {
      baseUrl: "https://graph.microsoft.com/v1.0",
      authorizeUrl: "https://login.microsoftonline.com/contoso.example/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/contoso.example/oauth2/v2.0/token",
      scopes: ["offline_access", "User.Read"],
      testPath: "/me",
      clientId: "client-1",
    },
    credential: "cs",
  });
  // Not tested yet: it is not connected.
  expect(calls.some((call) => call.url.endsWith("/connection-tests"))).toBe(false);
});

test("back from the provider, the connection's sheet opens again and tests it", async () => {
  rows[3] = row({
    path: "google",
    connector: "oauth2",
    configSchema: oauth2,
    oauth: {
      status: "connected",
      expiresAt: null,
      scopes: ["email"],
      connectedAt: null,
      problem: null,
    },
  });
  history.replaceState(
    null,
    "",
    "/t/t1/workspaces/w1/connections?oauth=connected&connection=google",
  );
  show(<Connections root={root} />);
  const sheet = await screen.findByRole("dialog");
  expect(within(sheet).getByText("Set up google")).toBeTruthy();
  expect(await within(sheet).findByText("Reached (200) in 42 ms.")).toBeTruthy();
  expect(calls.find((call) => call.url.endsWith("/connection-tests"))?.body).toEqual({
    path: "google",
  });
  // The address no longer says it came back.
  await waitFor(() => expect(window.location.search).toBe(""));
});

test("production lists what the next promotion brings, sets it up as its own kind, and never drafts", async () => {
  rows = [
    row({
      path: "mail",
      connector: "smtp",
      defined: false,
      arrives: true,
      bound: false,
      config: null,
      configSchema: smtp,
      hasCredential: false,
    }),
  ];
  history.replaceState(null, "", "/t/t1/workspaces/w1/connections?setup=mail");
  show(<Connections root={root} production />);
  // The address of a refused promotion's entry opens it.
  const sheet = await screen.findByRole("dialog");
  expect(within(sheet).getByLabelText("Server")).toBeTruthy();
  expect(within(sheet).queryByText("A new connection…")).toBeNull();
  fireEvent.change(within(sheet).getByLabelText("Server"), { target: { value: "smtp.acme.test" } });
  fireEvent.change(within(sheet).getByLabelText("From"), { target: { value: "ops@acme.test" } });
  fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(put("/connection-bindings/mail")).toBeTruthy());
  expect(put("/drafts/mail")).toBeUndefined();
  expect(put("/connection-bindings/mail")?.body).toMatchObject({
    config: { host: "smtp.acme.test", from: "ops@acme.test" },
  });
});

test("a stored credential is removed from the connection's sheet: Save sends credential null (CFG-MP5)", async () => {
  show(<Connections root={root} />);
  const shop = (await screen.findByText("shop")).closest("tr") as HTMLElement;
  fireEvent.click(within(shop).getByRole("button", { name: "Change" }));
  const sheet = await screen.findByRole("dialog");
  fireEvent.click(within(sheet).getByRole("button", { name: /^Remove the token or key/ }));
  expect(within(sheet).getByText(/will be removed when you save/)).toBeTruthy();
  fireEvent.click(within(sheet).getByRole("button", { name: /^Save/ }));
  await waitFor(() => expect(put("/connection-bindings/shop")).toBeTruthy());
  expect(put("/connection-bindings/shop")?.body).toEqual({
    config: { baseUrl: "https://shop.example" },
    credential: null,
  });
});

test("WLK-17a: at a phone's width the health, used-by and kind cells keep room, and a header never wraps into the next", async () => {
  show(<Connections root={root} />);
  await screen.findByText("HTTP 401: answered 401.");
  // A heading wraps inside its own cell, so it can never run into the next one: held on one
  // line it drew over its neighbour at the larger type (polish-layout measures this in a browser).
  for (const header of screen.getAllByRole("columnheader")) {
    expect(header.className).not.toMatch(/whitespace-nowrap|truncate/);
  }
  const health = document.querySelector("[data-health]");
  expect(health?.className).toContain("min-w-0");
  const kind = screen.getAllByText("HTTP")[0]?.closest("td")?.firstElementChild;
  expect(kind?.className).toContain("whitespace-nowrap");
});

test("at a phone's width a row keeps its name and its state, and the table does not scroll for the rest (P31)", async () => {
  show(<Connections root={root} />);
  await screen.findByText("HTTP 401: answered 401.");
  const header = (name: string) => screen.getByRole("columnheader", { name });
  for (const hidden of ["Used by", "Kind", "Points to"]) {
    expect(header(hidden).className).toContain("hidden");
  }
  expect(header("Health").className).not.toContain("hidden");
  // A connection not set up here says so in the column a phone keeps.
  const outbox = screen.getByText("outbox").closest("tr") as HTMLElement;
  const column = [...(outbox.parentElement?.parentElement?.querySelectorAll("th") ?? [])].findIndex(
    (th) => th.textContent === "Health",
  );
  expect(outbox.querySelectorAll("td")[column]?.textContent).toContain("Not set up here");
});

test("WLK-17g: in production with nothing arriving, Set up a connection says so and opens no empty form", async () => {
  rows = [row({ path: "shop", connector: "http" })];
  show(<Connections root={root} production />);
  await screen.findByText("shop");
  fireEvent.click(await screen.findByRole("button", { name: "Set up a connection" }));
  expect(await screen.findByText(/Nothing waits to be set up here/)).toBeTruthy();
  expect(screen.queryByRole("dialog", { name: /New connection/ })).toBeNull();
});

test("a test that got a 404 or a refusal is not said as a success", () => {
  const ended = (result: unknown) =>
    ({ status: "succeeded", result }) as unknown as Parameters<typeof testText>[0];
  expect(testText(ended({ ok: true, status: 200, latencyMs: 42 }))).toEqual({
    ok: true,
    text: "Reached (200) in 42 ms.",
  });
  const missing = testText(
    ended({ ok: false, status: 404, message: "https://x.example answered 404: nothing is there." }),
  );
  expect(missing.ok).toBe(false);
  expect(missing.text).toMatch(/^Failed \(HTTP 404\)/);
  expect(missing.text).not.toMatch(/Reached/);
});

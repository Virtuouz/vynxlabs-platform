// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Me } from "./api.ts";
import { usePath } from "./router.tsx";
import { Connections, Variables } from "./screens/Execution.tsx";
import { RepositorySettings } from "./screens/Git.tsx";
import { SecretPage } from "./screens/ObjectPages.tsx";
import { Tenant } from "./screens/Tenant.tsx";
import { show } from "./testing.tsx";

/** Rough edges of configure and extensions (phase 29, lane t4-config-ext). */

const root = "/tenants/t1/workspaces/w1";
let routes: Record<string, (body: unknown) => [number, unknown]>;
let calls: { method: string; url: string; body: unknown }[];

const http = {
  type: "object",
  properties: { baseUrl: { type: "string", title: "Address" } },
  required: ["baseUrl"],
};

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

test("CFG-20, EXT-16: a new connection may be named with an underscore, as the platform allows", async () => {
  routes[`GET ${root}/connection-bindings`] = () => [200, { items: [] }];
  routes[`GET ${root}/connectors`] = () => [
    200,
    { items: [{ name: "http", builtin: true, configSchema: http }] },
  ];
  routes[`GET ${root}/references`] = () => [200, { items: [] }];
  routes[`PUT ${root}/drafts/my_crm`] = () => [200, {}];
  routes[`PUT ${root}/connection-bindings/my_crm`] = () => [200, {}];
  show(<Connections root={root} />);
  fireEvent.click(
    (await screen.findAllByRole("button", { name: "New connection" }))[0] as HTMLElement,
  );
  const sheet = await screen.findByRole("dialog");
  fireEvent.change(within(sheet).getByLabelText("Name"), { target: { value: "my_crm" } });
  fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(calls.some((c) => c.url.endsWith("/drafts/my_crm"))).toBe(true));
  expect(within(sheet).queryByText(/Name it with/)).toBeNull();
});

test("CFG-21: when the kinds cannot be read, the wizard says so and offers to try again", async () => {
  routes[`GET ${root}/connection-bindings`] = () => [200, { items: [] }];
  routes[`GET ${root}/connectors`] = () => [500, { status: 500, detail: "The database is busy." }];
  routes[`GET ${root}/references`] = () => [200, { items: [] }];
  show(<Connections root={root} />);
  fireEvent.click(
    (await screen.findAllByRole("button", { name: "New connection" }))[0] as HTMLElement,
  );
  const sheet = await screen.findByRole("dialog");
  expect(await within(sheet).findByRole("button", { name: "Try again" })).toBeTruthy();
});

test("CFG-23: setting a variable names it, and an empty value can be given and is shown", async () => {
  routes[`GET ${root}/variable-values`] = () => [
    200,
    { items: [{ path: "region", description: "", default: "eu", value: null }] },
  ];
  routes[`GET ${root}/references`] = () => [200, { items: [] }];
  routes[`PUT ${root}/variable-values/region`] = () => [200, {}];
  history.replaceState(null, "", "/t/t1/workspaces/w1/variables?setup=region");
  show(<Variables root={root} />);
  const dialog = await screen.findByRole("dialog");
  await waitFor(() =>
    expect((within(dialog).getByRole("combobox") as HTMLInputElement).value).toBe("region"),
  );
  expect((within(dialog).getByLabelText("Value") as HTMLInputElement).required).toBe(false);
  fireEvent.click(within(dialog).getByRole("button", { name: "Set variable" }));
  await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
  expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ value: "" });
  expect(await screen.findByText("Set region to an empty value in this workspace.")).toBeTruthy();
  expect(screen.queryByText("Created.")).toBeNull();
});

test("CFG-23: a variable set to the empty value says Empty in its cell", async () => {
  routes[`GET ${root}/variable-values`] = () => [
    200,
    { items: [{ path: "region", description: "", default: "eu", value: "" }] },
  ];
  routes[`GET ${root}/references`] = () => [200, { items: [] }];
  show(<Variables root={root} />);
  expect(await screen.findByText("Empty")).toBeTruthy();
});

test("CFG-24: a replaced secret shows the stored line again, not a form for another", async () => {
  let updatedAt = "2026-11-01T10:00:00Z";
  routes[`GET ${root}/secrets`] = () => [
    200,
    { items: [{ name: "KEY", updatedAt, updatedBy: "ana" }] },
  ];
  routes[`GET ${root}/references`] = () => [200, { items: [] }];
  routes[`PUT ${root}/secrets/KEY`] = () => {
    updatedAt = "2026-11-22T10:00:00Z";
    return [200, {}];
  };
  show(<SecretPage root={root} link="/t/t1/workspaces/w1" name="KEY" />);
  fireEvent.click(await screen.findByRole("button", { name: "Replace the value" }));
  fireEvent.change(await screen.findByLabelText("New value"), { target: { value: "s3cret" } });
  fireEvent.click(screen.getByRole("button", { name: "Replace the value" }));
  await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
  expect(await screen.findByRole("button", { name: "Replace the value" })).toBeTruthy();
  expect(screen.queryByLabelText("New value")).toBeNull();
});

const tenantBase = "/tenants/t1";
function repositoryAnd(tenant: Record<string, unknown>) {
  routes[`GET ${tenantBase}/git-repository`] = () => [200, { repository: null }];
  routes[`GET ${tenantBase}`] = () => [200, { id: "t1", name: "Acme", slug: "acme", ...tenant }];
}

test("EXT-10: a tenant administrator turns writing code in the console off, after being told what that does", async () => {
  repositoryAnd({ consoleCode: true, mayRename: true });
  routes[`PATCH ${tenantBase}`] = (body) => [
    200,
    { consoleCode: (body as { consoleCode: boolean }).consoleCode },
  ];
  show(<RepositorySettings base={tenantBase} />);
  expect(await screen.findByText(/Writing code in the console is on/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Turn off code in the console" }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).toMatch(
    /can no longer save or test scripts, connectors and trigger sources/,
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "Turn off" }));
  await waitFor(() =>
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ consoleCode: false }),
  );
});

test("EXT-10: when it is off the page says so and offers to turn it on; a reader sees the state and no button", async () => {
  repositoryAnd({ consoleCode: false, mayRename: true });
  show(<RepositorySettings base={tenantBase} />);
  expect(await screen.findByText(/Writing code in the console is off/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Turn on code in the console" })).toBeTruthy();
  cleanup();
  repositoryAnd({ consoleCode: false, mayRename: false });
  show(<RepositorySettings base={tenantBase} />);
  expect(await screen.findByText(/Writing code in the console is off/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /code in the console/ })).toBeNull();
});

const connection = {
  path: "shop",
  connector: "http",
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
};
/** Absent, or greyed by the piece that says what it takes: neither can be pressed. */
const unavailable = (name: string | RegExp) =>
  screen
    .queryAllByRole("button", { name })
    .every(
      (one) =>
        (one as HTMLButtonElement).disabled ||
        (one.closest("fieldset") as HTMLFieldSetElement | null)?.disabled,
    );
const needsSaid = (permission: string) =>
  waitFor(() => expect(document.body.textContent).toContain(`It needs ${permission}`));
const allowedAre = (allowed: string[]) => {
  routes[`GET ${root}/allowed`] = () => [200, { allowed }];
};

test("CFG-26: someone who may only read connections is offered no change, and told what they lack", async () => {
  allowedAre([]);
  routes[`GET ${root}/connection-bindings`] = () => [200, { items: [connection] }];
  routes[`GET ${root}/references`] = () => [200, { items: [] }];
  show(<Connections root={root} />);
  expect(await screen.findByText("shop")).toBeTruthy();
  await needsSaid("connection:write");
  for (const name of ["New connection", "Change", "Unbind", "Test"]) {
    expect(unavailable(name)).toBe(true);
  }
});

test("CFG-26: with connection:write and resource:write a connection is offered everything; without resource:write it cannot be declared", async () => {
  allowedAre(["connection:write", "resource:write", "run:read"]);
  routes[`GET ${root}/connection-bindings`] = () => [200, { items: [connection] }];
  routes[`GET ${root}/references`] = () => [200, { items: [] }];
  show(<Connections root={root} />);
  for (const name of ["New connection", "Change", "Unbind", "Test"]) {
    expect(await screen.findByRole("button", { name })).toBeTruthy();
  }
  cleanup();
  allowedAre(["connection:write", "run:read"]);
  show(<Connections root={root} />);
  expect(await screen.findByRole("button", { name: "Change" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "New connection" })).toBeNull();
});

test("CFG-26: a variable's controls follow variable:write", async () => {
  allowedAre([]);
  routes[`GET ${root}/variable-values`] = () => [
    200,
    { items: [{ path: "region", description: "", default: "eu", value: "us" }] },
  ];
  routes[`GET ${root}/references`] = () => [200, { items: [] }];
  show(<Variables root={root} />);
  expect(await screen.findByText("region")).toBeTruthy();
  await needsSaid("variable:write");
  expect(unavailable("Set variable")).toBe(true);
  expect(unavailable("Use default")).toBe(true);
  cleanup();
  allowedAre(["variable:write"]);
  show(<Variables root={root} />);
  expect(await screen.findByRole("button", { name: "Set variable" })).toBeTruthy();
  expect(await screen.findByRole("button", { name: "Use default" })).toBeTruthy();
});

test("CFG-26: the secrets list and a secret's page follow secret:write", async () => {
  const me: Me = {
    principal: { type: "member", id: "m1", name: "Ada", email: "ada@acme.test" },
    instancePermissions: [],
    tenants: [{ id: "t1", slug: "acme", name: "Acme" }],
  };
  function AtAddress() {
    return <Tenant tenantId="t1" me={me} path={usePath()} />;
  }
  routes[`GET ${root}`] = () => [200, { id: "w1", slug: "dev", name: "Dev", type: "dev" }];
  routes[`GET ${root}/secrets`] = () => [
    200,
    { items: [{ name: "KEY", updatedAt: "2026-11-01T10:00:00Z" }] },
  ];
  routes[`GET ${root}/references`] = () => [200, { items: [] }];
  allowedAre([]);
  history.replaceState(null, "", "/t/t1/workspaces/w1/secrets");
  show(<AtAddress />);
  expect(await screen.findByText("KEY")).toBeTruthy();
  await needsSaid("secret:write");
  expect(unavailable("New secret")).toBe(true);
  expect(unavailable("Delete")).toBe(true);
  cleanup();
  show(<SecretPage root={root} link="/t/t1/workspaces/w1" name="KEY" />);
  expect(await screen.findByText(/Encrypted/)).toBeTruthy();
  expect(unavailable("Replace the value")).toBe(true);
});

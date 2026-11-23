// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { isEditedKind, objectHref } from "./kit/objects.tsx";
import { ReferenceList } from "./kit/references.tsx";
import {
  ConnectionPage,
  EventPage,
  ScriptPage,
  SecretPage,
  TriggersOf,
  VariablePage,
} from "./screens/ObjectPages.tsx";
import { show } from "./testing.tsx";

const root = "/tenants/t1/workspaces/w1";
const link = "/t/t1/workspaces/w1";
let routes: Record<string, () => [number, unknown]>;

beforeEach(() => {
  routes = {};
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("fetch", async (address: string) => {
    const url = new URL(address, "http://console.test");
    const path = url.pathname.replace("/api/v1", "");
    const answer = routes[`${path}${url.search}`] ?? routes[path];
    const [status, body] = answer ? answer() : [404, { status: 404, detail: "Not found" }];
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const uses = [
  {
    target: { kind: "connection", name: "erp" },
    by: { kind: "script", path: "orders/sync" },
    how: "calls it",
  },
  {
    target: { kind: "connection", name: "erp" },
    by: { kind: "flow", path: "orders/reorder" },
    how: "gives it to orders/sync in step a",
    draft: true,
  },
];

test("every kind of thing has a home to link to", () => {
  expect(objectHref(link, "connection", "erp")).toBe(`${link}/connections/erp`);
  expect(objectHref(link, "variable", "config/size")).toBe(`${link}/variables/config/size`);
  expect(objectHref(link, "secret", "TOKEN")).toBe(`${link}/secrets/TOKEN`);
  expect(objectHref(link, "event", "order/placed")).toBe(`${link}/events/order/placed`);
  expect(objectHref(link, "script", "orders/sync")).toBe(`${link}/scripts/orders/sync`);
  expect(objectHref(link, "flow", "orders/reorder")).toBe(`${link}/flows/orders/reorder`);
  expect(objectHref(link, "schedule", "nightly")).toBe(`${link}/triggers?trigger=nightly`);
  expect(objectHref(link, "table", "orders")).toBe(`${link}/tables/orders`);
  expect(objectHref(link, "connection_group", "crm/accounts")).toBe(`${link}/connections`);
  expect(objectHref(link, "workspace", "settings")).toBe(`${link}/alerts`);
});

test("no kind is sent to an editor that does not exist for it (REL-07)", () => {
  const kinds = [
    "role",
    "connector",
    "connection",
    "connection_group",
    "variable",
    "table",
    "query",
    "data_source",
    "event",
    "script",
    "trigger_source",
    "schedule",
    "trigger",
    "flow",
    "theme",
    "interface",
    "dashboard",
    "doc",
    "app",
    "binding",
  ];
  for (const kind of kinds) {
    const to = objectHref(link, kind, "a/b");
    if (!isEditedKind(kind)) expect(to, kind).not.toContain("/resources/edit/");
  }
  expect(objectHref(link, "query", "sales/by-day")).toBe(`${link}/queries?query=sales%2Fby-day`);
  expect(objectHref(link, "data_source", "erp/db")).toBe(`${link}/sources/erp/db`);
  expect(objectHref(link, "doc", "guide/intro")).toBe(`${link}/docs/guide/intro`);
  expect(objectHref(link, "theme", "theme")).toBe(`${link}/resources`);
  expect(objectHref(link, "variable", "a/b")).toBe(`${link}/variables/a/b`);
  expect(objectHref(link, "connection_group", "a/b")).toBe(
    `${link}/resources/edit/connection_group/a/b`,
  );
});

test("what uses a thing is a list of links, drafts marked, and a failed read says so", async () => {
  routes[`${root}/references`] = () => [200, { items: uses }];
  show(<ReferenceList root={root} link={link} kind="connection" name="erp" />);
  const list = await screen.findByRole("list", { name: "What uses erp" });
  expect(within(list).getByRole("link", { name: "orders/sync" }).getAttribute("href")).toBe(
    `${link}/scripts/orders/sync`,
  );
  expect(within(list).getByText("in a draft")).toBeTruthy();
  cleanup();
  routes[`${root}/references`] = () => [500, { status: 500, detail: "The database is busy." }];
  show(<ReferenceList root={root} link={link} kind="connection" name="erp" />);
  expect(await screen.findByText(/What uses it could not be read/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
});

test("a connection has a page with where it points and what uses it", async () => {
  routes[`${root}/connection-bindings/erp`] = () => [
    200,
    {
      path: "erp",
      connector: "http",
      description: "The ERP",
      defined: true,
      bound: true,
      config: { baseUrl: "https://erp.example" },
      hasCredential: true,
      updatedAt: "2026-11-16T10:00:00.000Z",
      health: null,
    },
  ];
  routes[`${root}/references`] = () => [200, { items: uses }];
  history.replaceState(null, "", `${link}/connections/erp?tab=used-by`);
  show(<ConnectionPage root={root} link={link} path="erp" />);
  expect(await screen.findByRole("heading", { level: 1, name: "erp" })).toBeTruthy();
  expect(screen.getByText("Set up here")).toBeTruthy();
  // Opened on the tab its address names.
  expect(await screen.findByRole("list", { name: "What uses erp" })).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Where it points" }));
  await waitFor(() => expect(new URLSearchParams(location.search).get("tab")).toBe("settings"));
  history.replaceState(null, "", "/");
});

test("a variable, a secret, an event and a script each have a page; an unknown one says so", async () => {
  routes[`${root}/variable-values/config/size`] = () => [
    200,
    { path: "config/size", description: "", default: "5", value: null },
  ];
  routes[`${root}/secrets`] = () => [
    200,
    { items: [{ name: "TOKEN", updatedAt: "2026-11-16T10:00:00.000Z" }] },
  ];
  routes[`${root}/resources/order/placed`] = () => [
    200,
    {
      kind: "event",
      path: "order/placed",
      ownership: "ui",
      version: 2,
      body: { description: "An order came in" },
    },
  ];
  routes[`${root}/scripts`] = () => [
    200,
    {
      items: [{ path: "orders/sync", description: "Syncs orders", ownership: "ui", lastRun: null }],
    },
  ];
  routes[`${root}/references`] = () => [200, { items: [] }];

  show(<VariablePage root={root} link={link} path="config/size" />);
  expect(await screen.findByText("The default: 5")).toBeTruthy();
  cleanup();
  show(<SecretPage root={root} link={link} name="TOKEN" />);
  expect(await screen.findByRole("heading", { level: 1, name: "TOKEN" })).toBeTruthy();
  cleanup();
  show(<EventPage root={root} link={link} path="order/placed" />);
  expect(await screen.findByText("An order came in")).toBeTruthy();
  cleanup();
  show(<ScriptPage root={root} link={link} path="orders/sync" />);
  expect(await screen.findByRole("button", { name: "Open the code" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: "Triggers" })).toBeTruthy();
  cleanup();
  show(<SecretPage root={root} link={link} name="MISSING" />);
  expect(await screen.findByRole("link", { name: "Go to the secrets" })).toBeTruthy();
});

test("a trigger inside a flow links to Triggers by its path and node, so it opens chosen there", async () => {
  routes[`/tenants/t1/workspaces/w1/triggers`] = () => [
    200,
    {
      items: [
        {
          path: "intake/route",
          node: "nightly",
          type: "schedule",
          script: "intake/route",
          targetKind: "flow",
          enabled: true,
          cron: "0 2 * * *",
          timezone: null,
          nextFireAt: null,
          paused: null,
        },
        {
          path: "reminders/hourly",
          node: "",
          type: "schedule",
          script: "intake/route",
          targetKind: "flow",
          enabled: true,
          cron: "0 * * * *",
          timezone: null,
          nextFireAt: null,
          paused: null,
        },
      ],
    },
  ];
  show(<TriggersOf root={root} link={link} kind="flow" path="intake/route" />);
  const grid = await screen.findByRole("grid", { name: "Triggers of intake/route" });
  expect(within(grid).getByRole("link", { name: "intake/route" }).getAttribute("href")).toBe(
    `${link}/triggers?trigger=intake%2Froute%23nightly`,
  );
  // A trigger of its own, with no node, is linked by its path alone.
  expect(within(grid).getByRole("link", { name: "reminders/hourly" }).getAttribute("href")).toBe(
    `${link}/triggers?trigger=reminders%2Fhourly`,
  );
});

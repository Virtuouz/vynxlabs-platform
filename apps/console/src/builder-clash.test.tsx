// @vitest-environment happy-dom

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { InterfaceBody, PageWidget } from "@volvel/manifest";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { InterfaceBuilder } from "./screens/builder/AppBuilder.tsx";
import { show } from "./testing.tsx";

// P31: the builder's draft clash offers to copy what was written, as the other editors do.

const root = "/tenants/t1/workspaces/w1";
const api = `/api/v1${root}`;
const text = (id: string, at: PageWidget["at"]) =>
  ({ id, type: "core/text", title: id, at, config: { text: id } }) as PageWidget;
const published: InterfaceBody = {
  title: "Sales",
  pages: [
    {
      id: "money",
      title: "Money",
      widgets: [text("a", { x: 0, y: 0, w: 12, h: 3 }), text("b", { x: 0, y: 3, w: 12, h: 3 })],
    },
  ],
};
let calls: string[];
let summary: Record<string, unknown>;
/** The one app in the list: a test changes it before it opens the builder. */
let listed: Record<string, unknown>;

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  calls = [];
  listed = { path: "screens/sales", title: "Sales", deployed: true, app: "sales" };
  const routes: Record<string, [number, unknown]> = {
    [`GET ${api}/interfaces/screens/sales`]: [200, { body: published }],
    [`GET ${api}/drafts/screens/sales`]: [200, { revision: 1, body: published }],
    [`PUT ${api}/drafts/screens/sales`]: [
      409,
      { status: 409, code: "draft_changed", detail: "Someone else saved this." },
    ],
    [`GET ${api}/interfaces`]: [
      200,
      {
        items: [listed],
      },
    ],
    [`GET ${api}/drafts`]: [200, { items: [] }],
    [`GET ${api}/apps`]: [200, { items: [{ path: "sales", url: "https://sales.example" }] }],
    [`GET ${api}/group-keys`]: [200, { items: [] }],
    [`GET ${api}/flows`]: [200, { items: [] }],
    [`GET ${api}/scripts`]: [200, { items: [] }],
    [`GET ${api}/queries/schema`]: [200, { tables: [], functions: [], maySql: false }],
    [`GET ${api}/widget-data`]: [200, { inputs: {} }],
    [`GET ${api}/resources`]: [200, { items: [] }],
  };
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push(`${method} ${address}`);
    if (address === `${api}/summary`) return new Response(JSON.stringify(summary), { status: 200 });
    const [status, reply] = routes[`${method} ${address.split("?")[0]}`] ?? [
      404,
      { detail: "No mock" },
    ];
    return new Response(JSON.stringify(reply), { status });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const open = async () => {
  show(<InterfaceBuilder root={root} link="/t/t1/workspaces/w1" path="screens/sales" />);
  await screen.findByRole("heading", { name: "On this page" });
};

test("an app saved over by someone else offers to copy what was written, and to load theirs", async () => {
  summary = { mayAuthor: true, authorBlockedBy: null };
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Rename the app" }));
  const field = screen.getByLabelText("Name of the app") as HTMLInputElement;
  fireEvent.change(field, { target: { value: "Takings" } });
  fireEvent.keyDown(field, { key: "Enter" });
  await waitFor(
    () => expect(screen.getByRole("button", { name: "Load their version" })).toBeTruthy(),
    {
      timeout: 4000,
    },
  );
  expect(screen.getByRole("button", { name: "Copy what I wrote" })).toBeTruthy();
}, 15000);

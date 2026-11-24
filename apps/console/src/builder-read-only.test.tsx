// @vitest-environment happy-dom

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { InterfaceBody, PageWidget } from "@volvel/manifest";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { InterfaceBuilder } from "./screens/builder/AppBuilder.tsx";
import { readOnlyWords } from "./screens/builder/ReadOnly.tsx";
import { show } from "./testing.tsx";

// Phase 28, K1: someone who may not edit sees the builder read only, with one line that says why.

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

test("a viewer reads the published page, with no way to change, add, preview or publish", async () => {
  summary = { mayAuthor: false, authorBlockedBy: "permission" };
  await open();
  const line = document.querySelector("[data-read-only]") as HTMLElement;
  expect(line.textContent).toContain("Read only");
  expect(line.textContent).toContain("resource:write or interface:write");
  expect(screen.queryByRole("button", { name: "Rename the app" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Add to page" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Preview/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "Add a page" })).toBeNull();
  // The outline's rows cannot be dragged.
  expect(document.querySelector("[data-outline-row] [data-handle]")).toBeNull();
  // A widget is chosen and its drawer read, but its settings are switched off.
  fireEvent.click(screen.getByRole("button", { name: "a" }));
  await waitFor(() => expect(document.querySelector("fieldset[disabled]")).toBeTruthy());
  // Nothing was read as a draft, and nothing was written.
  expect(calls.some((call) => call.startsWith("PUT"))).toBe(false);
  expect(calls.some((call) => call.includes("/drafts/"))).toBe(false);
});

test("someone who may edit sees the builder as it was", async () => {
  summary = { mayAuthor: true, authorBlockedBy: null };
  await open();
  expect(document.querySelector("[data-read-only]")).toBeNull();
  expect(screen.getByRole("button", { name: "Add to page" })).toBeTruthy();
});

test("the line says production when it is production, and what is needed when it is a permission", () => {
  expect(readOnlyWords("Apps", "production")).toContain("production workspace");
  expect(readOnlyWords("Apps", "permission")).toContain("permission");
});

test("an app the repository manages is read only until it is taken over, and says what that does (BLD-10, D35)", async () => {
  summary = { mayAuthor: true, authorBlockedBy: null };
  Object.assign(listed, { ownership: "code", draft: false });
  await open();
  expect(screen.getByText(/defined in code, in the tenant's repository/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Rename the app" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Add to page" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Take over" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Rename the app" })).toBeTruthy());
  expect(screen.getByText(/takes it back/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Take over" })).toBeNull();
  expect(calls.some((call) => call.startsWith("PUT"))).toBe(false);
});

test("an app the repository manages that already has a draft is being taken over, and is edited", async () => {
  summary = { mayAuthor: true, authorBlockedBy: null };
  Object.assign(listed, { ownership: "code", draft: true });
  await open();
  expect(screen.queryByRole("button", { name: "Take over" })).toBeNull();
  expect(screen.getByRole("button", { name: "Rename the app" })).toBeTruthy();
  expect(screen.getByText(/taking this app over from the repository/i)).toBeTruthy();
});

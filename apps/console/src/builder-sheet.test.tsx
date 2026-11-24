// @vitest-environment happy-dom

import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { InterfaceBody, PageWidget } from "@volvel/manifest";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { InterfaceBuilder } from "./screens/builder/AppBuilder.tsx";
import { show } from "./testing.tsx";

// Round 5: on a screen too narrow for the settings pane, the widget's settings are a sheet that closes
// (the focus coming back to the widget it was opened on does not choose it again).

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
  // A phone: nothing is wide enough, so the settings are a sheet.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  calls = [];
  listed = { path: "screens/sales", title: "Sales", deployed: true, app: "sales" };
  const routes: Record<string, [number, unknown]> = {
    [`GET ${api}/interfaces/screens/sales`]: [200, { body: published }],
    [`GET ${api}/drafts/screens/sales`]: [200, { revision: 1, body: published }],
    [`PUT ${api}/drafts/screens/sales`]: [200, { revision: 2, body: published }],
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
  await screen.findByRole("button", { name: "Pages and widgets" });
};

test("the settings sheet of a widget closes by its X and by Escape, and the focus returning to the widget does not open it again", async () => {
  summary = { mayAuthor: true, authorBlockedBy: null };
  await open();
  const cell = () => document.querySelector('[data-widget-cell="a"]') as HTMLElement;
  await waitFor(() => expect(cell()).toBeTruthy());
  fireEvent.click(cell());
  const sheet = await screen.findByRole("dialog", { name: "Settings" });
  expect(sheet).toBeTruthy();
  // Closed by its own X.
  fireEvent.click(within(sheet).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull());
  // The sheet gives the focus back to the widget; a widget focused by the keyboard is chosen, but
  // not the one that was just let go of, so the sheet stays shut.
  act(() => cell().focus());
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
  // Escape does the same.
  fireEvent.click(document.querySelector('[data-widget-cell="b"]') as HTMLElement);
  const again = await screen.findByRole("dialog", { name: "Settings" });
  fireEvent.keyDown(again, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull());
  act(() => (document.querySelector('[data-widget-cell="b"]') as HTMLElement).focus());
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
}, 15000);

test("round 6: the builder bar's save words keep one width, so the bar does not change height when a save finishes", async () => {
  summary = { mayAuthor: true, authorBlockedBy: null };
  await open();
  await waitFor(() =>
    expect(
      screen
        .getAllByRole("status")
        .some((one) => one.className.includes("min-w-[min(100%,12rem)]")),
    ).toBe(true),
  );
});

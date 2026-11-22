// @vitest-environment happy-dom

import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { InterfaceBody, PageWidget } from "@volvel/manifest";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { InterfaceBuilder } from "./screens/builder/AppBuilder.tsx";
import { show } from "./testing.tsx";

const root = "/tenants/t1/workspaces/w1";
const api = `/api/v1${root}`;
let stored: InterfaceBody;

const text = (id: string, title: string, at: PageWidget["at"], rest: Partial<PageWidget> = {}) =>
  ({ id, type: "core/text", title, at, config: { text: title }, ...rest }) as PageWidget;

/** Orders (a Section of two), Views (Tabs: By status holds one), and a loose text. */
const body = (): InterfaceBody => ({
  title: "Sales",
  pages: [
    {
      id: "money",
      title: "Money",
      widgets: [
        {
          id: "orders",
          type: "core/section",
          title: "Orders",
          at: { x: 0, y: 0, w: 12, h: 8 },
        },
        text("first", "First", { x: 0, y: 0, w: 6, h: 3 }, { in: { widget: "orders" } }),
        text("second", "Second", { x: 6, y: 0, w: 6, h: 3 }, { in: { widget: "orders" } }),
        {
          id: "views",
          type: "core/tabs",
          title: "Views",
          at: { x: 0, y: 8, w: 12, h: 6 },
          config: {
            tabs: [
              { id: "status", title: "By status" },
              { id: "reason", title: "By reason" },
            ],
          },
        },
        text(
          "chart",
          "Status notes",
          { x: 0, y: 0, w: 6, h: 3 },
          { in: { widget: "views", tab: "status" } },
        ),
        text("loose", "Loose note", { x: 0, y: 14, w: 6, h: 2 }),
      ],
    },
  ],
});

beforeEach(() => {
  history.replaceState(null, "", "/");
  stored = body();
  const routes: Record<string, (sent: unknown) => [number, unknown]> = {
    [`GET ${api}/drafts/screens/sales`]: () => [200, { revision: 1, body: stored }],
    [`PUT ${api}/drafts/screens/sales`]: (saved) => {
      stored = (saved as { body: InterfaceBody }).body;
      return [200, { revision: 2, body: stored }];
    },
    [`GET ${api}/interfaces`]: () => [
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
    ],
    [`GET ${api}/drafts`]: () => [200, { items: [{ path: "screens/sales" }] }],
    [`GET ${api}/apps`]: () => [200, { items: [] }],
    [`GET ${api}/queries/schema`]: () => [200, { tables: [], functions: [], maySql: false }],
    [`GET ${api}/queries`]: () => [200, { items: [] }],
    [`GET ${api}/widget-data`]: () => [200, { inputs: {} }],
  };
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const sent = init.body ? JSON.parse(init.body as string) : undefined;
    const path = address.split("?")[0] as string;
    const handler = routes[`${method} ${address}`] ?? routes[`${method} ${path}`];
    const [status, reply] = handler?.(sent) ?? [404, { detail: "No mock" }];
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
const outline = () =>
  within(screen.getByRole("heading", { name: "On this page" }).closest("section") as HTMLElement);
const widgetsSaved = (check: (widgets: PageWidget[]) => boolean) =>
  waitFor(() => expect(check(stored.pages[0]?.widgets ?? [])).toBe(true), { timeout: 4000 });
const choose = (name: string) => fireEvent.click(outline().getByRole("button", { name }));
const menu = async (name: string, item: string | RegExp) => {
  fireEvent.click(await screen.findByRole("button", { name: `More about ${name}` }));
  fireEvent.click(await screen.findByRole("menuitem", { name: item }));
};

test("the outline lists what a container holds under it, by tab", async () => {
  await open();
  const list = outline();
  const names = list.getAllByRole("button").map((one) => one.textContent);
  expect(names).toEqual(["Orders", "First", "Second", "Views", "Status notes", "Loose note"]);
  // A Tabs' tabs are headings over what is in them, and a child is indented.
  expect(list.getByText("By status")).toBeTruthy();
  expect(list.getByRole("button", { name: "First" }).className).toContain("pl-5");
  expect(list.getByRole("button", { name: "Orders" }).className).toContain("pl-2");
  // Choosing a child chooses it.
  choose("Status notes");
  expect(await screen.findByRole("heading", { name: "Status notes", level: 2 })).toBeTruthy();
});

test("a container's header says what it holds", async () => {
  await open();
  choose("Orders");
  expect(await screen.findByText("Section · holds 2 widgets")).toBeTruthy();
});

test("duplicating a Section takes what it holds, and is one step to Undo", async () => {
  await open();
  choose("Orders");
  await menu("Orders", /^Duplicate/);
  await widgetsSaved((widgets) => widgets.length === 9);
  const widgets = stored.pages[0]?.widgets ?? [];
  const copy = widgets.find((one) => one.title === "Orders copy") as PageWidget;
  expect(widgets.filter((one) => one.in?.widget === copy.id)).toHaveLength(2);
  expect(widgets.filter((one) => one.in?.widget === "orders")).toHaveLength(2);
  expect(new Set(widgets.map((one) => one.id)).size).toBe(widgets.length);
  // The copy is chosen, and shown in the outline with its widgets.
  expect(outline().getByRole("button", { name: "Orders copy" })).toBeTruthy();
  fireEvent.click(await screen.findByRole("button", { name: /^Undo/ }));
  await widgetsSaved((now) => now.length === 6);
});

test("removing a Section takes what it holds, says so, and Undo brings it back", async () => {
  await open();
  choose("Orders");
  await menu("Orders", "Remove");
  await widgetsSaved((widgets) => widgets.length === 3);
  expect((stored.pages[0]?.widgets ?? []).map((one) => one.id)).toEqual([
    "views",
    "chart",
    "loose",
  ]);
  expect(await screen.findByText("Removed “Orders” and the 2 widgets in it.")).toBeTruthy();
  fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
  await widgetsSaved((widgets) => widgets.length === 6);
  expect(
    (stored.pages[0]?.widgets ?? []).filter((one) => one.in?.widget === "orders"),
  ).toHaveLength(2);
});

test("⋯ › Move to puts a widget in a tab from the keyboard, and it stays chosen", async () => {
  await open();
  choose("Loose note");
  await menu("Loose note", /Move to/);
  const dialog = await screen.findByRole("dialog", { name: "Move Loose note to" });
  const places = within(dialog)
    .getAllByRole("button")
    .map((one) => one.textContent)
    .filter(Boolean);
  expect(places).toEqual(["Orders", "Views › By status", "Views › By reason"]);
  fireEvent.click(within(dialog).getByRole("button", { name: "Views › By reason" }));
  await widgetsSaved((widgets) =>
    widgets.some(
      (one) => one.id === "loose" && one.in?.widget === "views" && one.in.tab === "reason",
    ),
  );
  expect(await screen.findByRole("heading", { name: "Loose note", level: 2 })).toBeTruthy();
  // It is now listed under its tab; and ⋯ › Move to offers the page, not that tab.
  await menu("Loose note", /Move to/);
  const again = within(await screen.findByRole("dialog", { name: "Move Loose note to" }));
  expect(again.getByRole("button", { name: "The page" })).toBeTruthy();
  expect(again.queryByRole("button", { name: "Views › By reason" })).toBeNull();
});

test("a container has no Move to: it goes only on the page", async () => {
  await open();
  choose("Views");
  fireEvent.click(await screen.findByRole("button", { name: "More about Views" }));
  await screen.findByRole("menuitem", { name: /^Duplicate/ });
  expect(screen.queryByRole("menuitem", { name: /Move to/ })).toBeNull();
});

test("Add to page adds into the chosen Section, and says so", async () => {
  await open();
  choose("Orders");
  fireEvent.click(screen.getByRole("button", { name: "Add to page" }));
  const dialog = await screen.findByRole("dialog", { name: "Add to page" });
  expect(within(dialog).getByText("Orders", { selector: "strong" })).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: /^Text/ }));
  await widgetsSaved((widgets) => widgets.length === 7);
  const added = (stored.pages[0]?.widgets ?? []).find(
    (one) =>
      one.type === "core/text" &&
      one.id !== "first" &&
      one.id !== "second" &&
      one.in?.widget === "orders",
  ) as PageWidget;
  expect(added.at.y).toBe(3);
  expect(added.at.x).toBe(0);

  // With a loose widget chosen, it goes at the end of the page, as before.
  choose("Loose note");
  fireEvent.click(screen.getByRole("button", { name: "Add to page" }));
  const again = await screen.findByRole("dialog", { name: "Add to page" });
  expect(within(again).queryByText(/Adds to/)).toBeNull();
});

test("Add to page into Tabs goes to its first tab, from a child too", async () => {
  await open();
  choose("Status notes");
  fireEvent.click(screen.getByRole("button", { name: "Add to page" }));
  const dialog = await screen.findByRole("dialog", { name: "Add to page" });
  expect(within(dialog).getByText("Views › By status", { selector: "strong" })).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: /^Text/ }));
  await widgetsSaved((widgets) => widgets.length === 7);
  const widgets = stored.pages[0]?.widgets ?? [];
  expect(
    widgets.filter((one) => one.in?.widget === "views" && one.in.tab === "status"),
  ).toHaveLength(2);
});

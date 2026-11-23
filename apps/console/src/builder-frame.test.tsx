// @vitest-environment happy-dom

import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { InterfaceBody, PageWidget } from "@volvel/manifest";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { InterfaceBuilder } from "./screens/builder/AppBuilder.tsx";
import { draftChangeCount } from "./screens/builder/changes.ts";
import { reordered, stepped } from "./screens/builder/outline.ts";
import { show } from "./testing.tsx";

// Phase 28, A3: the builder's frame (board 1): one header row, the pane's rows, the canvas frame.

const root = "/tenants/t1/workspaces/w1";
const api = `/api/v1${root}`;
let stored: InterfaceBody;
let deployed: InterfaceBody | undefined;
let url: string | undefined;
/** What the control plane has kept of earlier saves, newest first. */
let kept: {
  id: string;
  revision: number;
  deleted: boolean;
  reason: string;
  savedById: string | null;
  savedAt: string;
  body: InterfaceBody;
}[] = [];

const text = (id: string, title: string, at: PageWidget["at"]) =>
  ({ id, type: "core/text", title, at, config: { text: title } }) as PageWidget;
const three = () => [
  text("a", "Alpha", { x: 0, y: 0, w: 12, h: 3 }),
  text("b", "Bravo", { x: 0, y: 3, w: 12, h: 3 }),
  text("c", "Charlie", { x: 0, y: 6, w: 12, h: 3 }),
];
const body = (): InterfaceBody => ({
  title: "Sales",
  pages: [
    { id: "money", title: "Money", widgets: three() },
    {
      id: "detail",
      title: "Invoice detail",
      kind: "sheet",
      record: { table: "invoices" },
      widgets: [],
    },
    { id: "new", title: "New invoice", kind: "modal", widgets: [] },
  ],
});

beforeEach(() => {
  history.replaceState(null, "", "/");
  stored = body();
  // Published: the same, but without Charlie.
  deployed = body();
  (deployed.pages[0] as { widgets: PageWidget[] }).widgets = three().slice(0, 2);
  url = undefined;
  kept = [];
  const routes: Record<string, (sent: unknown) => [number, unknown]> = {
    [`GET ${api}/drafts/screens/sales`]: () => [200, { revision: 1, body: stored }],
    [`PUT ${api}/drafts/screens/sales`]: (saved) => {
      stored = (saved as { body: InterfaceBody }).body;
      return [200, { revision: 2, body: stored }];
    },
    [`GET ${api}/interfaces/screens/sales`]: () =>
      deployed ? [200, { body: deployed }] : [404, { detail: "Not deployed" }],
    [`GET ${api}/interfaces`]: () => [
      200,
      {
        items: [
          { path: "screens/sales", title: "Sales", deployed: true, draft: true, app: "sales" },
        ],
      },
    ],
    [`GET ${api}/drafts`]: () => [200, { items: [{ path: "screens/sales" }] }],
    [`GET ${api}/apps`]: () => [200, { items: url ? [{ path: "sales", url }] : [] }],
    [`GET /api/v1/tenants/t1/groups`]: () => [
      200,
      { items: [{ name: "Billing" }, { name: "Managers" }] },
    ],
    [`GET ${api}/group-keys`]: () => [
      200,
      {
        items: [
          { key: "billing", name: "Billing", kind: "member" },
          { key: "managers", name: "Managers", kind: "member" },
        ],
      },
    ],
    [`GET ${root}`.replace("/tenants", "/api/v1/tenants")]: () => [200, { name: "Sandbox" }],
    [`GET ${api}/draft-history/screens/sales`]: () => [200, { items: kept }],
    [`GET ${api}/flows`]: () => [200, { items: [] }],
    [`GET ${api}/scripts`]: () => [200, { items: [] }],
    [`GET ${api}/queries/schema`]: () => [200, { tables: [], functions: [], maySql: false }],
    [`GET ${api}/queries`]: () => [200, { items: [] }],
    [`GET ${api}/widget-data`]: () => [200, { inputs: {} }],
    [`GET ${api}/changes/preview`]: () => [200, { possible: true, refusal: null, summary: null }],
    [`GET ${api}/resources`]: () => [200, { items: [] }],
    [`GET /api/v1/tenants/t1/bindings`]: () => [200, { items: [] }],
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
const header = () => document.querySelector("header") as HTMLElement;
const outline = () =>
  within(screen.getByRole("heading", { name: "On this page" }).closest("section") as HTMLElement);
const order = () =>
  stored.pages[0]?.widgets
    .slice()
    .sort((x, y) => x.at.y - y.at.y)
    .map((w) => w.id);
const saved = (check: () => boolean) =>
  waitFor(() => expect(check()).toBe(true), { timeout: 4000 });

test("the app is named in the header and renamed in place, with no field for it", async () => {
  await open();
  expect(screen.queryByLabelText("Name of the app")).toBeNull();
  expect(screen.getByRole("heading", { name: "Sales", level: 1 })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Rename the app" }));
  const field = screen.getByLabelText("Name of the app") as HTMLInputElement;
  expect(field.maxLength).toBe(100); // BLD-06: what the interface takes
  fireEvent.change(field, { target: { value: "Takings" } });
  fireEvent.keyDown(field, { key: "Enter" });
  expect(await screen.findByRole("heading", { name: "Takings", level: 1 })).toBeTruthy();
  await saved(() => stored.title === "Takings");
  // Escape keeps the old name.
  fireEvent.click(screen.getByRole("button", { name: "Rename the app" }));
  const again = screen.getByLabelText("Name of the app");
  fireEvent.change(again, { target: { value: "Nope" } });
  fireEvent.keyDown(again, { key: "Escape" });
  expect(screen.getByRole("heading", { name: "Takings", level: 1 })).toBeTruthy();
});

test("the header counts what the draft changes against what is published, and the pill opens the review", async () => {
  await open();
  // Charlie is the one change.
  const pill = await screen.findByRole("button", { name: "1 draft change" });
  fireEvent.click(pill);
  expect(await screen.findByText("Ready to publish")).toBeTruthy();
});

test("the screen sizes are in the header and set the width the page is drawn at", async () => {
  await open();
  const sizes = within(header()).getByRole("radiogroup", { name: "Screen size" });
  expect(
    within(sizes)
      .getAllByRole("radio")
      .map((one) => one.getAttribute("aria-label")),
  ).toEqual(["Desktop", "Tablet", "Phone"]);
  // Not over the canvas any more, and the note about buttons is not over it either.
  expect(document.querySelector("[data-canvas] [role=radiogroup]")).toBeNull();
  expect(screen.queryByText(/Buttons and row actions don't run/)).toBeNull();
  fireEvent.click(within(sizes).getByRole("radio", { name: "Phone" }));
  expect(document.querySelector("[data-preview]")?.getAttribute("data-preview")).toBe("phone");
  expect(document.querySelector("[data-column-guides]")).toBeTruthy();
});

test("View as lists Me and the groups, and shows the choice", async () => {
  await open();
  const trigger = screen.getByRole("button", { name: "View as Me" });
  fireEvent.click(trigger);
  expect(await screen.findByRole("menuitem", { name: "Me" })).toBeTruthy();
  fireEvent.click(await screen.findByRole("menuitem", { name: "Billing" }));
  expect(await screen.findByRole("button", { name: "View as Billing" })).toBeTruthy();
});

test("Publish is a split button: the main part opens the review, the arrow holds more ways", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "More ways to publish" }));
  const menu = await screen.findByRole("menu", { name: "Publish" });
  const items = within(menu).getAllByRole("menuitem");
  expect(items.map((one) => one.textContent)).toEqual([
    "Publish",
    "Open the published app",
    "Restore an earlier draft",
  ]);
  expect(items[2]?.getAttribute("aria-disabled")).toBeNull();
  fireEvent.click(items[0] as HTMLElement);
  expect(await screen.findByText("Ready to publish")).toBeTruthy();
});

test("Preview opens the draft's own preview in a new tab, once what is unsaved is saved", async () => {
  const tab = { location: { href: "" }, close: vi.fn() };
  const opened = vi.spyOn(window, "open").mockReturnValue(tab as never);
  await open();
  const button = screen.getByRole("button", { name: "Preview" }) as HTMLButtonElement;
  expect(button.disabled).toBe(false);
  fireEvent.click(button);
  await waitFor(() => expect(tab.location.href).toMatch(/\/screens\/.+\/preview$/));
  expect(opened).toHaveBeenCalledWith("", "_blank");
  opened.mockRestore();
});

test("each page is one row with its kind at the right, and + in the heading adds a page", async () => {
  await open();
  const pages = within(
    screen.getByRole("heading", { name: "Pages" }).closest("section") as HTMLElement,
  );
  expect(pages.getByRole("button", { name: /Money\s*Page$/ })).toBeTruthy();
  expect(pages.getByRole("button", { name: /Invoice detail\s*Side sheet/ })).toBeTruthy();
  expect(pages.getByRole("button", { name: /New invoice\s*Modal/ })).toBeTruthy();
  expect(pages.getByRole("button", { name: "Add a page" })).toBeTruthy();
  // The arrows are on every row (shown when it is pointed at or focused), not only the chosen one.
  expect(pages.getByRole("button", { name: "Move Money down" })).toBeTruthy();
  expect(pages.getByRole("button", { name: "Move Invoice detail up" })).toBeTruthy();
  fireEvent.click(pages.getByRole("button", { name: "Add a page" }));
  expect(await screen.findByRole("dialog")).toBeTruthy();
});

test("the outline's rows have the widget's icon and a handle, and Alt+↓ and Alt+↑ reorder from the keyboard", async () => {
  await open();
  expect(
    outline()
      .getAllByRole("button")
      .map((one) => one.textContent)
      .filter(Boolean),
  ).toEqual(["Alpha", "Bravo", "Charlie"]);
  const rows = document.querySelectorAll("[data-outline-row]");
  expect(rows.length).toBe(3);
  for (const row of rows) expect(row.querySelectorAll("svg").length).toBe(2);
  expect(rows[0]?.querySelector("[data-handle]")).toBeTruthy();

  fireEvent.keyDown(outline().getByRole("button", { name: "Alpha" }), {
    key: "ArrowDown",
    altKey: true,
  });
  await waitFor(() => expect(order()).toEqual("b,a,c".split(",")), { timeout: 4000 });
  expect(
    outline()
      .getAllByRole("button")
      .map((one) => one.textContent)
      .filter(Boolean),
  ).toEqual(["Bravo", "Alpha", "Charlie"]);
  fireEvent.keyDown(outline().getByRole("button", { name: "Charlie" }), {
    key: "ArrowUp",
    altKey: true,
  });
  await waitFor(() => expect(order()).toEqual("b,c,a".split(",")), { timeout: 4000 });
});

test("dragging a row's handle in the outline puts it where it is let go, and the others make room", async () => {
  await open();
  const row = (name: string) =>
    outline().getByRole("button", { name }).closest("[data-outline-row]") as HTMLElement;
  const item = (name: string) => row(name).closest("li") as HTMLElement;
  // There is no layout here: the rows are given places, 20 high.
  for (const [at, name] of ["Alpha", "Bravo", "Charlie"].entries()) {
    item(name).getBoundingClientRect = () =>
      ({ top: 100 + at * 20, height: 20, bottom: 120 + at * 20 }) as DOMRect;
  }
  const grip = row("Charlie").querySelector("[data-handle]") as HTMLElement;
  fireEvent.pointerDown(grip, { button: 0, pointerId: 1, clientY: 150 });
  // Up over Alpha's upper half: it is lifted, follows the pointer, and Alpha and Bravo slide down.
  fireEvent.pointerMove(grip, { pointerId: 1, clientY: 105 });
  expect(item("Charlie").hasAttribute("data-dragging")).toBe(true);
  expect(item("Charlie").style.transform).toBe("translateY(-40px)");
  expect(item("Alpha").style.transform).toBe("translateY(20px)");
  expect(item("Alpha").style.transition).not.toBe("none");
  fireEvent.pointerUp(grip, { pointerId: 1, clientY: 105 });
  await waitFor(() => expect(order()).toEqual("c,a,b".split(",")), { timeout: 4000 });
});

test("the A key opens Add to page when focus is not in a field, and not in one", async () => {
  await open();
  const add = screen.getAllByRole("button", { name: "Add to page" })[0] as HTMLElement;
  expect(add.getAttribute("aria-keyshortcuts")).toBe("A");
  expect(add.textContent).toContain("A");
  fireEvent.click(screen.getByRole("button", { name: "Rename the app" }));
  fireEvent.keyDown(screen.getByLabelText("Name of the app"), { key: "a" });
  expect(screen.queryByRole("dialog", { name: "Add to page" })).toBeNull();
  fireEvent.keyDown(document.body, { key: "a" });
  expect(await screen.findByRole("dialog", { name: "Add to page" })).toBeTruthy();
});

// ----- The pure parts -----

test("reordering puts a widget before or after another on the same grid, and only there", () => {
  const widgets = three();
  expect(
    reordered(widgets, "c", "a", "before")
      ?.slice()
      .sort((x, y) => x.at.y - y.at.y)
      .map((w) => w.id),
  ).toEqual(["c", "a", "b"]);
  expect(stepped(widgets, "a", -1)).toBeUndefined();
  expect(stepped(widgets, "c", 1)).toBeUndefined();
  const inside = { ...text("d", "Inner", { x: 0, y: 0, w: 6, h: 2 }), in: { widget: "a" } };
  expect(reordered([...widgets, inside], "d", "b", "before")).toBeUndefined();
});

test("the draft's changes are counted against what is deployed", () => {
  const draft = body();
  expect(draftChangeCount(body(), draft)).toBe(0);
  const first = draft.pages[0] as { widgets: PageWidget[] };
  first.widgets = first.widgets.slice(1);
  draft.title = "Takings";
  expect(draftChangeCount(body(), draft)).toBe(2);
  // Nothing deployed yet: every page and widget is new.
  expect(draftChangeCount(undefined, body())).toBe(3 + 3);
});

// ----- Phone, the publish check, View as and draft history (phase 28, B8) -----

const aside = (extra: Partial<PageWidget> = {}) =>
  ({
    id: "by",
    type: "core/text",
    title: "By clinic",
    at: { x: 0, y: 9, w: 12, h: 3 },
    config: { text: "By clinic" },
    ...extra,
  }) as PageWidget;
const withAside = (extra: Partial<PageWidget> = {}) => {
  (stored.pages[0] as { widgets: PageWidget[] }).widgets.push(aside(extra));
};

test("the phone preview is drawn in a device, says what was changed by hand, and keeps a hidden widget as a place-holder", async () => {
  withAside({ layout: { narrow: "hide" } });
  (stored.pages[0] as { widgets: PageWidget[] }).widgets[0] = {
    ...text("a", "Alpha", { x: 0, y: 0, w: 12, h: 3 }),
    layout: { phone: { at: { x: 0, y: 5, w: 12, h: 3 } } },
  };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 390,
  } as DOMRect);
  await open();
  expect(document.querySelector("[data-device-banner]")).toBeNull();
  fireEvent.click(
    within(within(header()).getByRole("radiogroup", { name: "Screen size" })).getByRole("radio", {
      name: "Phone",
    }),
  );
  expect(document.querySelector("[data-phone-frame]")).toBeTruthy();
  const banner = document.querySelector("[data-device-banner]") as HTMLElement;
  expect(banner.textContent).toContain("Phone layout is made from the desktop one.");
  // The one placed by hand, and the one told to hide on narrow screens.
  expect(banner.textContent).toContain("2 widgets changed by hand");
  expect(await screen.findByText("By clinic is hidden on phones")).toBeTruthy();
});

test("Ready to publish: checks, what changes, Try as, and a blocking problem", async () => {
  withAside({
    layout: { narrow: "hide" },
    rules: { seenBy: { groups: ["billing"] } },
  });
  await open();
  fireEvent.click(screen.getAllByRole("button", { name: "Publish" })[0] as HTMLElement);
  expect(await screen.findByRole("heading", { name: "Ready to publish" })).toBeTruthy();
  expect(
    screen.getByText("Deploys to Sandbox. The live app keeps working until then."),
  ).toBeTruthy();
  expect(await screen.findByText("Phone layout hides 1 widget")).toBeTruthy();
  expect(screen.getByText("By clinic, on Money")).toBeTruthy();
  expect(screen.getByText("2 changes")).toBeTruthy();
  expect(screen.getByText("Added text Charlie")).toBeTruthy();
  const publish = screen.getByRole("button", { name: "Publish 2 changes" }) as HTMLButtonElement;
  expect(publish.disabled).toBe(false);
  // The group the rules touch most.
  fireEvent.click(screen.getByRole("button", { name: "Try as Billing first" }));
  expect(await screen.findByRole("button", { name: "View as Billing" })).toBeTruthy();
});

test("a check that the control plane refuses says so, with a way to ask again (BLD-03)", async () => {
  withAside({});
  const before = globalThis.fetch;
  let refused = true;
  vi.stubGlobal("fetch", async (address: string, init?: RequestInit) =>
    refused && address.includes("/changes/preview")
      ? new Response(
          JSON.stringify({ detail: "This needs the deployment:read permission.", status: 403 }),
          { status: 403 },
        )
      : before(address, init),
  );
  await open();
  fireEvent.click(screen.getAllByRole("button", { name: "Publish" })[0] as HTMLElement);
  expect(await screen.findByText(/This needs the deployment:read permission/)).toBeTruthy();
  expect(screen.queryByText("Checking what publishing does…")).toBeNull();
  refused = false;
  fireEvent.click(screen.getByRole("button", { name: "Check again" }));
  expect(await screen.findByRole("heading", { name: "Ready to publish" })).toBeTruthy();
});

test("tables and groups that could not be read are said, not taken for missing (BLD-03)", async () => {
  withAside({ rules: { seenBy: { groups: ["vanished"] } } });
  (stored.pages[0] as { widgets: PageWidget[] }).widgets.push({
    id: "t",
    type: "core/table",
    title: "Ghosts",
    at: { x: 0, y: 12, w: 12, h: 4 },
    data: { rows: { source: { visual: { table: "ghost" } } } },
    config: { columns: [] },
  } as PageWidget);
  const before = globalThis.fetch;
  vi.stubGlobal("fetch", async (address: string, init?: RequestInit) =>
    address.includes("/queries/schema") || address.includes("/group-keys")
      ? new Response(JSON.stringify({ detail: "The service is down.", status: 500 }), {
          status: 500,
        })
      : before(address, init),
  );
  await open();
  fireEvent.click(screen.getAllByRole("button", { name: "Publish" })[0] as HTMLElement);
  expect(await screen.findByText(/Could not check the tables and queries/)).toBeTruthy();
  expect(screen.getByText(/Could not check .*the groups/)).toBeTruthy();
  expect(screen.queryByText("1 data source not found")).toBeNull();
  expect(screen.queryByText(/no longer exists/)).toBeNull();
});

test("a table that is not there, or a group that is gone, is said before publishing", async () => {
  withAside({ rules: { seenBy: { groups: ["vanished"] } } });
  (stored.pages[0] as { widgets: PageWidget[] }).widgets.push({
    id: "t",
    type: "core/table",
    title: "Ghosts",
    at: { x: 0, y: 12, w: 12, h: 4 },
    data: { rows: { source: { visual: { table: "ghost" } } } },
    config: { columns: [] },
  } as PageWidget);
  await open();
  fireEvent.click(screen.getAllByRole("button", { name: "Publish" })[0] as HTMLElement);
  expect(await screen.findByText("1 data source not found")).toBeTruthy();
  expect(screen.getByText(/1 group named in the rules no longer exists/)).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: /^Publish \d+ changes?$/ }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

test("View as a group draws a widget it may not see faded, says rows are the builder's, and Me restores", async () => {
  withAside({ rules: { seenBy: { groups: ["managers"] } } });
  await open();
  fireEvent.click(screen.getByRole("button", { name: "View as Me" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Billing" }));
  expect(await screen.findByText("Hidden for Billing")).toBeTruthy();
  expect(
    screen.getByText(/Rows are yours: View as shows what Billing sees of the page/),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "View as Billing" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Me" }));
  await waitFor(() => expect(screen.queryByText("Hidden for Billing")).toBeNull());
  expect(document.querySelector("[data-view-as-note]")).toBeNull();
});

test("an earlier draft is listed and restored as one step", async () => {
  const earlier = body();
  (earlier.pages[0] as { widgets: PageWidget[] }).widgets = three().slice(0, 1);
  kept = [
    {
      id: "k1",
      revision: 1,
      deleted: false,
      reason: "replaced",
      savedById: null,
      savedAt: new Date(Date.now() - 3_600_000).toISOString(),
      body: earlier,
    },
  ];
  await open();
  fireEvent.click(screen.getByRole("button", { name: "More ways to publish" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Restore an earlier draft" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Restore an earlier draft" }));
  expect(
    await dialog.findByText("Removed text \u201cBravo\u201d on \u201cMoney\u201d"),
  ).toBeTruthy();
  fireEvent.click(dialog.getByRole("button", { name: "Restore" }));
  await saved(() => stored.pages[0]?.widgets.length === 1);
  expect(order()).toEqual(["a"]);
});

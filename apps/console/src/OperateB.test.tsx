// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { EventPage, TriggersOf } from "./screens/ObjectPages.tsx";
import { EventsWorkbench, TriggerState } from "./screens/Operate.tsx";
import { show } from "./testing.tsx";

// Phase 29, lane opsb: what the operate screens say about holds, listeners and rejecting.

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
  history.replaceState(null, "", "/");
});

const schedule = (extra: object) => ({
  path: "intake/nightly",
  node: "",
  type: "schedule",
  script: "intake/route",
  targetKind: "script",
  event: null,
  enabled: true,
  cron: "0 2 * * *",
  timezone: "UTC",
  nextFireAt: new Date(Date.now() + 2 * 3_600_000).toISOString(),
  paused: null,
  pausedBy: null,
  ...extra,
});

test("a script's triggers say that the workspace or the instance is paused (OPS-21)", async () => {
  routes[`${root}/triggers?target=intake%2Froute`] = () => [
    200,
    {
      items: [
        schedule({ path: "intake/a", pausedBy: "workspace" }),
        schedule({ path: "intake/b", pausedBy: "instance" }),
        schedule({ path: "intake/c" }),
      ],
    },
  ];
  show(<TriggersOf root={root} link={link} kind="script" path="intake/route" />);
  const grid = await screen.findByRole("grid", { name: "Triggers of intake/route" });
  expect(within(grid).getByText("Workspace paused")).toBeTruthy();
  expect(within(grid).getByText("Instance paused")).toBeTruthy();
  // The one nothing holds still says when it is next.
  expect(within(grid).getByText(/^Next /)).toBeTruthy();
});

test("a trigger paused on its own, in a workspace that is paused, says so once (OPS-21)", () => {
  show(
    <TriggerState
      row={{
        draft: null,
        enabled: true,
        nextFireAt: null,
        paused: { at: "2026-11-14T10:00:00.000Z", by: null, reason: "" },
        pausedBy: "workspace",
      }}
    />,
  );
  expect(screen.getByText("Workspace paused")).toBeTruthy();
});

test("a schedule that is held is not offered a run, and one that is off is (D31)", async () => {
  const menuOf = async (row: object) => {
    routes[`${root}/triggers?target=intake%2Froute`] = () => [200, { items: [schedule(row)] }];
    show(<TriggersOf root={root} link={link} kind="script" path="intake/route" />);
    await screen.findByRole("grid", { name: "Triggers of intake/route" });
    fireEvent.click(screen.getByRole("button", { name: /^Actions for/ }));
    const words = (await screen.findAllByRole("menuitem")).map((one) => one.textContent);
    cleanup();
    return words;
  };
  expect(await menuOf({ enabled: false })).toContain("Run it now");
  expect(await menuOf({ pausedBy: "workspace" })).not.toContain("Run it now");
  expect(
    await menuOf({
      paused: { at: "2026-11-14T10:00:00.000Z", by: null, reason: "" },
      pausedBy: "trigger",
    }),
  ).not.toContain("Run it now");
});

test("the event's page opens the log on that event by name (OPS-24)", async () => {
  routes[`${root}/resources/order/placed`] = () => [
    200,
    {
      kind: "event",
      path: "order/placed",
      ownership: "ui",
      version: 2,
      body: { description: "x" },
    },
  ];
  routes[`${root}/references`] = () => [200, { items: [] }];
  show(<EventPage root={root} link={link} path="order/placed" />);
  fireEvent.click(await screen.findByRole("tab", { name: "Recent" }));
  const open = await screen.findByRole("link", { name: "See it in the event log" });
  expect(open.getAttribute("href")).toBe(`${link}/events?name=order%2Fplaced`);
});

const event = (extra: object) => ({
  id: "e1",
  name: "orders/placed",
  payload: {},
  source: { type: "api", id: null },
  occurredAt: "2026-11-13T00:00:00Z",
  publishedBy: null,
  started: [],
  listeners: 0,
  pausedListeners: 0,
  ...extra,
});

test("an event whose listeners are all paused does not say that nothing listens (OPS-23)", async () => {
  routes[`${root}/events`] = () => [
    200,
    { items: [event({ pausedListeners: 2 })], nextCursor: null },
  ];
  history.replaceState(null, "", "/?item=e1");
  show(<EventsWorkbench root={root} link={link} />);
  expect((await screen.findAllByText("Listeners are paused")).length).toBeGreaterThan(0);
  expect(screen.getByText("2 triggers, all paused")).toBeTruthy();
  expect(screen.getByText(/is paused, so none of them started anything/)).toBeTruthy();
  expect(screen.queryByText("Nothing listens")).toBeNull();
});

test("what an event started shows the state the server gives, as a flow waiting for a person (OPS-24)", async () => {
  routes[`${root}/events`] = () => [
    200,
    {
      items: [
        event({
          listeners: 1,
          started: [
            {
              kind: "flow",
              id: "f1",
              target: "orders/gate",
              status: "running",
              state: "waiting_approval",
            },
          ],
        }),
      ],
      nextCursor: null,
    },
  ];
  history.replaceState(null, "", "/?item=e1");
  show(<EventsWorkbench root={root} link={link} />);
  expect(await screen.findByText("Waiting for approval")).toBeTruthy();
});

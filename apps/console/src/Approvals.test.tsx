// @vitest-environment happy-dom
import { cleanup, configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { FlowRunView } from "./screens/Flows.tsx";
import { TriggersOf } from "./screens/ObjectPages.tsx";
import { ApprovalsQueue, TriggerState } from "./screens/Operate.tsx";
import { Overview } from "./screens/Overview.tsx";
import { answer, show } from "./testing.tsx";

configure({ asyncUtilTimeout: 5000 });

const base = "/tenants/t1";
const root = `${base}/workspaces/w1`;
const link = "/t/t1/workspaces/w1";
let routes: Record<string, (body: unknown, url: string) => [number, unknown]>;
let calls: { method: string; url: string; body: unknown }[];

const waiting = (node: string, approvers: string | null) => ({
  flowRunId: "f1",
  workspaceId: "w1",
  flow: "refunds/approve",
  node,
  title: `Refund ${node}`,
  detail: { amount: 40 },
  waitingSince: "2026-11-14T10:00:00.000Z",
  timesOutAt: null,
  approvers: approvers ? { groups: [], roles: [], text: approvers } : null,
});

const summary = (mine: number | null, all = 4) => ({
  drafts: 0,
  failedRuns: { count: 0, since: "2026-11-14T10:00:00.000Z" },
  unboundConnections: 0,
  approvalsWaiting: all,
  approvalsWaitingMine: mine,
  git: null,
  version: 3,
  linked: null,
  scripts: 2,
  flows: 1,
  everRan: true,
});

const trigger = (path: string, extra: object = {}) => ({
  path,
  node: "",
  type: "schedule",
  script: "reminders/send",
  targetKind: "script",
  event: null,
  enabled: true,
  cron: "0 * * * *",
  timezone: "UTC",
  nextFireAt: null,
  lastFiredAt: null,
  url: null,
  paused: null,
  lastRun: null,
  lastRefusal: null,
  ...extra,
});

beforeEach(() => {
  calls = [];
  routes = {
    [`GET ${root}/run-stats`]: () => [
      200,
      { from: "", to: "", succeeded: 0, failed: 0, running: 0, medianSeconds: null, hours: [] },
    ],
    [`GET ${base}`]: () => [200, {}],
    [`GET ${base}/workspaces`]: () => [
      200,
      { items: [{ id: "w1", name: "Clinics", type: "production" }] },
    ],
  };
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url: address, body });
    const path = address.replace("/api/v1", "").split("?")[0] as string;
    const handler = routes[`${method} ${path}`];
    const [status, value] = handler
      ? handler(body, address)
      : [404, { status: 404, detail: `No mock for ${method} ${path}` }];
    return new Response(JSON.stringify(value), { status });
  });
  history.replaceState(null, "", `${link}`);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

const workspace = { id: "w1", name: "Clinics", type: "production" as const, triggersPaused: false };

test("the overview words its count from what the viewer may decide, and Decide opens that queue", async () => {
  routes[`GET ${root}/summary`] = () => [200, summary(2)];
  routes[`GET ${root}/triggers`] = () => [200, { items: [] }];
  show(<Overview root={root} link={link} workspace={workspace} />);
  expect(await screen.findByText("2 runs are waiting for you")).toBeTruthy();
  expect(screen.getByText(/2 more wait for someone else/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Decide" }));
  expect(location.pathname).toBe(`${link}/approvals`);
});

test("approvals the viewer may not decide are said so, with no Decide button", async () => {
  routes[`GET ${root}/summary`] = () => [200, summary(0)];
  routes[`GET ${root}/triggers`] = () => [200, { items: [] }];
  show(<Overview root={root} link={link} workspace={workspace} />);
  expect(await screen.findByText("4 runs are waiting for someone else to decide")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Decide" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "See who" }));
  expect(location.search).toBe("?show=others");
});

test("the queue's Waiting for others view lists what the viewer cannot decide, read-only", async () => {
  routes[`GET ${root}/approvals`] = (_body, url) =>
    url.includes("mine=true")
      ? [200, { items: [waiting("a", null)] }]
      : [200, { items: [waiting("a", null), waiting("b", "Finance managers")] }];
  history.replaceState(null, "", `${link}/approvals?show=others`);
  show(<ApprovalsQueue base={base} tenantId="t1" workspaceId="w1" />);
  expect(await screen.findByText("Refund b")).toBeTruthy();
  expect(screen.getByText("Finance managers")).toBeTruthy();
  // What the viewer may decide is in the other view, not here.
  expect(screen.queryByText("Refund a")).toBeNull();
  expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
});

const flowRun = {
  id: "f1",
  flow: "refunds/approve",
  status: "running",
  state: "waiting_approval",
  trigger: { type: "manual" },
  triggerNode: "start",
  startedBy: { type: "member", id: "m1" },
  bundleId: "b1",
  bundleVersion: 4,
  error: null,
  errorSummary: null,
  tags: [],
  retryOf: null,
  retries: [],
  parentFlowRunId: null,
  createdAt: "2026-11-14T10:00:00.000Z",
  finishedAt: null,
  input: {},
  output: null,
  steps: [
    {
      node: "ask",
      item: "",
      status: "waiting",
      state: "waiting_approval",
      outputName: null,
      output: null,
      error: null,
      handled: false,
      runId: null,
      childFlowRunId: null,
      wakeAt: null,
      detail: { title: "Refund ask", detail: { amount: 40 } },
      copiedFrom: null,
      startedAt: "2026-11-14T10:00:00.000Z",
      pickedUpAt: null,
      finishedAt: null,
    },
  ],
};

const flowRunRoutes = (mine: boolean) => {
  routes[`GET ${root}/flow-runs/f1`] = () => [200, flowRun];
  routes[`GET ${root}/flows/refunds/approve`] = () => [
    200,
    { path: "refunds/approve", nodes: {}, edges: [], layout: {}, triggers: [] },
  ];
  routes[`GET ${root}/approvals`] = (_body, url) =>
    url.includes("mine=true")
      ? [200, { items: mine ? [waiting("ask", null)] : [] }]
      : [200, { items: [{ ...waiting("ask", "Finance managers") }] }];
};

test("a waiting step says the viewer may not decide it, and offers no buttons", async () => {
  flowRunRoutes(false);
  show(<FlowRunView root={root} id="f1" link={link} />);
  expect(
    await screen.findByText(/You may not decide this: it waits for Finance managers/),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
});

test("a waiting step the viewer may decide says so and offers Approve and Reject", async () => {
  flowRunRoutes(true);
  show(<FlowRunView root={root} id="f1" link={link} />);
  expect(await screen.findByText("You may decide this.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Reject" })).toBeTruthy();
});

test("a trigger's state reads the same wherever it is drawn", async () => {
  const rows = [
    trigger("a/paused", { paused: { at: "2026-11-14T10:00:00.000Z", by: null, reason: "" } }),
    trigger("a/off", { enabled: false }),
    trigger("a/new", { draft: "new" }),
  ];
  routes[`GET ${root}/summary`] = () => [200, summary(0)];
  routes[`GET ${root}/triggers`] = (_body, url) => [
    200,
    {
      items: url.includes("target=")
        ? rows.map((one) => ({ ...one, script: "reminders/send", targetKind: "script" }))
        : rows,
    },
  ];
  // The shared cell, alone.
  const alone = show(
    <TriggerState row={{ ...rows[0], draft: null } as never} workspacePaused={false} />,
  );
  const word = alone.container.textContent;
  alone.unmount();
  expect(word).toBe("Paused");

  show(<Overview root={root} link={link} workspace={workspace} />);
  const overview = await screen.findByRole("link", { name: /a\/paused/ });
  expect(within(overview).getByText("Paused")).toBeTruthy();
  expect(within(screen.getByRole("link", { name: /a\/off/ })).getByText("Off")).toBeTruthy();
  expect(screen.getByRole("link", { name: /a\/new/ }).textContent).toMatch(/Draft, never deployed/);
  // A row opens its trigger.
  expect(overview.getAttribute("href")).toBe(`${link}/triggers?trigger=a%2Fpaused`);
  cleanup();

  show(<TriggersOf root={root} link={link} kind="script" path="reminders/send" />);
  const row = (await screen.findByText("a/paused")).closest("tr") as HTMLElement;
  expect(within(row).getByText("Paused")).toBeTruthy();
  expect(
    within(screen.getByText("a/new").closest("tr") as HTMLElement).getByText(
      "Draft, never deployed",
    ),
  ).toBeTruthy();
});

test("on a script or flow page, drafting is offered in dev and not in production", async () => {
  routes[`GET ${root}/triggers`] = () => [200, { items: [] }];
  show(<TriggersOf root={root} link={link} kind="script" path="reminders/send" />);
  expect(await screen.findByRole("button", { name: "Add a schedule" })).toBeTruthy();
  cleanup();
  show(<TriggersOf root={root} link={link} kind="script" path="reminders/send" production />);
  expect(await screen.findByText(/reach production by promotion/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Add a schedule" })).toBeNull();
});

test("pausing a trigger from a script's page asks why, and sends the reason", async () => {
  routes[`GET ${root}/triggers`] = () => [200, { items: [trigger("reminders/hourly")] }];
  routes[`PUT ${root}/trigger-pauses/reminders/hourly`] = () => [204, null];
  show(<TriggersOf root={root} link={link} kind="script" path="reminders/send" />);
  fireEvent.click(await screen.findByRole("button", { name: /actions/i }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Pause…" }));
  await answer("Pause", "Supplier is down");
  await waitFor(() =>
    expect(
      calls.find((call) => call.method === "PUT" && call.url.includes("/trigger-pauses/"))?.body,
    ).toEqual({
      reason: "Supplier is down",
    }),
  );
});

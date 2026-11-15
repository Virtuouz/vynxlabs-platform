// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { RunPage } from "./screens/RunPage.tsx";
import { RunsWorkbench } from "./screens/Runs.tsx";
import { answer, show } from "./testing.tsx";

const root = "/tenants/t1/workspaces/w1";
const link = "/t/t1/workspaces/w1";
let routes: Record<string, (body: unknown, url: string) => [number, unknown]>;
let calls: { method: string; url: string; body: unknown }[];

const scriptRun = {
  id: "r1",
  script: "reminders/send",
  status: "failed",
  state: "failed",
  attempt: 2,
  maxAttempts: 2,
  trigger: { type: "schedule", trigger: "reminders/hourly" },
  startedBy: { type: "system", id: null },
  bundleId: "b1",
  bundleVersion: 4,
  error: { message: "The SMS gateway said no." },
  errorSummary: "The SMS gateway said no.",
  tags: ["clinic:north"],
  rerunOf: null,
  reruns: [],
  createdAt: "2026-11-14T10:00:00.000Z",
  startedAt: "2026-11-14T10:00:01.000Z",
  finishedAt: "2026-11-14T10:00:02.000Z",
  input: { clinic: "north" },
  output: null,
  alert: null,
  pool: null,
  waitingFor: null,
  idempotencyKey: "k",
};

const step = (node: string, extra: object = {}) => ({
  node,
  item: "",
  status: "succeeded",
  state: "succeeded",
  outputName: null,
  output: { n: 42 },
  error: null,
  handled: false,
  runId: null,
  childFlowRunId: null,
  wakeAt: null,
  detail: {},
  copiedFrom: null,
  startedAt: "2026-11-14T10:00:00.000Z",
  pickedUpAt: null,
  finishedAt: "2026-11-14T10:00:01.000Z",
  ...extra,
});

const flowRun = {
  id: "f2",
  flow: "orders/reorder",
  status: "failed",
  state: "failed",
  trigger: { type: "retry", of: "f1" },
  triggerNode: "start",
  startedBy: { type: "member", id: "m1" },
  bundleId: "b1",
  bundleVersion: 4,
  error: { message: "The supplier refused." },
  errorSummary: "The supplier refused.",
  tags: [],
  retryOf: "f1",
  retries: [],
  parentFlowRunId: null,
  createdAt: "2026-11-14T10:00:00.000Z",
  finishedAt: "2026-11-14T10:00:05.000Z",
  input: { sku: "A" },
  output: null,
  steps: [
    step("start"),
    step("a", { copiedFrom: { flowRunId: "f1", runId: "r0" } }),
    step("b", { status: "failed", state: "failed", error: { message: "The supplier refused." } }),
  ],
};

beforeEach(() => {
  calls = [];
  routes = {
    [`GET ${root}/runs/r1`]: () => [200, scriptRun],
    [`GET ${root}/runs/r1/logs`]: () => [200, { items: [], done: true }],
    [`GET ${root}/runs/r1/insight`]: () => [
      200,
      {
        attempts: [
          { attempt: 1, startedAt: "2026-11-14T09:59:00.000Z", endedAt: "", failed: true },
          { attempt: 2, startedAt: "2026-11-14T10:00:01.000Z", endedAt: "", failed: true },
        ],
        worker: { id: "w", name: "worker-1", pool: null },
        timeoutSeconds: 30,
        uses: [{ connection: "sms", bound: true }],
        diagnosis: null,
      },
    ],
    [`POST ${root}/runs/r1/rerun`]: () => [201, { ...scriptRun, id: "r2" }],
    [`GET ${root}/runs/f2`]: () => [404, { status: 404, detail: "The run was not found." }],
    [`GET ${root}/flow-runs/f2`]: () => [200, flowRun],
    [`GET ${root}/flows/orders/reorder`]: () => [
      200,
      { path: "orders/reorder", nodes: {}, edges: [], layout: {}, triggers: [] },
    ],
    [`GET ${root}/flow-runs/f2/retry-plan`]: () => [
      200,
      { kept: ["a"], again: ["b", "c"], approvalsKept: [{ node: "gate", decidedBy: "Ana" }] },
    ],
    [`POST ${root}/flow-runs/f2/retry`]: () => [201, { ...flowRun, id: "f3" }],
    [`GET ${root}/runs/nope`]: () => [404, { status: 404, detail: "Not found." }],
    [`GET ${root}/flow-runs/nope`]: () => [404, { status: 404, detail: "Not found." }],
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
  history.replaceState(null, "", `${link}/runs`);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const href = (name: string | RegExp) =>
  screen.getAllByRole("link", { name }).map((one) => one.getAttribute("href"));

test("a script run's page names everything it came from, each as a link", async () => {
  show(<RunPage root={root} link={link} id="r1" />);
  expect(await screen.findByText("The SMS gateway said no.", { selector: "p" })).toBeTruthy();
  expect(href("reminders/send")).toContain(`${link}/scripts/edit/reminders/send`);
  expect(href(/reminders\/hourly/)).toContain(`${link}/triggers?trigger=reminders%2Fhourly`);
  expect(href("version 4")).toContain(`${link}/deployments`);
  expect(href("Runs")).toContain(`${link}/runs`);
  // What the run used comes with its insight, once it has ended.
  expect(await screen.findByText(/#1 failed/)).toBeTruthy();
  expect(href(/sms/)).toContain(`${link}/connections`);
  // A tag opens the list of runs with it.
  expect(screen.getByText("clinic:north").closest("a")?.getAttribute("href")).toBe(
    `${link}/runs?tag=clinic%3Anorth`,
  );
});

test("a run held back by its concurrency key says by what, and shows the key", async () => {
  routes[`GET ${root}/runs/r1`] = () => [
    200,
    {
      ...scriptRun,
      status: "queued",
      state: "queued",
      error: null,
      errorSummary: null,
      finishedAt: null,
      startedAt: null,
      concurrency: { key: "input.customer", value: "c-17", limit: 1 },
      waitingFor: "Waiting for 1 run with the same key (c-17) to finish.",
    },
  ];
  show(<RunPage root={root} link={link} id="r1" />);
  expect(
    await screen.findByText("Waiting for 1 run with the same key (c-17) to finish."),
  ).toBeTruthy();
  expect(screen.getByText("Concurrency key")).toBeTruthy();
  expect(screen.getByText("c-17 · one at a time")).toBeTruthy();
});

test("a script run is run again with the same input, and the page moves to the new run", async () => {
  show(<RunPage root={root} link={link} id="r1" />);
  fireEvent.click(await screen.findByRole("button", { name: /Re-run/ }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "With the same input" }));
  expect(await answer("Run again")).toContain("on version 4, the one it ran");
  await waitFor(() => expect(location.pathname).toBe(`${link}/runs/r2`));
  expect(calls.find((call) => call.method === "POST")).toMatchObject({
    url: `/api/v1${root}/runs/r1/rerun`,
    body: { bundle: "original" },
  });
});

test("a flow run is retried from its failed step after saying what runs again and what is kept", async () => {
  show(<RunPage root={root} link={link} id="f2" />);
  expect(await screen.findByRole("link", { name: "Retry of a run" })).toBeTruthy();
  expect(href("Retry of a run")).toContain(`${link}/runs/f1`);
  fireEvent.click(await screen.findByRole("button", { name: /Re-run/ }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Retry from the failed step…" }));
  const said = await answer("Retry");
  expect(said).toContain("Runs again: b, c");
  expect(said).toContain("Kept as it was: a");
  expect(said).toContain("gate (approved by Ana)");
  await waitFor(() => expect(location.pathname).toBe(`${link}/runs/f3`));
  expect(calls.find((call) => call.method === "POST")?.body).toEqual({ from: "failed" });
});

test("a step a retry kept says where it was done", async () => {
  show(<RunPage root={root} link={link} id="f2" />);
  // Steps are chosen on the timeline.
  fireEvent.click(await screen.findByText("a · kept", { selector: "button *, button" }));
  expect(await screen.findByText(/it was not run again/)).toBeTruthy();
  expect(href("the run this one retries")).toContain(`${link}/runs/f1`);
});

test("an ID that is no run says so", async () => {
  show(<RunPage root={root} link={link} id="nope" />);
  expect(await screen.findByText("Nothing here")).toBeTruthy();
});

test("the list searches, filters by tag and loads more, all through the address", async () => {
  const page = (id: string, nextCursor: string | null) => [
    200,
    {
      items: [
        {
          kind: "script",
          id,
          target: `jobs/${id}`,
          status: "succeeded",
          state: "succeeded",
          trigger: "manual",
          attempt: 1,
          maxAttempts: 1,
          error: null,
          errorSummary: null,
          tags: ["vip"],
          bundleVersion: 1,
          createdAt: new Date().toISOString(),
          startedAt: null,
          finishedAt: null,
        },
      ],
      nextCursor,
      stateCounts: { succeeded: 1 },
      keptDays: 30,
    },
  ];
  routes[`GET ${root}/activity`] = (_body, url) =>
    (url.includes("cursor=c1") ? page("two", null) : page("one", "c1")) as [number, unknown];
  show(<RunsWorkbench root={root} link={link} />);
  await screen.findByText("jobs/one");
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByText("jobs/two");
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();

  fireEvent.change(screen.getByLabelText("Search"), { target: { value: "order:1" } });
  await waitFor(() => expect(new URLSearchParams(location.search).get("q")).toBe("order:1"));
  await waitFor(() => expect(calls.some((call) => call.url.includes("q=order%3A1"))).toBe(true));

  fireEvent.click(
    screen.getAllByRole("button", { name: "Show only runs tagged vip" })[0] as HTMLElement,
  );
  expect(new URLSearchParams(location.search).get("tag")).toBe("vip");
  await waitFor(() => expect(calls.some((call) => call.url.includes("tag=vip"))).toBe(true));

  // Choosing a run opens it beside the list, by the address.
  fireEvent.click(screen.getAllByText(/jobs\/one/)[0]?.closest("tr") as HTMLElement);
  expect(new URLSearchParams(location.search).get("run")).toBe("one");
});

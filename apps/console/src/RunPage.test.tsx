// @vitest-environment happy-dom
import { cleanup, configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, onTestFinished, test, vi } from "vitest";
import { useNamedObject } from "./kit/title.ts";
import { LOG_WINDOW } from "./screens/Execution.tsx";
import { RunPage } from "./screens/RunPage.tsx";
import { RunsWorkbench } from "./screens/Runs.tsx";
import { answer, show } from "./testing.tsx";

// Waits are generous: some reads here follow others, and the suite runs beside slower ones.
configure({ asyncUtilTimeout: 5000 });

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

test("a run's page names the run for the tab, and says when its state changes", async () => {
  let state = "running";
  routes[`GET ${root}/runs/r1`] = () => [
    200,
    {
      ...scriptRun,
      state,
      status: state,
      finishedAt: state === "running" ? null : scriptRun.finishedAt,
    },
  ];
  routes[`GET ${root}/runs/r1/logs`] = () => [200, { items: [], done: state !== "running" }];
  show(
    <>
      <RunPage root={root} link={link} id="r1" />
      <NamedObject />
    </>,
  );
  expect(await screen.findByTestId("named")).toBeTruthy();
  await waitFor(() =>
    expect(screen.getByTestId("named").textContent).toBe("Run of reminders/send"),
  );
  const announcer = () =>
    [...document.querySelectorAll('[role="status"].sr-only')]
      .map((one) => one.textContent)
      .join("");
  // Opening a run says nothing: its state is on the page.
  expect(announcer()).toBe("");
  state = "succeeded";
  await waitFor(() => expect(announcer()).toBe("Run of reminders/send: Succeeded"), {
    timeout: 6000,
  });
});

/** What the screen on show names for the tab's title, as the shell reads it. */
function NamedObject() {
  return <span data-testid="named">{useNamedObject() ?? ""}</span>;
}

/** A log of `total` lines, served a page at a time as the route does: after a `seq`, up to `limit`. */
function logOf(total: number, finished = true) {
  return (_body: unknown, url: string): [number, unknown] => {
    const query = new URLSearchParams(url.split("?")[1] ?? "");
    const after = Number(query.get("after") ?? 0);
    const limit = Number(query.get("limit") ?? 500);
    const items = [];
    for (let seq = after + 1; seq <= Math.min(after + limit, total); seq += 1) {
      items.push({
        seq,
        attempt: 1,
        time: "2026-11-14T10:00:01.000Z",
        level: "info",
        message: `line ${seq}`,
        fields: {},
      });
    }
    return [200, { items, done: finished && items.length < limit }];
  };
}

test("a finished run's page shows every line of its log, read a page at a time", async () => {
  routes[`GET ${root}/runs/r1/logs`] = logOf(2200);
  show(<RunPage root={root} link={link} id="r1" />);
  expect(await screen.findByText("2200 lines")).toBeTruthy();
  const afters = calls
    .filter((call) => call.url.includes("/runs/r1/logs"))
    .map((call) => new URLSearchParams(call.url.split("?")[1]).get("after"));
  expect(afters).toEqual(["0", "1000", "2000"]);
});

test("a long log keeps its newest lines on the page, and the whole of it can be downloaded", {
  timeout: 60_000,
}, async () => {
  routes[`GET ${root}/runs/r1/logs`] = logOf(LOG_WINDOW + 2000);
  const saved: Blob[] = [];
  // The download is a Blob handed to the browser; it is caught here instead, and put back after.
  const { createObjectURL, revokeObjectURL } = URL;
  URL.createObjectURL = (blob: Blob) => {
    saved.push(blob);
    return "blob:log";
  };
  URL.revokeObjectURL = () => {};
  // Following the link would take the test's window away to the download.
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  onTestFinished(() => {
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    click.mockRestore();
  });
  show(<RunPage root={root} link={link} id="r1" />);
  expect(await screen.findByText(`${LOG_WINDOW} lines`, {}, { timeout: 20_000 })).toBeTruthy();
  expect(screen.getByText("The first 2,000 lines are not shown here.")).toBeTruthy();
  // Lines are numbered from the start of the whole log, not of what the page holds.
  expect(screen.getByRole("button", { name: "Link to line 2001" })).toBeTruthy();
  expect(screen.queryByText("line 2000")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Download the whole log" }));
  await waitFor(() => expect(saved).toHaveLength(1));
  const text = await (saved[0] as Blob).text();
  expect(text.trimEnd().split("\n")).toHaveLength(LOG_WINDOW + 2000);
  expect(text.startsWith("2026-11-14T10:00:01.000Z info  line 1\n")).toBe(true);
});

test("a read that fails keeps the run on screen, says it is reconnecting, and recovers", async () => {
  let failing = false;
  routes[`GET ${root}/runs/r1`] = () =>
    failing
      ? [503, { status: 503, detail: "The database is busy." }]
      : [200, { ...scriptRun, state: "running", status: "running", finishedAt: null }];
  routes[`GET ${root}/runs/r1/logs`] = logOf(3, false);
  show(<RunPage root={root} link={link} id="r1" />);
  expect(await screen.findByText("3 lines")).toBeTruthy();
  failing = true;
  expect(await screen.findByText("Reconnecting…", {}, { timeout: 4000 })).toBeTruthy();
  // What was shown stays.
  expect(screen.getByText("3 lines")).toBeTruthy();
  expect(screen.queryByText("The database is busy.")).toBeNull();
  failing = false;
  await waitFor(() => expect(screen.queryByText("Reconnecting…")).toBeNull(), { timeout: 6000 });
  expect(screen.getByText("3 lines")).toBeTruthy();
}, 15_000);

test("a flow run whose read fails stays on screen and recovers", async () => {
  let failing = false;
  routes[`GET ${root}/flow-runs/f2`] = () =>
    failing
      ? [503, { status: 503, detail: "The database is busy." }]
      : [200, { ...flowRun, status: "running", state: "running" }];
  show(<RunPage root={root} link={link} id="f2" />);
  expect(await screen.findByText("orders/reorder", { selector: "a" })).toBeTruthy();
  failing = true;
  expect(await screen.findByText("Reconnecting…", {}, { timeout: 4000 })).toBeTruthy();
  expect(screen.getByText("orders/reorder", { selector: "a" })).toBeTruthy();
  failing = false;
  await waitFor(() => expect(screen.queryByText("Reconnecting…")).toBeNull(), { timeout: 6000 });
}, 15_000);

test("a run chosen in the address opens as its own kind, even when the list does not show it", async () => {
  const flowActivity = {
    kind: "flow",
    id: "f9",
    target: "orders/reorder",
    status: "failed",
    state: "failed",
    trigger: "manual",
    attempt: 1,
    maxAttempts: 1,
    error: null,
    errorSummary: null,
    tags: [],
    bundleVersion: 1,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
  };
  routes[`GET ${root}/activity`] = (_body, url) => [
    200,
    {
      items: url.includes("q=f9") ? [flowActivity] : [],
      nextCursor: null,
      stateCounts: {},
    },
  ];
  history.replaceState(null, "", "/t/t1/workspaces/w1/runs?run=f9");
  show(<RunsWorkbench root={root} link={link} />);
  await waitFor(() => expect(calls.some((call) => call.url.includes("q=f9"))).toBe(true));
  const inspector = await screen.findByRole("complementary", { name: "The chosen run" });
  await waitFor(() => expect(inspector.textContent).toContain("orders/reorder"));
  // Its script panel would have asked for a script run by this ID.
  expect(calls.some((call) => call.url.includes("/runs/f9"))).toBe(false);

  cleanup();
  history.replaceState(null, "", "/t/t1/workspaces/w1/runs?run=nothing");
  show(<RunsWorkbench root={root} link={link} />);
  expect(await screen.findByText(/No run has this ID/)).toBeTruthy();
  history.replaceState(null, "", "/");
});

test("a run is opened, read and closed from the list with the keyboard alone", async () => {
  routes[`GET ${root}/activity`] = () => [
    200,
    {
      items: [
        {
          kind: "script",
          id: "r1",
          target: "reminders/send",
          status: "failed",
          state: "failed",
          trigger: "schedule",
          attempt: 2,
          maxAttempts: 2,
          error: "The SMS gateway said no.",
          errorSummary: "The SMS gateway said no.",
          tags: [],
          bundleVersion: 4,
          createdAt: new Date().toISOString(),
          startedAt: null,
          finishedAt: null,
        },
      ],
      nextCursor: null,
      stateCounts: { failed: 1 },
    },
  ];
  history.replaceState(null, "", "/t/t1/workspaces/w1/runs");
  show(<RunsWorkbench root={root} link={link} />);
  const row = (await screen.findByText("reminders/send", { selector: "a" })).closest("tr");
  // The list is one tab stop: a cell of the first row.
  const cell = screen.getByRole("grid", { name: "Runs" }).querySelector('[tabindex="0"]');
  expect(row?.contains(cell)).toBe(true);
  (cell as HTMLElement).focus();
  fireEvent.keyDown(cell as HTMLElement, { key: "Enter" });

  const inspector = await screen.findByRole("complementary", { name: "The chosen run" });
  // Focus goes to the inspector's heading, and the run's error can be read.
  await waitFor(() => expect(document.activeElement?.tagName).toBe("H2"));
  expect(inspector.contains(document.activeElement)).toBe(true);
  expect(await screen.findAllByText("The SMS gateway said no.")).not.toHaveLength(0);
  expect(row?.getAttribute("aria-selected")).toBe("true");

  fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
  await waitFor(() =>
    expect(screen.queryByRole("complementary", { name: "The chosen run" })).toBeNull(),
  );
  // Focus is back where it was in the list.
  expect(document.activeElement).toBe(cell);
  history.replaceState(null, "", "/");
});

test("a failed flow run opens on its failed step, names it, and shows what it was given", async () => {
  routes[`GET ${root}/flow-runs/f2`] = () => [
    200,
    {
      ...flowRun,
      steps: [
        step("start"),
        step("a"),
        step("b", {
          status: "failed",
          state: "failed",
          runId: "rb",
          input: { sku: "A", apiKey: "[redacted]" },
          error: { message: "The supplier refused." },
        }),
      ],
    },
  ];
  routes[`GET ${root}/flow-runs/f2/definition`] = () => [
    200,
    {
      path: "orders/reorder",
      bundleVersion: 4,
      nodes: {
        start: { type: "trigger" },
        a: { type: "set" },
        b: { type: "script", script: "supplier/order" },
      },
      edges: [],
      layout: {},
      changed: true,
    },
  ];
  routes[`GET ${root}/runs/rb/logs`] = () => [200, { items: [], done: true }];
  routes[`GET ${root}/runs/rb/insight`] = () => [
    200,
    { attempts: [], worker: null, timeoutSeconds: 30, uses: [], diagnosis: null },
  ];
  show(<RunPage root={root} link={link} id="f2" />);
  // No click: the failed step is what the page opens on.
  const panel = await screen.findByRole("region", { name: "Step b" });
  expect(within(panel).getByText("The supplier refused.")).toBeTruthy();
  expect(await within(panel).findByRole("link", { name: "Open script supplier/order" })).toBeTruthy();
  expect(panel.textContent).toContain("[redacted]");
  expect(screen.getByText(/Failed at/).textContent).toContain("b");
  // The flow's own input is on the page too.
  expect(screen.getByRole("region", { name: "The flow's input and output" }).textContent).toContain(
    '"sku"',
  );
  // Choosing another step puts it in the address; a reload comes back to it.
  fireEvent.click(await screen.findByText("a", { selector: "button *, button" }));
  await waitFor(() => expect(new URLSearchParams(location.search).get("step")).toBe("a"));
  cleanup();
  show(<RunPage root={root} link={link} id="f2" />);
  expect(await screen.findByRole("region", { name: "Step a" })).toBeTruthy();
  history.replaceState(null, "", "/");
});

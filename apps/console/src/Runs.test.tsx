// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { RunsWorkbench } from "./screens/Runs.tsx";
import { answer, show } from "./testing.tsx";

const root = "/tenants/t1/workspaces/w1";
let asked: string[];
let sent: { address: string; body: unknown }[];

beforeEach(() => {
  asked = [];
  sent = [];
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    asked.push(address);
    if (init.method === "POST") {
      sent.push({ address, body: JSON.parse((init.body as string) ?? "null") });
      return new Response(JSON.stringify({ cancelled: 2, more: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const path = address.split("?")[0] as string;
    if (path.endsWith("/runs/r1") || path.endsWith("/runs/r1/insight")) {
      const value = path.endsWith("/insight")
        ? { attempts: [], worker: null, timeoutSeconds: 30, uses: [], diagnosis: null }
        : {
            id: "r1",
            script: "reminders/send",
            status: "failed",
            state: "failed",
            attempt: 1,
            maxAttempts: 1,
            trigger: { type: "schedule", trigger: "reminders/hourly" },
            startedBy: { type: "system", id: null },
            bundleId: "b1",
            bundleVersion: 4,
            error: { message: "The SMS gateway said no." },
            createdAt: new Date().toISOString(),
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            input: { clinic: "north" },
            output: null,
            alert: null,
            waitingFor: null,
            pool: null,
            idempotencyKey: "k",
          };
      return new Response(JSON.stringify(value), { status: 200 });
    }
    const value = address.includes("/activity")
      ? {
          items: [
            {
              kind: "script",
              id: "r1",
              target: "reminders/send",
              status: "succeeded",
              state: "succeeded",
              trigger: "schedule",
              attempt: 1,
              maxAttempts: 3,
              error: null,
              errorSummary: null,
              outputSummary: '{"sent":12}',
              tags: ["clinic:north"],
              bundleVersion: 1,
              createdAt: new Date().toISOString(),
              startedAt: new Date().toISOString(),
              finishedAt: new Date().toISOString(),
            },
          ],
          counts: { succeeded: 1, queued: 2 },
          stateCounts: { succeeded: 1, queued: 2 },
        }
      : { items: [] };
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

const lists = () => asked.filter((address) => address.includes("/activity"));

test("the list of the last day is asked for once, not again on every render", async () => {
  show(<RunsWorkbench root={root} link="/t/t1/workspaces/w1" />);
  await screen.findByText("reminders/send");
  // Long enough for a render loop to have asked many times over.
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(lists()).toHaveLength(1);
  expect(lists()[0]).toContain("from=");
});

test("choosing another period asks again, once", async () => {
  show(<RunsWorkbench root={root} link="/t/t1/workspaces/w1" />);
  await screen.findByText("reminders/send");
  fireEvent.change(screen.getByLabelText("When"), { target: { value: "all" } });
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(lists()).toHaveLength(2);
  expect(lists()[1]).not.toContain("from=");
});

test("the status filter is read from the address and written back to it", async () => {
  history.replaceState(null, "", "/t/t1/workspaces/w1/runs?status=failed");
  show(<RunsWorkbench root={root} link="/t/t1/workspaces/w1" />);
  await screen.findByText("reminders/send");
  expect(lists()[0]).toContain("state=failed");
  fireEvent.click(screen.getByRole("radio", { name: /^All/ }));
  expect(location.search).toBe("");
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(lists().at(-1)).not.toContain("state=");
});

test("a run's details link to its script, the trigger that started it and its version", async () => {
  history.replaceState(null, "", "/t/t1/workspaces/w1/runs?run=r1");
  show(<RunsWorkbench root={root} link="/t/t1/workspaces/w1" />);
  await screen.findByText("The SMS gateway said no.");
  fireEvent.click(screen.getByRole("tab", { name: "Details" }));
  const href = (name: string | RegExp) => screen.getByRole("link", { name }).getAttribute("href");
  const script = screen
    .getAllByRole("link", { name: "reminders/send" })
    .map((one) => one.getAttribute("href"));
  expect(script).toContain("/t/t1/workspaces/w1/scripts/edit/reminders/send");
  expect(href(/reminders\/hourly/)).toBe("/t/t1/workspaces/w1/triggers?trigger=reminders%2Fhourly");
  expect(href("v4")).toBe("/t/t1/workspaces/w1/deployments");
  expect(screen.getByRole("button", { name: "Copy the run ID" })).toBeTruthy();
  expect(screen.getByRole("button", { name: /^Copy as curl/ })).toBeTruthy();
});

test("each run is one row with what it produced, and the order is chosen by its headers", async () => {
  show(<RunsWorkbench root={root} link="/t/t1/workspaces/w1" />);
  const grid = await screen.findByRole("grid", { name: "Runs" });
  const row = within(grid).getByText("reminders/send").closest("tr") as HTMLElement;
  expect(within(row).getByText('{"sent":12}')).toBeTruthy();
  fireEvent.click(within(grid).getByRole("button", { name: /Duration/ }));
  expect(location.search).toBe("?sort=duration&dir=asc");
  await waitFor(() => expect(lists().at(-1)).toContain("sort=duration&dir=asc"));
});

test("tags add up as filters, and a run's target can be the only one shown", async () => {
  history.replaceState(null, "", "/t/t1/workspaces/w1/runs?tag=vip");
  show(<RunsWorkbench root={root} link="/t/t1/workspaces/w1" />);
  await screen.findByRole("link", { name: "reminders/send" });
  fireEvent.click(screen.getByRole("button", { name: "Show only runs tagged clinic:north" }));
  expect(new URLSearchParams(location.search).getAll("tag")).toEqual(["vip", "clinic:north"]);
  await waitFor(() => expect(lists().at(-1)).toContain("tag=vip&tag=clinic%3Anorth"));
  history.replaceState(null, "", "/t/t1/workspaces/w1/runs?target=reminders%2Fsend");
  cleanup();
  show(<RunsWorkbench root={root} link="/t/t1/workspaces/w1" />);
  await screen.findByRole("link", { name: "reminders/send" });
  expect(lists().at(-1)).toContain("target=reminders%2Fsend");
  expect(
    screen.getByRole("button", { name: "Stop showing only runs of reminders/send" }),
  ).toBeTruthy();
});

test("cancelling queued runs names how many and cancels only what the list shows", async () => {
  history.replaceState(null, "", "/t/t1/workspaces/w1/runs?q=reminders&tag=vip");
  show(<RunsWorkbench root={root} link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Cancel 2 queued" }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).toContain('matching "reminders"');
  // American spelling, as everywhere else (OPS-40).
  expect(dialog.textContent).toContain("is canceled");
  expect(dialog.textContent).not.toContain("cancelled");
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel queued runs" }));
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]?.body).toMatchObject({
    include: "queued",
    filters: { q: "reminders", tags: ["vip"] },
  });
});

test("Run again from a row asks first, as the run page does", async () => {
  show(<RunsWorkbench root={root} link="/t/t1/workspaces/w1" />);
  await screen.findByRole("link", { name: "reminders/send" });
  fireEvent.click(screen.getByRole("button", { name: /^Actions for/ }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Run again…" }));
  const said = await answer("Cancel");
  expect(said).toContain("Run reminders/send again?");
  expect(said).toContain("on version 1, the one it ran");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(sent).toEqual([]);

  fireEvent.click(screen.getByRole("button", { name: /^Actions for/ }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Run again…" }));
  await answer("Run again");
  await waitFor(() =>
    expect(sent).toEqual([
      { address: `/api/v1${root}/runs/r1/rerun`, body: { bundle: "original" } },
    ]),
  );
});

/** A list of runs, newest first, that a test can change under the screen. */
function serveRuns(all: { id: string; state?: string }[], pageSize = 100) {
  vi.stubGlobal("fetch", async (address: string) => {
    asked.push(address);
    const url = new URL(address, "http://x");
    if (!url.pathname.endsWith("/activity")) {
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }
    const at = Number(url.searchParams.get("cursor")?.replace("after:", "") ?? 0);
    const page = all.slice(at, at + pageSize);
    const more = at + pageSize < all.length;
    const rows = page.map((one) => ({
      kind: "script",
      id: one.id,
      target: `job/${one.id}`,
      status: one.state ?? "succeeded",
      state: one.state ?? "succeeded",
      trigger: "schedule",
      attempt: 1,
      maxAttempts: 1,
      error: null,
      errorSummary: null,
      outputSummary: null,
      tags: [],
      bundleVersion: 1,
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    }));
    return new Response(
      JSON.stringify({
        items: rows,
        nextCursor: more ? `after:${at + pageSize}` : null,
        counts: {},
        stateCounts: { succeeded: all.length },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
}
const many = (n: number, from = 1) =>
  Array.from({ length: n }, (_, i) => ({ id: `r${String(from + i).padStart(3, "0")}` }));
const shownRows = () =>
  within(screen.getByRole("grid", { name: "Runs" })).getAllByRole("link", { name: /^job\// });

test("Load more shows the older runs at once, not behind a count of new ones (OPS-10)", async () => {
  history.replaceState(null, "", "/t/t1/workspaces/w1/runs?target=ten");
  serveRuns(many(130));
  show(<RunsWorkbench root={root} link="/t/t1/workspaces/w1" />);
  await screen.findByRole("link", { name: "job/r001" });
  expect(shownRows()).toHaveLength(100);
  // The reader has a row checked, which holds what arrives, and goes for the older ones.
  fireEvent.click(
    within(screen.getByRole("grid", { name: "Runs" })).getAllByRole("checkbox")[1] as HTMLElement,
  );
  expect(screen.getByText("1 selected")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await waitFor(() => expect(shownRows()).toHaveLength(130));
  // Held rows are taken away a moment after they are drawn: wait for that to have happened.
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(shownRows()).toHaveLength(130);
  expect(screen.queryByText(/new runs?$/)).toBeNull();
});

test("a saved view's search stays in the address and the box (OPS-12)", async () => {
  serveRuns(many(3));
  show(<RunsWorkbench root={root} link="/t/t1/workspaces/w1" />);
  await screen.findByRole("link", { name: "job/r001" });
  act(() => {
    history.pushState(null, "", "/t/t1/workspaces/w1/runs?q=alpha");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await waitFor(() =>
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("alpha"),
  );
  await new Promise((resolve) => setTimeout(resolve, 700));
  expect(location.search).toBe("?q=alpha");
  expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("alpha");
});

test("Cancel queued is offered where the list shows queued runs, not under Failed (OPS-15)", async () => {
  history.replaceState(null, "", "/t/t1/workspaces/w1/runs?status=failed");
  show(<RunsWorkbench root={root} link="/t/t1/workspaces/w1" />);
  await screen.findByRole("link", { name: "reminders/send" });
  expect(screen.queryByRole("button", { name: /^Cancel \d+ queued/ })).toBeNull();
  cleanup();
  history.replaceState(null, "", "/t/t1/workspaces/w1/runs?status=queued");
  show(<RunsWorkbench root={root} link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Cancel 2 queued" }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).toContain("Every queued script run");
});

test("rows checked and then filtered away are no longer checked or acted on (OPS-13)", async () => {
  serveRuns(many(4));
  show(<RunsWorkbench root={root} link="/t/t1/workspaces/w1" />);
  await screen.findByRole("link", { name: "job/r001" });
  const grid = screen.getByRole("grid", { name: "Runs" });
  const boxes = within(grid).getAllByRole("checkbox");
  fireEvent.click(boxes[1] as HTMLElement);
  fireEvent.click(boxes[2] as HTMLElement);
  expect(screen.getByText("2 selected")).toBeTruthy();
  // A search that takes both away.
  serveRuns(many(1, 4));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "r004" } });
  await waitFor(() => expect(screen.queryByText("2 selected")).toBeNull(), { timeout: 3000 });
});

test("after Load more, new runs at the top do not push older ones out of the list (OPS-11)", async () => {
  const older = many(130, 6).map((one, i) => (i === 0 ? { ...one, state: "running" } : one));
  history.replaceState(null, "", "/t/t1/workspaces/w1/runs?target=eleven");
  serveRuns(older);
  show(<RunsWorkbench root={root} link="/t/t1/workspaces/w1" />);
  await screen.findByRole("link", { name: "job/r006" });
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await waitFor(() => expect(shownRows()).toHaveLength(130));
  // Five runs start. A running one keeps the list asking again, and the first page shifts.
  serveRuns([...many(5), ...older]);
  await waitFor(() => expect(shownRows()).toHaveLength(135), { timeout: 12_000 });
  const names = shownRows().map((one) => one.textContent?.slice(0, 8));
  // The ones that were at the end of the first page are still there, once.
  expect(names).toContain("job/r101");
  expect(new Set(names).size).toBe(135);
}, 25_000);

test("a run of a schedule from before the change, and an event's run, link to what started them (OPS-16)", async () => {
  const detail = (trigger: object) => {
    const before = globalThis.fetch;
    vi.stubGlobal("fetch", async (address: string, init?: RequestInit) => {
      const found = await before(address, init);
      if (!address.endsWith("/runs/r1")) return found;
      const body = await found.json();
      return new Response(JSON.stringify({ ...body, trigger }), { status: 200 });
    });
  };
  history.replaceState(null, "", "/t/t1/workspaces/w1/runs?run=r1");
  detail({ type: "schedule", schedule: "reminders/hourly" });
  show(<RunsWorkbench root={root} link="/t/t1/workspaces/w1" />);
  await screen.findByText("The SMS gateway said no.");
  fireEvent.click(screen.getByRole("tab", { name: "Details" }));
  expect(screen.getByRole("link", { name: /reminders\/hourly/ }).getAttribute("href")).toBe(
    "/t/t1/workspaces/w1/triggers?trigger=reminders%2Fhourly",
  );
  cleanup();
  detail({ type: "event", trigger: "orders/on-placed", event: "orders/placed", eventId: "e9" });
  show(<RunsWorkbench root={root} link="/t/t1/workspaces/w1" />);
  await screen.findByText("The SMS gateway said no.");
  fireEvent.click(screen.getByRole("tab", { name: "Details" }));
  expect(screen.getByRole("link", { name: "The event" }).getAttribute("href")).toBe(
    "/t/t1/workspaces/w1/events?item=e9",
  );
});

test("flow runs and script runs that have been going too long are canceled by age (FLW-MP14)", async () => {
  show(<RunsWorkbench root={root} link="/t/t1/workspaces/w1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Cancel by age…" }));
  const dialog = await screen.findByRole("dialog");
  // Nothing can be canceled until a length is given.
  expect(
    (within(dialog).getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "2" } });
  fireEvent.change(within(dialog).getByLabelText("Unit"), { target: { value: "86400" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
  expect(dialog.textContent).toContain("It cannot be undone");
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel runs older than 2 days" }));
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]).toEqual({
    address: `/api/v1${root}/flow-runs/cancel`,
    body: { olderThanSeconds: 172800 },
  });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  fireEvent.click(await screen.findByRole("button", { name: "Cancel by age…" }));
  const again = await screen.findByRole("dialog");
  fireEvent.change(within(again).getByLabelText("Which runs"), { target: { value: "script" } });
  fireEvent.change(within(again).getByLabelText("Amount"), { target: { value: "3" } });
  fireEvent.click(within(again).getByRole("button", { name: "Continue" }));
  fireEvent.click(within(again).getByRole("button", { name: "Cancel runs older than 3 seconds" }));
  await waitFor(() => expect(sent).toHaveLength(2));
  expect(sent[1]).toEqual({
    address: `/api/v1${root}/runs/cancel`,
    body: { include: "all", olderThanSeconds: 3 },
  });
});

test("runs between two times: chosen under When, kept in the address, asked for and canceled by (OPS-MP7)", async () => {
  show(<RunsWorkbench root={root} link="/t/t1/workspaces/w1" />);
  await screen.findByText("reminders/send");
  fireEvent.change(screen.getByLabelText("When"), { target: { value: "between" } });
  const start = await screen.findByLabelText("From");
  const end = screen.getByLabelText("To");
  fireEvent.change(start, { target: { value: "2026-11-10T08:00" } });
  fireEvent.change(end, { target: { value: "2026-11-11T09:30" } });
  const from = new Date("2026-11-10T08:00").toISOString();
  const to = new Date("2026-11-11T09:30").toISOString();
  await waitFor(() => {
    const params = new URLSearchParams(location.search);
    expect(params.get("when")).toBe("between");
    expect(params.get("from")).toBe(from);
    expect(params.get("to")).toBe(to);
  });
  await waitFor(() => {
    const last = new URLSearchParams(lists().at(-1)?.split("?")[1]);
    expect(last.get("from")).toBe(from);
    expect(last.get("to")).toBe(to);
  });
  fireEvent.click(await screen.findByRole("button", { name: "Cancel 2 queued" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel queued runs" }));
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]?.body).toMatchObject({ filters: { from, to } });
});

test("a window that ends before it starts says so and asks for nothing (OPS-MP7)", async () => {
  history.replaceState(
    null,
    "",
    "/t/t1/workspaces/w1/runs?when=between&from=2026-11-11T08:00:00.000Z&to=2026-11-10T08:00:00.000Z",
  );
  show(<RunsWorkbench root={root} link="/t/t1/workspaces/w1" />);
  expect(await screen.findByText("The end is before the start.")).toBeTruthy();
  expect(lists()).toHaveLength(0);
});

test("a viewer is offered no Cancel, Cancel by age or Run again, and an operator is (OPS-35)", async () => {
  const served = globalThis.fetch;
  let allowed: string[] = [];
  vi.stubGlobal("fetch", async (address: string, init?: RequestInit) => {
    if (!address.split("?")[0]?.endsWith("/allowed")) return served(address, init);
    asked.push(address);
    return new Response(JSON.stringify({ allowed }), { status: 200 });
  });
  show(<RunsWorkbench root={root} link="/t/t1/workspaces/w1" />);
  await screen.findByRole("link", { name: "reminders/send" });
  await waitFor(() => expect(asked.some((one) => one.includes("/allowed?"))).toBe(true));
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(screen.queryByRole("button", { name: "Cancel 2 queued" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^Actions for/ }));
  await screen.findByRole("menuitem", { name: "Open" });
  expect(screen.queryByRole("menuitem", { name: "Run again…" })).toBeNull();
  cleanup();
  allowed = ["run:write", "flow_run:write"];
  show(<RunsWorkbench root={root} link="/t/t1/workspaces/w1" />);
  expect(await screen.findByRole("button", { name: "Cancel 2 queued" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^Actions for/ }));
  expect(await screen.findByRole("menuitem", { name: "Run again…" })).toBeTruthy();
});

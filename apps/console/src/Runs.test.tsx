// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { RunsWorkbench } from "./screens/Runs.tsx";
import { show } from "./testing.tsx";

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
  await screen.findByText("reminders/send", { selector: "a" });
  fireEvent.click(screen.getByRole("button", { name: "Show only runs tagged clinic:north" }));
  expect(new URLSearchParams(location.search).getAll("tag")).toEqual(["vip", "clinic:north"]);
  await waitFor(() => expect(lists().at(-1)).toContain("tag=vip&tag=clinic%3Anorth"));
  history.replaceState(null, "", "/t/t1/workspaces/w1/runs?target=reminders%2Fsend");
  cleanup();
  show(<RunsWorkbench root={root} link="/t/t1/workspaces/w1" />);
  await screen.findByText("reminders/send", { selector: "a" });
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
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel queued runs" }));
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]?.body).toMatchObject({
    include: "queued",
    filters: { q: "reminders", tags: ["vip"] },
  });
});

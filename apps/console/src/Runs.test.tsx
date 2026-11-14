// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { RunsWorkbench } from "./screens/Runs.tsx";
import { show } from "./testing.tsx";

const root = "/tenants/t1/workspaces/w1";
let asked: string[];

beforeEach(() => {
  asked = [];
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("fetch", async (address: string) => {
    asked.push(address);
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
              bundleVersion: 1,
              createdAt: new Date().toISOString(),
              startedAt: new Date().toISOString(),
              finishedAt: new Date().toISOString(),
            },
          ],
          counts: { succeeded: 1 },
          stateCounts: { succeeded: 1 },
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
  show(<RunsWorkbench root={root} link="/t/t1/workspaces/w1" selected={undefined} />);
  await screen.findByText("reminders/send");
  // Long enough for a render loop to have asked many times over.
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(lists()).toHaveLength(1);
  expect(lists()[0]).toContain("from=");
});

test("choosing another period asks again, once", async () => {
  show(<RunsWorkbench root={root} link="/t/t1/workspaces/w1" selected={undefined} />);
  await screen.findByText("reminders/send");
  fireEvent.change(screen.getByLabelText("When"), { target: { value: "all" } });
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(lists()).toHaveLength(2);
  expect(lists()[1]).not.toContain("from=");
});

test("the status filter is read from the address and written back to it", async () => {
  history.replaceState(null, "", "/t/t1/workspaces/w1/runs?status=failed");
  show(<RunsWorkbench root={root} link="/t/t1/workspaces/w1" selected={undefined} />);
  await screen.findByText("reminders/send");
  expect(lists()[0]).toContain("state=failed");
  fireEvent.click(screen.getByRole("radio", { name: /^All/ }));
  expect(location.search).toBe("");
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(lists().at(-1)).not.toContain("state=");
});

test("a run's details link to its script, the trigger that started it and its version", async () => {
  show(<RunsWorkbench root={root} link="/t/t1/workspaces/w1" selected="r1" />);
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

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
    const value = address.includes("/activity")
      ? {
          items: [
            {
              kind: "script",
              id: "r1",
              target: "reminders/send",
              status: "succeeded",
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

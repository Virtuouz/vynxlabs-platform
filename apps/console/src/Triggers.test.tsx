// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TriggersWorkbench } from "./screens/Operate.tsx";
import { show } from "./testing.tsx";

const root = "/tenants/t1/workspaces/w1";
const link = "/t/t1/workspaces/w1";

const trigger = (path: string, node: string, script: string, targetKind: "script" | "flow") => ({
  path,
  node,
  type: "schedule",
  script,
  targetKind,
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
});

beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("fetch", async () =>
    Response.json({
      items: [
        trigger("reminders/hourly", "", "reminders/send", "script"),
        trigger("inventory/reorder", "nightly", "inventory/reorder", "flow"),
      ],
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

test("each trigger links to what it starts", async () => {
  show(<TriggersWorkbench root={root} link={link} workspacePaused={false} production={false} />);
  expect((await screen.findByRole("link", { name: "reminders/send" })).getAttribute("href")).toBe(
    `${link}/scripts/edit/reminders/send`,
  );
  expect(screen.getByRole("link", { name: "inventory/reorder" }).getAttribute("href")).toBe(
    `${link}/flows/inventory/reorder`,
  );
});

test("a trigger named in the address opens, and choosing another changes the address", async () => {
  history.replaceState(null, "", `${link}/triggers?trigger=reminders%2Fhourly`);
  show(<TriggersWorkbench root={root} link={link} workspacePaused={false} production={false} />);
  expect(await screen.findByRole("button", { name: "Pause this trigger" })).toBeTruthy();
  expect(screen.getByText("schedule trigger")).toBeTruthy();

  fireEvent.click(screen.getByText("inventory/reorder", { selector: "span" }));
  expect(new URLSearchParams(location.search).get("trigger")).toBe("inventory/reorder#nightly");
  expect(await screen.findByText("schedule trigger · node nightly")).toBeTruthy();
});

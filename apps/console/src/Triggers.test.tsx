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

test("each trigger links to the page of what it starts", async () => {
  show(<TriggersWorkbench root={root} link={link} workspacePaused={false} production={false} />);
  expect((await screen.findByRole("link", { name: "reminders/send" })).getAttribute("href")).toBe(
    `${link}/scripts/reminders/send`,
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

test("a schedule fires now from its inspector, and so does a flow's schedule, naming its node", async () => {
  const posted: { url: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    if (init.method === "POST") {
      posted.push({ url: address, body: JSON.parse(init.body as string) });
      return Response.json({ kind: "script", id: "r1" }, { status: 201 });
    }
    return Response.json({
      items: [
        trigger("reminders/hourly", "", "reminders/send", "script"),
        trigger("inventory/reorder", "nightly", "inventory/reorder", "flow"),
      ],
    });
  });
  history.replaceState(null, "", `${link}/triggers?trigger=reminders%2Fhourly`);
  show(<TriggersWorkbench root={root} link={link} workspacePaused={false} production={false} />);
  fireEvent.click(await screen.findByRole("button", { name: "Fire now" }));
  await vi.waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]).toEqual({
    url: `/api/v1${root}/schedule-firings`,
    body: { path: "reminders/hourly" },
  });
  await vi.waitFor(() => expect(location.pathname).toBe(`${link}/runs/r1`));

  // A schedule node inside a flow fires with its flow, naming the node (OPS-MP3).
  history.replaceState(null, "", `${link}/triggers?trigger=inventory%2Freorder%23nightly`);
  cleanup();
  show(<TriggersWorkbench root={root} link={link} workspacePaused={false} production={false} />);
  fireEvent.click(await screen.findByRole("button", { name: "Fire now" }));
  await vi.waitFor(() => expect(posted).toHaveLength(2));
  expect(posted[1]?.body).toEqual({ path: "inventory/reorder", node: "nightly" });
});

test("new triggers are made in a dev workspace; production says where instead", async () => {
  show(<TriggersWorkbench root={root} link={link} workspacePaused={false} production />);
  const button = await screen.findByRole("button", { name: "New trigger" });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  cleanup();
  show(<TriggersWorkbench root={root} link={link} workspacePaused={false} production={false} />);
  fireEvent.click(await screen.findByRole("button", { name: "New trigger" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Schedule" }));
  expect(await screen.findByRole("heading", { name: "New schedule" })).toBeTruthy();
});

test("a viewer is offered no Pause, Resume or Fire now, and an operator is (OPS-35)", async () => {
  let allowed: string[] = [];
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (address: string) => {
    asked.push(address);
    if (address.split("?")[0]?.endsWith("/allowed")) return Response.json({ allowed });
    return Response.json({ items: [trigger("reminders/hourly", "", "reminders/send", "script")] });
  });
  history.replaceState(null, "", `${link}/triggers?trigger=reminders%2Fhourly`);
  show(<TriggersWorkbench root={root} link={link} workspacePaused={false} production={false} />);
  await screen.findByText("schedule trigger");
  await vi.waitFor(() => expect(asked.some((one) => one.includes("/allowed?"))).toBe(true));
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(screen.queryByRole("button", { name: "Pause this trigger" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Fire now" })).toBeNull();
  cleanup();
  allowed = ["trigger:write"];
  show(<TriggersWorkbench root={root} link={link} workspacePaused={false} production={false} />);
  expect(await screen.findByRole("button", { name: "Pause this trigger" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Fire now" })).toBeTruthy();
});

test("a paused trigger says who paused it (OPS-36)", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      items: [
        {
          ...trigger("reminders/hourly", "", "reminders/send", "script"),
          paused: {
            at: new Date().toISOString(),
            by: "m2",
            byName: "Carl Jones",
            reason: "Holding for the audit",
          },
          pausedBy: "trigger",
        },
      ],
    }),
  );
  history.replaceState(null, "", `${link}/triggers?trigger=reminders%2Fhourly`);
  show(<TriggersWorkbench root={root} link={link} workspacePaused={false} production={false} />);
  expect(await screen.findByText(/by Carl Jones: Holding for the audit/)).toBeTruthy();
});

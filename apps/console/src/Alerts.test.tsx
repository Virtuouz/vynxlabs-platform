// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Alerts } from "./screens/Alerts.tsx";
import { QueuePanel } from "./screens/Execution.tsx";
import { show } from "./testing.tsx";

const root = "/tenants/t1/workspaces/w1";
const link = "/t/t1/workspaces/w1";
let calls: { method: string; url: string; body: unknown }[];

beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url: address, body });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    const path = new URL(address, "http://x").pathname;
    if (method === "PATCH") return json({});
    if (path.endsWith("/alert-settings")) {
      return json({
        default: { notify: "chat" },
        overrides: [{ path: "orders/sync", ownership: "code", script: "orders/on-failure" }],
      });
    }
    if (path.endsWith("/alerts")) {
      return json({
        items: [
          {
            kind: "run",
            id: "r1",
            name: "orders/sync",
            at: new Date().toISOString(),
            error: "The ERP refused",
            notified: true,
            notifyError: null,
            handlerRunId: null,
            handlerError: null,
            repeats: 19,
          },
        ],
        nextBefore: null,
      });
    }
    if (path.endsWith("/scripts")) return json({ items: [{ path: "orders/on-failure" }] });
    if (path.endsWith("/connection-bindings")) {
      return json({
        items: [
          { path: "chat", connector: "http", bound: true },
          { path: "mail", connector: "smtp", bound: true },
        ],
      });
    }
    if (path.endsWith("/queue")) {
      return json({
        items: [
          {
            workspaceId: "w1",
            workspace: "main",
            pool: null,
            due: 42,
            later: 3,
            running: 4,
            oldestSeconds: 750,
          },
        ],
        tasks: [{ workspaceId: "w1", kind: "describe", waiting: 2 }],
      });
    }
    if (path.endsWith("/workers")) {
      return json({
        items: [
          {
            id: "k1",
            credentialName: "plant",
            managed: false,
            version: "0.5.0",
            outdated: true,
            running: [{ runId: "r9", workspaceId: "w1", script: "orders/sync", startedAt: null }],
          },
        ],
      });
    }
    return json({ items: [] });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("the default is changed and saved; overrides and recent alerts are listed", async () => {
  show(<Alerts root={root} link={link} workspaceRoot={root} editable />);
  const handler = (await screen.findByLabelText("Start a script")) as HTMLSelectElement;
  await waitFor(() => expect(handler.options.length).toBe(2));
  // Only http connections can be posted to.
  const post = screen.getByLabelText("Post to a connection") as HTMLSelectElement;
  await waitFor(() => expect(post.value).toBe("chat"));
  expect([...post.options].map((one) => one.value)).toEqual(["", "chat"]);
  fireEvent.change(handler, { target: { value: "orders/on-failure" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(calls.find((one) => one.method === "PATCH")).toMatchObject({
      url: `/api/v1${root}`,
      body: { failureAlert: { script: "orders/on-failure", notify: "chat" } },
    }),
  );
  const overrides = within(screen.getByRole("region", { name: "Set by scripts" }));
  expect(overrides.getByText("starts orders/on-failure")).toBeTruthy();
  const recent = within(screen.getByRole("region", { name: "Recent alerts" }));
  expect(recent.getByText("+19 more")).toBeTruthy();
  expect(recent.getByRole("link", { name: "orders/sync" }).getAttribute("href")).toBe(
    `${link}/runs/r1`,
  );
});

test("the queue says where runs wait and for how long, and what each worker holds", async () => {
  show(<QueuePanel base="/tenants/t1" />);
  expect(await screen.findByText("Runs are waiting in main, the oldest for 12m.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "main" }).getAttribute("href")).toBe(
    "/t/t1/workspaces/w1/runs?status=queued",
  );
  expect(screen.getByText(/2 tasks for the platform waiting/)).toBeTruthy();
  expect(await screen.findByText("Older version: takes no tasks")).toBeTruthy();
  expect(screen.getByText("running orders/sync")).toBeTruthy();
});

// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TableView } from "./screens/Data.tsx";
import { WorkspaceAccess } from "./screens/Environments.tsx";
import { EventPage, ScriptPage } from "./screens/ObjectPages.tsx";
import { EventsWorkbench, TriggersWorkbench } from "./screens/Operate.tsx";
import { RunPage } from "./screens/RunPage.tsx";
import { show } from "./testing.tsx";

// What a member who only reads is still offered (GOV-37, fix-gating): each control that changes
// something sits on the one piece (`kit/Can.tsx`), is off, and a line says what it takes and whom
// to ask. The server answers `/allowed` with nothing held.

const base = "/tenants/t1";
const root = "/tenants/t1/workspaces/w1";
const link = "/t/t1/workspaces/w1";
let answers: Record<string, unknown>;

beforeEach(() => {
  answers = {};
  history.replaceState(null, "", `${link}/runs`);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("fetch", async (address: string) => {
    const path = address.replace("/api/v1", "");
    const body = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    if (path.includes("/allowed?")) return body({ allowed: [] });
    for (const [prefix, value] of Object.entries(answers)) {
      if (path.split("?")[0] === prefix) return body(value);
    }
    return body({ items: [] });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const off = (name: RegExp | string) =>
  screen.getAllByRole("button", { name }).every((control) => {
    const one = control as HTMLButtonElement;
    return one.disabled || (one.closest("fieldset") as HTMLFieldSetElement | null)?.disabled;
  });
const says = (permission: string) =>
  waitFor(() => expect(document.body.textContent).toContain(`It needs ${permission}`));

test("a workspace's access section offers a viewer neither Give access nor Remove", async () => {
  answers[`${base}/bindings`] = {
    items: [
      {
        id: "b1",
        principalLabel: "Rae",
        roleName: "viewer",
        resourceKind: null,
        resourcePath: null,
        managedByResource: false,
      },
    ],
  };
  show(<WorkspaceAccess base={base} workspace={{ id: "w1", name: "Main" }} />);
  await screen.findByText("Rae");
  await says("binding:write");
  expect(off("Give access")).toBe(true);
  expect(off("Remove")).toBe(true);
});

test("a table's page offers a viewer no Add row, and says what it takes", async () => {
  answers[`${root}/tables/clients`] = {
    id: "tb1",
    name: "clients",
    status: "active",
    managedIn: "ui",
    policy: { type: "open" },
    rowCount: 0,
    stored: { schema: "s", table: "t" },
    columns: [{ name: "name", type: "text", required: true, status: "active" }],
  };
  answers[`${root}/rows/clients`] = { items: [], nextCursor: null };
  show(<TableView root={root} name="clients" link={link} />);
  await says("data:write");
  expect(off("Add row")).toBe(true);
});

test("the events list offers a viewer no Publish an event, and says what it takes", async () => {
  show(<EventsWorkbench root={root} link={link} />);
  await says("event:write");
  expect(off("Publish an event")).toBe(true);
});

test("triggers offer a viewer no New trigger, and say what it takes", async () => {
  show(<TriggersWorkbench root={root} link={link} workspacePaused={false} production={false} />);
  await says("resource:write");
  expect(off("New trigger")).toBe(true);
});

test("a script page says why Run is off, and its triggers offer no Add a schedule", async () => {
  answers[`${root}/scripts`] = {
    items: [
      { path: "jobs/nightly", description: "", inputSchema: {}, deployed: true, lastRun: null },
    ],
  };
  show(<ScriptPage root={root} link={link} path="jobs/nightly" />);
  await says("run:write");
  expect(off(/^Run/)).toBe(true);
  fireEvent.click(await screen.findByRole("tab", { name: /Triggers/ }));
  await screen.findByRole("button", { name: "Add a schedule" });
  expect(off("Add a schedule")).toBe(true);
});

test("an event page says what publishing and changing it take", async () => {
  answers[`${root}/resources/orders/placed`] = {
    id: "r1",
    kind: "event",
    path: "orders/placed",
    body: {},
    ownership: "ui",
    version: 1,
    updatedAt: "2026-11-01T00:00:00Z",
  };
  show(<EventPage root={root} link={link} path="orders/placed" />);
  await says("event:write");
  expect(document.body.textContent).toContain("It needs resource:write");
});

test("a run's page offers a viewer neither Re-run nor Edit with this input", async () => {
  answers[root] = { id: "w1", name: "Main", slug: "main", type: "dev", linkedWorkspaceId: null };
  answers[`${root}/runs/r1`] = {
    id: "r1",
    script: "reminders/send",
    status: "failed",
    state: "failed",
    attempt: 1,
    maxAttempts: 1,
    trigger: { type: "manual" },
    startedBy: { type: "member", id: "m1" },
    bundleId: "b1",
    bundleVersion: 4,
    error: { message: "No." },
    errorSummary: "No.",
    tags: [],
    rerunOf: null,
    reruns: [],
    createdAt: "2026-11-14T10:00:00.000Z",
    startedAt: "2026-11-14T10:00:01.000Z",
    finishedAt: "2026-11-14T10:00:02.000Z",
    input: {},
    output: null,
    alert: null,
    pool: null,
    waitingFor: null,
    idempotencyKey: "k",
  };
  answers[`${root}/runs/r1/logs`] = { items: [], done: true };
  answers[`${root}/runs/r1/insight`] = {
    attempts: [],
    worker: null,
    timeoutSeconds: 30,
    uses: [],
    diagnosis: null,
  };
  show(<RunPage root={root} link={link} id="r1" />);
  await says("run:write");
  expect(off(/Re-run/)).toBe(true);
  await screen.findByRole("button", { name: "Edit with this input" });
  expect(off("Edit with this input")).toBe(true);
});

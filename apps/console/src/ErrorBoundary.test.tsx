// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Me } from "./api.ts";
import { ErrorBoundary } from "./kit/ErrorBoundary.tsx";
import { type State, StatePill, stateLabel, stateOf } from "./kit/status.tsx";
import { Shell } from "./Shell.tsx";
import { show } from "./testing.tsx";

const me: Me = {
  principal: { type: "member", id: "m1", name: "Ada", email: "ada@acme.test" },
  instancePermissions: [],
  tenants: [{ id: "t1", slug: "acme", name: "Acme" }],
};

const answers: Record<string, unknown> = {};
const asked: string[] = [];

beforeEach(() => {
  asked.length = 0;
  answers["/api/v1/tenants/t1/workspaces"] = {
    items: [{ id: "w1", name: "Main", slug: "main", type: "production" }],
  };
  answers["/api/v1/tenants/t1/summary"] = { workspaces: 1, members: 1 };
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    asked.push(url);
    const body = answers[url];
    return body === undefined
      ? new Response(JSON.stringify({ title: "Not found" }), { status: 404 })
      : new Response(JSON.stringify(body), { status: 200 });
  });
  // The boundary reports what it caught; keep the test output quiet.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Broken(): never {
  throw new Error("Cannot read properties of undefined (reading 'count')");
}

test("a screen that throws is replaced by a notice, and the navigation stays", async () => {
  show(
    <Shell me={me} path="/t/t1/workspaces/w1/runs" tenantId="t1" onSignOut={() => {}}>
      <Broken />
    </Shell>,
  );
  expect(await screen.findByText("This page could not be shown.")).toBeTruthy();
  expect(screen.getByText(/reading 'count'/)).toBeTruthy();
  expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Go back" })).toBeTruthy();
});

test("trying again renders what it wraps once more", () => {
  let fail = true;
  function Sometimes() {
    if (fail) throw new Error("Not yet");
    return <p>Back</p>;
  }
  render(
    <ErrorBoundary what="This panel" compact>
      <Sometimes />
    </ErrorBoundary>,
  );
  expect(screen.getByText("This panel could not be shown.")).toBeTruthy();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(screen.getByText("Back")).toBeTruthy();
});

test("a workspace summary without failedRuns keeps the shell up", async () => {
  answers["/api/v1/tenants/t1/workspaces/w1/summary"] = {
    drafts: 2,
    unboundConnections: 0,
    approvalsWaiting: 0,
    git: null,
    version: 3,
    linked: null,
  };
  show(
    <Shell me={me} path="/t/t1/workspaces/w1/runs" tenantId="t1" onSignOut={() => {}}>
      <p>Screen</p>
    </Shell>,
  );
  await waitFor(() => expect(asked).toContain("/api/v1/tenants/t1/workspaces/w1/summary"));
  expect(await screen.findByText("Screen")).toBeTruthy();
  expect(screen.queryByText(/could not be shown/)).toBeNull();
});

test("no page asks for a path that is null", async () => {
  const { rerender } = show(
    <Shell me={me} path="/t/t1" tenantId="t1" onSignOut={() => {}}>
      <p>Screen</p>
    </Shell>,
  );
  rerender(
    <Shell me={me} path="/t/t1/members" tenantId="t1" onSignOut={() => {}}>
      <p>Screen</p>
    </Shell>,
  );
  rerender(
    <Shell me={me} path="/account/api-keys" tenantId={undefined} onSignOut={() => {}}>
      <p>Screen</p>
    </Shell>,
  );
  await waitFor(() => expect(asked.length).toBeGreaterThan(0));
  expect(asked.filter((url) => url.includes("null"))).toEqual([]);
});

test("a state the console does not know shows as Unknown", () => {
  render(<StatePill state={"paused_by_operator" as State} />);
  expect(screen.getByText("Unknown")).toBeTruthy();
  expect(stateOf("paused_by_operator")).toBe("unknown");
  expect(stateOf("failed")).toBe("failed");
  expect(stateOf("toString")).toBe("unknown");
  expect(stateLabel("paused_by_operator" as State)).toBe("Unknown");
});

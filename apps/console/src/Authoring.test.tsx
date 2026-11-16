// @vitest-environment happy-dom
import { cleanup, configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Me } from "./api.ts";
import { nextEditorKey } from "./kit/editorKey.ts";
import { usePath } from "./router.tsx";
import { Tenant } from "./screens/Tenant.tsx";
import { show } from "./testing.tsx";

configure({ asyncUtilTimeout: 5000 });

const base = "/tenants/t1/workspaces/w1";
const me: Me = {
  principal: { type: "member", id: "m1", name: "Ada", email: "ada@acme.test" },
  instancePermissions: [],
  tenants: [{ id: "t1", slug: "acme", name: "Acme" }],
};
let routes: Record<string, (body: unknown) => unknown>;
let calls: { method: string; url: string }[];

beforeEach(() => {
  calls = [];
  routes = {
    [`GET ${base}`]: () => ({ id: "w1", slug: "dev", name: "Dev", type: "dev" }),
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
    const path = address.replace("/api/v1", "").split("?")[0] as string;
    calls.push({ method, url: path });
    const answer = routes[`${method} ${path}`];
    if (!answer && method === "GET" && path.startsWith(`${base}/drafts/`)) {
      return new Response(JSON.stringify({ title: "Not found" }), { status: 404 });
    }
    const value = answer ? answer(body) : method === "GET" ? { items: [] } : {};
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

/** The workspace screens at whatever the address says, as the console shows them. */
function AtAddress() {
  return <Tenant tenantId="t1" me={me} path={usePath()} />;
}

test("a new script's first save and run keeps the editor, and shows the run it started", async () => {
  routes[`PUT ${base}/drafts/hello/greet`] = (body) => ({
    ...(body as object),
    path: "hello/greet",
    revision: 1,
  });
  routes[`POST ${base}/test-runs`] = () => ({ runId: "r1" });
  routes[`GET ${base}/runs/r1`] = () => ({
    id: "r1",
    script: "hello/greet",
    status: "succeeded",
    state: "succeeded",
    attempt: 1,
    maxAttempts: 1,
    trigger: { type: "manual" },
    startedBy: { type: "member", id: "m1" },
    bundleId: null,
    bundleVersion: null,
    error: null,
    errorSummary: null,
    tags: [],
    rerunOf: null,
    reruns: [],
    createdAt: "2026-11-16T10:00:00.000Z",
    startedAt: "2026-11-16T10:00:01.000Z",
    finishedAt: "2026-11-16T10:00:02.000Z",
    input: {},
    output: { hello: "Ada" },
    alert: null,
    pool: null,
  });
  routes[`GET ${base}/runs/r1/logs`] = () => ({ items: [], done: true });
  routes[`GET ${base}/runs/r1/insight`] = () => ({
    attempts: [],
    worker: null,
    timeoutSeconds: 60,
    uses: [],
    diagnosis: null,
  });
  history.replaceState(null, "", "/t/t1/workspaces/w1/scripts/new");
  show(<AtAddress />);

  const code = await screen.findByLabelText("Source of the new script");
  fireEvent.change(screen.getByLabelText("Path"), { target: { value: "hello/greet" } });
  // Typing a path renames the code area. It is the same one, not a new editor.
  expect(screen.getByLabelText("Source of hello/greet")).toBe(code);

  fireEvent.click(screen.getByRole("tab", { name: "Try it" }));
  fireEvent.click(await screen.findByRole("button", { name: "Save and run" }));

  const run = await screen.findByRole("region", { name: "The test run" });
  expect(within(run).getByText("Test run")).toBeTruthy();
  expect(location.pathname).toBe("/t/t1/workspaces/w1/scripts/edit/hello/greet");
  // The editor that saved it is still there, and did not read back what it just saved.
  expect(screen.getByLabelText("Source of hello/greet")).toBe(code);
  await waitFor(() => expect(calls.some((one) => one.url === `${base}/test-runs`)).toBe(true));
  expect(
    calls.filter((one) => one.method === "GET" && one.url === `${base}/drafts/hello/greet`),
  ).toEqual([]);
});

test("only a first save keeps the editor: any other address opens a new one", () => {
  const at = (from: string, to: string) => nextEditorKey({ at: from, key: from }, to);
  expect(at("scripts/new", "scripts/edit/hello/greet")).toBe("scripts/new");
  expect(at("extensions/connector/new", "extensions/connector/edit/billing/stripe")).toBe(
    "extensions/connector/new",
  );
  expect(at("scripts/edit/a", "scripts/edit/b")).toBe("scripts/edit/b");
  expect(at("scripts/new", "extensions/connector/edit/a")).toBe("extensions/connector/edit/a");
  expect(at("extensions/connector/new", "extensions/trigger_source/edit/a")).toBe(
    "extensions/trigger_source/edit/a",
  );
});

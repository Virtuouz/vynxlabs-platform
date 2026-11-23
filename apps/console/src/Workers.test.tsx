// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Workers } from "./screens/Execution.tsx";
import { show } from "./testing.tsx";

const base = "/tenants/t1";
let routes: Record<string, (body: unknown) => unknown>;
let calls: { method: string; url: string; body: unknown }[];

beforeEach(() => {
  calls = [];
  routes = {};
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url: address, body });
    const path = address.replace("/api/v1", "").split("?")[0] as string;
    const answer = routes[`${method} ${path}`];
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
});

test("Workers says what the instance does from the state, not from the switch alone (GOV-23)", async () => {
  let state = "unavailable";
  let on = true;
  routes[`GET ${base}`] = () => ({ name: "Acme", slug: "acme", managedWorkers: on });
  routes[`PATCH ${base}`] = (body) => {
    on = (body as { managedWorkers: boolean }).managedWorkers;
    state = on ? "host" : "off";
    return {};
  };
  routes[`GET ${base}/managed-workers`] = () => ({ state });
  show(<Workers base={base} />);
  // The tenant allows it and the instance starts none for anyone: not "the instance starts workers".
  await screen.findByText(/starts no workers for any tenant/);
  expect(screen.queryByText(/The instance starts workers for the default pool/)).toBeNull();
  const reads = () => calls.filter((call) => call.url.endsWith("/managed-workers")).length;
  const before = reads();
  // Where the instance does start them, it says so, and turning the switch asks the state again.
  state = "host";
  fireEvent.click(screen.getByRole("button", { name: "Run only on our own workers" }));
  await screen.findByRole("button", { name: "Let the instance run workers" });
  await waitFor(() => expect(reads()).toBeGreaterThan(before));
  expect(screen.getByText("The instance starts no workers for this tenant.")).toBeTruthy();
});

test("where the instance would start workers and refuses, the line does not say it starts them (GOV-23)", async () => {
  routes[`GET ${base}`] = () => ({ name: "Acme", slug: "acme", managedWorkers: true });
  routes[`GET ${base}/managed-workers`] = () => ({ state: "refused" });
  show(<Workers base={base} />);
  await screen.findByText(/This tenant's code runs on standalone workers only/);
  expect(screen.queryByText(/The instance starts workers for the default pool/)).toBeNull();
  expect(screen.getByText(/would start workers for this tenant, and does not/)).toBeTruthy();
});

test("where the instance starts workers, the line says so (GOV-23)", async () => {
  routes[`GET ${base}`] = () => ({ name: "Acme", slug: "acme", managedWorkers: true });
  routes[`GET ${base}/managed-workers`] = () => ({ state: "host" });
  show(<Workers base={base} />);
  await screen.findByText("The instance starts workers for the default pool when there is work.");
});

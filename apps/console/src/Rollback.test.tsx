// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Deployments } from "./screens/Execution.tsx";
import { show } from "./testing.tsx";

let calls: { method: string; url: string; body: unknown }[];

const bundle = (version: number, active: boolean) => ({
  id: `b${version}`,
  version,
  digest: `${version}`.repeat(16),
  sdkVersion: "1",
  manifestCount: 3,
  active,
  createdAt: "2026-11-13T00:00:00Z",
});

beforeEach(() => {
  calls = [];
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({
      method,
      url: address,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const body = method === "GET" ? { items: [bundle(2, true), bundle(1, false)] } : {};
    return new Response(JSON.stringify(body), { status: 200 });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const root = "/tenants/t1/workspaces/w1";

test("rolling production back names the workspace and asks as a danger", async () => {
  show(<Deployments root={root} workspace={{ name: "Clinics", type: "production" }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Activate" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("Activate version 1 in Clinics?")).toBeTruthy();
  expect(within(dialog).getByText(/Clinics stops running what it runs now/)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Activate in production" }));
  await waitFor(() =>
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({ bundleId: "b1" }),
  );
});

test("in a dev workspace it still names the workspace, and is not worded as production", async () => {
  show(<Deployments root={root} workspace={{ name: "Sandbox", type: "dev" }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Activate" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("Activate version 1 in Sandbox?")).toBeTruthy();
  expect(within(dialog).queryByRole("button", { name: "Activate in production" })).toBeNull();
});

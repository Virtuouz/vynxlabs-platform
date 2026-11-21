// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ActivateVersion } from "./screens/Execution.tsx";
import { show } from "./testing.tsx";

let calls: { method: string; url: string; body: unknown }[];

beforeEach(() => {
  calls = [];
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    calls.push({
      method: init.method ?? "GET",
      url: address,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    return new Response("{}", { status: 200 });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const root = "/tenants/t1/workspaces/w1";

test("rolling production back names the workspace and asks as a danger", async () => {
  const done = vi.fn();
  show(
    <ActivateVersion
      root={root}
      workspace={{ name: "Clinics", type: "production" }}
      bundleId="b1"
      version={1}
      onDone={done}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Activate this version" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("Activate version 1 in Clinics?")).toBeTruthy();
  expect(within(dialog).getByText(/Clinics stops running what it runs now/)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Activate in production" }));
  await waitFor(() =>
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({ bundleId: "b1" }),
  );
  await waitFor(() => expect(done).toHaveBeenCalled());
});

test("in a dev workspace it still names the workspace, and is not worded as production", async () => {
  show(
    <ActivateVersion
      root={root}
      workspace={{ name: "Sandbox", type: "dev" }}
      bundleId="b1"
      version={1}
      onDone={() => {}}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Activate this version" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("Activate version 1 in Sandbox?")).toBeTruthy();
  expect(within(dialog).queryByRole("button", { name: "Activate in production" })).toBeNull();
});

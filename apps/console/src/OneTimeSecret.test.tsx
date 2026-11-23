// @vitest-environment happy-dom
import { cleanup, configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { OneTimeSecret } from "./kit/OneTimeSecret.tsx";
import { Workers } from "./screens/Execution.tsx";
import { answer, show } from "./testing.tsx";

configure({ asyncUtilTimeout: 5000 });

const copied: string[] = [];
let routes: Record<string, (body: unknown) => unknown>;

beforeEach(() => {
  copied.length = 0;
  routes = {};
  vi.stubGlobal("navigator", {
    ...navigator,
    clipboard: { writeText: async (text: string) => void copied.push(text) },
  });
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

test("a value shown once asks before it is closed uncopied, and not once it is copied", async () => {
  const done = vi.fn();
  show(<OneTimeSecret value="vx_live_abc" noun="key" onDone={done} />);
  expect(screen.getByText(/shown only once/)).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(await answer("Go back")).toContain("Close without copying the key?");
  expect(done).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  await answer("Close it");
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1));

  fireEvent.click(screen.getByRole("button", { name: "Copy the key" }));
  await waitFor(() => expect(copied).toEqual(["vx_live_abc"]));
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(done).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("a new worker credential comes with the command to start a worker, filled in", async () => {
  routes["GET /instance"] = () => ({ publicUrl: "https://platform.acme.test" });
  routes["GET /tenants/t1/queue"] = () => ({ items: [], tasks: [] });
  routes["POST /tenants/t1/worker-credentials"] = () => ({ id: "c1", token: "vxw_secret" });
  show(<Workers base="/tenants/t1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Create credential" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Warehouse" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create credential" }));

  // The credential goes in on standard input, never on the command line (GOV-36).
  const command =
    "printf '%s\\n' 'vxw_secret' | volvel-worker --url https://platform.acme.test --token-stdin";
  expect(await screen.findByText(command)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Copy the command" }));
  await waitFor(() => expect(copied).toEqual([command]));
  expect(screen.getByRole("button", { name: "Copy the credential" })).toBeTruthy();
});

// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DeployVersion, versionMove } from "./screens/Execution.tsx";
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
    <DeployVersion
      root={root}
      workspace={{ name: "Clinics", type: "production" }}
      bundleId="b1"
      version={1}
      running={2}
      onDone={done}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Roll back to this version" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("Roll back Clinics to version 1?")).toBeTruthy();
  expect(within(dialog).getByText(/Clinics stops running what it runs now/)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Roll back in production" }));
  await waitFor(() =>
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({ bundleId: "b1" }),
  );
  await waitFor(() => expect(done).toHaveBeenCalled());
});

test("in a dev workspace it still names the workspace, and is not worded as production", async () => {
  show(
    <DeployVersion
      root={root}
      workspace={{ name: "Sandbox", type: "dev" }}
      bundleId="b1"
      version={3}
      running={2}
      onDone={() => {}}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Deploy this version" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("Deploy version 3 to Sandbox?")).toBeTruthy();
  expect(within(dialog).queryByRole("button", { name: "Deploy in production" })).toBeNull();
});

test("an activation the server took for a rename done wrong can be allowed by name (REL-10)", async () => {
  const done = vi.fn();
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method: init.method ?? "GET", url: address, body });
    if (body && !body.allowDelete) {
      return new Response(
        JSON.stringify({
          code: "rename_suspected",
          detail: "This deploy would delete something that holds history.",
          errors: [{ path: "orders/old", message: 'the script "orders/old" has runs' }],
        }),
        { status: 409 },
      );
    }
    return new Response("{}", { status: 201 });
  });
  show(
    <DeployVersion
      root={root}
      workspace={{ name: "Sandbox", type: "dev" }}
      bundleId="b1"
      version={3}
      running={2}
      onDone={done}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Deploy this version" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Deploy" }));
  const second = await screen.findByText("Delete orders/old in Sandbox?");
  expect(second).toBeTruthy();
  fireEvent.click(await screen.findByRole("button", { name: "Delete them and look again" }));
  await waitFor(() => expect(done).toHaveBeenCalled());
  expect(calls.filter((call) => call.method === "POST").map((call) => call.body)).toEqual([
    { bundleId: "b1" },
    { bundleId: "b1", allowDelete: ["orders/old"] },
  ]);
});

test("a rollback that would replace what was changed here says so in the console's words, and goes through only when asked again", async () => {
  const done = vi.fn();
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method: init.method ?? "GET", url: address, body });
    if (body && !body.force) {
      return new Response(
        JSON.stringify({
          code: "console_changed",
          detail: "Run `volvel pull`, review, commit, and deploy again.",
          errors: [
            {
              path: "limit",
              message:
                "changed in the console since the repository last had it, and this deploy would replace it",
            },
            {
              path: "extra",
              message:
                "made in the console since the repository last had it, and this deploy would remove it",
            },
          ],
        }),
        { status: 409 },
      );
    }
    return new Response("{}", { status: 201 });
  });
  show(
    <DeployVersion
      root={root}
      workspace={{ name: "Sandbox", type: "dev" }}
      bundleId="b1"
      version={1}
      running={2}
      onDone={done}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Roll back to this version" }));
  fireEvent.click(await screen.findByRole("button", { name: "Roll back" }));
  const second = await screen.findByRole("dialog");
  expect(within(second).getByText("Roll back Sandbox anyway?")).toBeTruthy();
  expect(second.textContent).toContain("replaced by version 1: limit");
  expect(second.textContent).toContain("removed by version 1: extra");
  expect(second.textContent).not.toContain("volvel pull");
  fireEvent.click(within(second).getByRole("button", { name: "Roll back anyway" }));
  await waitFor(() => expect(done).toHaveBeenCalled());
  expect(calls.filter((call) => call.method === "POST").map((call) => call.body)).toEqual([
    { bundleId: "b1" },
    { bundleId: "b1", force: true },
  ]);
});

test("VOC-45: one function decides Deploy or Roll back from the numbers", () => {
  expect(versionMove(1, 2)).toBe("roll_back");
  expect(versionMove(3, 2)).toBe("deploy");
  expect(versionMove(2, 2)).toBe("deploy");
  expect(versionMove(1, null)).toBe("deploy");
});

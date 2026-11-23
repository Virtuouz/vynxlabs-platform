// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { EndUserGroups, Groups } from "./screens/Groups.tsx";
import { show } from "./testing.tsx";

const base = "/tenants/t1";
type Reply = [number, unknown];
let routes: ((method: string, url: string, body: unknown) => Reply | undefined)[];
let calls: { method: string; url: string; body: unknown }[];

beforeEach(() => {
  calls = [];
  routes = [];
  history.replaceState(null, "", "/t/t1/members");
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url: address, body });
    for (const route of routes) {
      const found = route(method, address, body);
      if (found) return new Response(JSON.stringify(found[1]), { status: found[0] });
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("ACC-23: a change that waits closes the form, says it waits and leads to Releases, and is asked once", async () => {
  routes.push((method, url) =>
    method === "POST" && url.endsWith("/groups")
      ? [
          202,
          {
            waiting: true,
            detail: "Release 4 waits for a second person to approve it.",
            release: { id: "r4", number: 4, status: "awaiting_approval" },
          },
        ]
      : undefined,
  );
  show(<Groups base={base} />);
  fireEvent.click(await screen.findByRole("button", { name: "Create group" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Finance" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create group" }));
  expect(await screen.findByText(/waits for a second person/)).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByRole("link", { name: "Open Releases" }).getAttribute("href")).toBe(
    "/t/t1/releases",
  );
  expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
});

// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { EndUserGroups, Groups } from "./screens/Groups.tsx";
import { MemberList } from "./screens/Members.tsx";
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

const roleList = [
  { id: "r-viewer", name: "viewer", builtin: true },
  { id: "r-editor", name: "editor", builtin: true },
];

test("ACC-32, ACC-MP7: where someone works is asked only with a role, and several roles go with the membership", async () => {
  routes.push((method, url) => {
    if (method === "GET" && url.includes("/roles")) return [200, { items: roleList }];
    if (method === "GET" && url.includes("/workspaces"))
      return [200, { items: [{ id: "w1", name: "Main" }] }];
    if (method === "GET" && url.includes("/members?"))
      return [200, { items: [], nextCursor: null }];
    if (method === "POST" && url.endsWith("/members")) return [201, { id: "m9" }];
    return undefined;
  });
  show(<MemberList base={base} />);
  fireEvent.click(await screen.findByRole("button", { name: "Add member" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Email"), { target: { value: "bo@acme.test" } });
  // No role: nothing to say where it applies.
  expect(within(dialog).queryByLabelText("Where they work")).toBeNull();
  fireEvent.change(await within(dialog).findByLabelText("Role"), { target: { value: "r-viewer" } });
  fireEvent.change(within(dialog).getByLabelText("Where they work"), { target: { value: "w1" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add another role" }));
  fireEvent.change(within(dialog).getByLabelText("Role 2"), { target: { value: "r-editor" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add member" }));
  await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
  expect(calls.find((c) => c.method === "POST")?.body).toEqual({
    email: "bo@acme.test",
    bindings: [{ roleId: "r-viewer", workspaceId: "w1" }, { roleId: "r-editor" }],
  });
});

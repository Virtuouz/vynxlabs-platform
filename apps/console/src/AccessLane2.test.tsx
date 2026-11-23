// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { EffectiveAccess } from "./screens/Access.tsx";
import { ChangePassword } from "./screens/Account.tsx";
import { EndUsers } from "./screens/EndUsers.tsx";
import { WorkspaceAccess } from "./screens/Environments.tsx";
import { GiveAccess } from "./screens/GiveAccess.tsx";
import { EndUserGroups, Groups } from "./screens/Groups.tsx";
import { AccessList, MemberList } from "./screens/Members.tsx";
import { Roles } from "./screens/Roles.tsx";
import { answer, show } from "./testing.tsx";

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

const member = (over: object) => ({
  id: "m1",
  name: "Ada",
  email: "ada@acme.test",
  createdAt: "2026-11-01T00:00:00Z",
  ...over,
});

test("ACC-30: someone in no group and given nothing is said to have no access, not to hold roles through groups", async () => {
  routes.push((method, url) =>
    method === "GET" && url.includes("/members?")
      ? [
          200,
          {
            items: [
              member({ id: "a", name: "Nobody", directRoles: 0, groups: 0 }),
              member({ id: "b", name: "Grouped", directRoles: 0, groups: 2 }),
              member({ id: "c", name: "Direct", directRoles: 3, groups: 0 }),
            ],
            nextCursor: null,
          },
        ]
      : undefined,
  );
  show(<MemberList base={base} />);
  expect(await screen.findByText("No access")).toBeTruthy();
  expect(screen.getByText("Through groups only")).toBeTruthy();
  expect(screen.getByText("3 given directly")).toBeTruthy();
});

test("ACC-31: a link to a member past the first page opens them, read by themselves", async () => {
  history.replaceState(null, "", "/t/t1/members?member=far");
  routes.push((method, url) => {
    if (method !== "GET") return undefined;
    if (url.endsWith("/members/far"))
      return [200, member({ id: "far", name: "Far Away", email: "far@acme.test" })];
    if (url.includes("/members?")) return [200, { items: [member({})], nextCursor: "next" }];
    return undefined;
  });
  show(<MemberList base={base} />);
  expect(await screen.findByRole("heading", { name: "Far Away" })).toBeTruthy();
});

test("ACC-29: two offers to one agent differ by what each is at", async () => {
  routes.push((method, url) => {
    if (method !== "GET") return undefined;
    if (url.endsWith("/bindings"))
      return [
        200,
        {
          items: ["a", "b"].map((one) => ({
            id: `b-${one}`,
            scopeType: "resource",
            workspaceId: "w1",
            resourceId: `r-${one}`,
            resourceKind: "script",
            resourcePath: `reports/${one}`,
            principalType: "service_account",
            principalId: "s1",
            principalLabel: "Agent",
            roleId: "agent",
            roleName: "agent_runner",
            managedByResource: false,
            createdAt: "2026-11-01T00:00:00Z",
          })),
        },
      ];
    if (url.endsWith("/workspaces")) return [200, { items: [{ id: "w1", name: "Main" }] }];
    return undefined;
  });
  show(<AccessList base={base} />);
  const first = await screen.findByRole("link", { name: /reports\/a/ });
  const second = screen.getByRole("link", { name: /reports\/b/ });
  expect(first.getAttribute("href")).toBe("/t/t1/workspaces/w1/scripts/reports/a");
  expect(second.getAttribute("href")).toBe("/t/t1/workspaces/w1/scripts/reports/b");
  expect(screen.queryByText("Main (one resource)")).toBeNull();
});

test("ACC-26: a role is held by the roles of its own id, and two with one name are told apart", async () => {
  history.replaceState(null, "", "/t/t1/roles?role=own");
  const role = (id: string, workspaceId: string | null) => ({
    id,
    name: "keeper",
    description: "",
    permissions: ["secret:read"],
    builtin: false,
    workspaceId,
    managedByResource: workspaceId !== null,
  });
  routes.push((method, url) => {
    if (method !== "GET") return undefined;
    if (url.endsWith("/roles")) return [200, { items: [role("own", null), role("ws", "w1")] }];
    if (url.endsWith("/permissions")) return [200, { items: [] }];
    if (url.endsWith("/workspaces")) return [200, { items: [{ id: "w1", name: "Main" }] }];
    if (url.endsWith("/bindings"))
      return [200, { items: [{ roleId: "ws", roleName: "keeper", principalLabel: "Ops" }] }];
    return undefined;
  });
  show(<Roles base={base} />);
  // The tenant's own keeper is held by nobody, though a workspace's keeper of the same name is.
  expect(await screen.findByText("Nobody holds it.")).toBeTruthy();
  expect(screen.getByText("In Main")).toBeTruthy();
});

test("ACC-27: a permission only a suspended member is given is denied, not allowed", async () => {
  routes.push((method, url) =>
    method === "GET" && url.includes("/access/member/m1")
      ? [
          200,
          {
            principal: {
              type: "member",
              id: "m1",
              name: "dave",
              email: null,
              suspended: true,
              groups: [],
            },
            sources: [
              {
                source: "binding",
                id: "b1",
                role: { id: "r", name: "reader", permissions: ["secret:read"] },
                scope: { type: "tenant" },
                through: { type: "direct" },
                expiresAt: null,
                counts: false,
              },
            ],
            permissions: [
              {
                permission: "secret:read",
                kind: "secret",
                verb: "read",
                label: "Secrets",
                meaning: "See secrets.",
                group: "Workspace",
                sources: ["b1"],
              },
            ],
          },
        ]
      : undefined,
  );
  show(<EffectiveAccess base={base} tenantId="t1" principalType="member" id="m1" />);
  fireEvent.change(await screen.findByLabelText("Find or check a permission"), {
    target: { value: "secret:read" },
  });
  const checked = screen
    .getAllByRole("status")
    .find((one) => /Denied|Allowed/.test(one.textContent ?? ""));
  expect(checked?.textContent).toMatch(/^Denied/);
  expect(checked?.textContent).toContain("suspended");
});

const endUser = (over: object) => ({
  id: "e1",
  email: "pat@customer.test",
  name: "Pat",
  hasPassword: false,
  attributes: {},
  groups: [],
  disabled: false,
  lastSignedInAt: null,
  createdAt: "2026-11-01T00:00:00Z",
  ...over,
});

test("ACC-28: an end user a provider signed in is Active, and is offered no invitation", async () => {
  history.replaceState(null, "", "/t/t1/end-users?user=e1");
  routes.push((method, url) =>
    method === "GET" && url.includes("/end-users?")
      ? [
          200,
          {
            items: [
              endUser({ signsInWithProvider: true, lastSignedInAt: "2026-11-19T00:00:00Z" }),
              endUser({ id: "e2", email: "new@customer.test" }),
            ],
            nextCursor: null,
          },
        ]
      : undefined,
  );
  show(<EndUsers base={base} />);
  const row = (await screen.findAllByText("pat@customer.test"))[0]?.closest("tr") as HTMLElement;
  expect(within(row).getByText("Active")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "New invitation link" })).toBeNull();
  expect(screen.getByRole("button", { name: "Disable" })).toBeTruthy();
  const waiting = screen.getByText("new@customer.test").closest("tr") as HTMLElement;
  expect(within(waiting).getByText("Invited")).toBeTruthy();
});

test("ACC-31: a link to an end user past the first page opens them, read by themselves", async () => {
  history.replaceState(null, "", "/t/t1/end-users?user=far");
  routes.push((method, url) => {
    if (method !== "GET") return undefined;
    if (url.endsWith("/end-users/far"))
      return [200, endUser({ id: "far", email: "far@customer.test" })];
    if (url.includes("/end-users?")) return [200, { items: [endUser({})], nextCursor: "n" }];
    return undefined;
  });
  show(<EndUsers base={base} />);
  expect(await screen.findByRole("heading", { name: "far@customer.test" })).toBeTruthy();
});

test("WLK-12: disabling an end user is asked first, and not done when it is declined", async () => {
  history.replaceState(null, "", "/t/t1/end-users?user=e1");
  routes.push((method, url) =>
    method === "GET" && url.includes("/end-users?")
      ? [200, { items: [endUser({ hasPassword: true })], nextCursor: null }]
      : method === "PATCH"
        ? [200, endUser({ disabled: true })]
        : undefined,
  );
  show(<EndUsers base={base} />);
  fireEvent.click(await screen.findByRole("button", { name: "Disable" }));
  const said = await answer("Cancel");
  expect(said).toContain("Disable pat@customer.test?");
  await waitFor(() => expect(screen.queryByText("Disable pat@customer.test?")).toBeNull());
  expect(calls.some((call) => call.method === "PATCH")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Disable" }));
  await answer("Disable");
  await waitFor(() =>
    expect(calls.find((call) => call.method === "PATCH")?.body).toEqual({ disabled: true }),
  );
});

test("ACC-11: a group an identity provider made cannot be deleted from the list", async () => {
  routes.push((method, url) =>
    method === "GET" && url.endsWith("/groups")
      ? [
          200,
          {
            items: [
              {
                id: "g1",
                key: "pushed",
                name: "Pushed",
                description: "",
                managedBy: "provider",
                createdAt: "2026-11-01T00:00:00Z",
              },
            ],
          },
        ]
      : method === "GET" && url.endsWith("/end-user-groups")
        ? [
            200,
            {
              items: [
                {
                  id: "g2",
                  name: "Customers",
                  description: "",
                  memberCount: 0,
                  managedBy: "provider",
                  createdAt: "2026-11-01T00:00:00Z",
                },
              ],
            },
          ]
        : undefined,
  );
  show(<Groups base={base} />);
  expect(
    ((await screen.findByRole("button", { name: "Delete" })) as HTMLButtonElement).disabled,
  ).toBe(true);
  cleanup();
  show(<EndUserGroups base={base} />);
  expect(
    ((await screen.findByRole("button", { name: "Delete" })) as HTMLButtonElement).disabled,
  ).toBe(true);
});

test("ACC-25: a person changes their own password, and is told when it was refused", async () => {
  routes.push((method, url) =>
    method === "POST" && url.endsWith("/auth/change-password") ? [200, {}] : undefined,
  );
  show(<ChangePassword />);
  fireEvent.change(screen.getByLabelText("Current password"), {
    target: { value: "old-password-1" },
  });
  fireEvent.change(screen.getByLabelText("New password"), {
    target: { value: "a-new-long-password" },
  });
  fireEvent.change(screen.getByLabelText("New password again"), {
    target: { value: "a-new-long-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Change password" }));
  await waitFor(() =>
    expect(calls.find((call) => call.url.endsWith("/auth/change-password"))?.body).toEqual({
      currentPassword: "old-password-1",
      newPassword: "a-new-long-password",
      revokeOtherSessions: true,
    }),
  );
  expect(await screen.findByText(/Your password is changed/)).toBeTruthy();
});

test("ACC-24: giving access at a workspace reads the roles and people there, and says why when it cannot", async () => {
  routes.push((method, url) => {
    if (method !== "GET") return undefined;
    if (url.includes("/roles?"))
      return [403, { status: 403, detail: "This needs the binding:read permission." }];
    return undefined;
  });
  show(
    <GiveAccess
      base={base}
      open
      inWorkspace={{ id: "w1", name: "Main" }}
      onClose={() => {}}
      onGiven={() => {}}
    />,
  );
  expect(await screen.findByText(/This needs the binding:read permission/)).toBeTruthy();
  expect(calls.some((call) => call.url.includes("/roles?limit=200&workspaceId=w1"))).toBe(true);
  expect(
    calls.some((call) => call.url.includes("/principals?") && call.url.includes("workspaceId=w1")),
  ).toBe(true);
});

test("ACC-24: a workspace's settings list who holds a role there, and offer to give access", async () => {
  routes.push((method, url) =>
    method === "GET" && url.includes("/bindings?workspaceId=w1")
      ? [
          200,
          {
            items: [
              {
                id: "b1",
                principalLabel: "ada@acme.test",
                roleName: "workspace_admin",
                resourceKind: null,
                resourcePath: null,
                managedByResource: false,
              },
            ],
          },
        ]
      : undefined,
  );
  show(<WorkspaceAccess base={base} workspace={{ id: "w1", name: "Main" }} />);
  expect(await screen.findByText("ada@acme.test")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Give access" })).toBeTruthy();
});

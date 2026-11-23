// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { EndUsers } from "./screens/EndUsers.tsx";
import { AttributesDialog, EndUserGroups, Groups } from "./screens/Groups.tsx";
import { MemberList } from "./screens/Members.tsx";
import { Tenant } from "./screens/Tenant.tsx";
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

const deskGroup = {
  id: "g1",
  key: "desk",
  name: "Desk",
  description: "",
  managedBy: "release",
  createdAt: "2026-11-01T00:00:00Z",
};

test("ACC-34: taking someone out of a group asks first, and nothing is sent before the answer", async () => {
  routes.push((method, url) => {
    if (method === "GET" && url.endsWith("/groups")) return [200, { items: [deskGroup] }];
    if (method === "GET" && url.endsWith("/groups/g1"))
      return [200, { members: [{ id: "m1", email: "ada@acme.test", name: "Ada" }] }];
    if (method === "DELETE") return [204, null];
    return undefined;
  });
  show(<Groups base={base} />);
  fireEvent.click(await screen.findByRole("button", { name: "Members" }));
  fireEvent.click(await screen.findByRole("button", { name: "Take ada@acme.test out" }));
  const said = await answer("Take out");
  expect(said).toContain("lose whatever Desk gives");
  await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
});

test("ACC-34: not confirming sends nothing", async () => {
  routes.push((method, url) => {
    if (method === "GET" && url.endsWith("/groups")) return [200, { items: [deskGroup] }];
    if (method === "GET" && url.endsWith("/groups/g1"))
      return [200, { members: [{ id: "m1", email: "ada@acme.test", name: "Ada" }] }];
    return undefined;
  });
  show(<Groups base={base} />);
  fireEvent.click(await screen.findByRole("button", { name: "Members" }));
  fireEvent.click(await screen.findByRole("button", { name: "Take ada@acme.test out" }));
  const sure = await screen.findByText(/lose whatever Desk gives/);
  expect(sure).toBeTruthy();
  expect(calls.some((c) => c.method === "DELETE")).toBe(false);
});

test("ACC-33: an attribute name given twice is named at its field and nothing is sent; spaces are dropped", async () => {
  show(
    <AttributesDialog
      base={base}
      open
      user={{ id: "u1", email: "pat@x.test", attributes: { customer: "a" } }}
      onClose={() => {}}
      onSaved={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add an attribute" }));
  fireEvent.change(screen.getByLabelText("Name", { selector: '[name="name-1"]' }), {
    target: { value: " customer " },
  });
  expect(await screen.findByText(/customer is given twice/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  fireEvent.change(screen.getByLabelText("Name", { selector: '[name="name-1"]' }), {
    target: { value: " region " },
  });
  fireEvent.change(screen.getByLabelText("Value", { selector: '[name="value-1"]' }), {
    target: { value: "eu" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
  expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
    attributes: { customer: "a", region: "eu" },
  });
});

test("ACC-MP8: a group can say what it is for when made and afterwards", async () => {
  routes.push((method, url) => {
    if (method === "GET" && url.endsWith("/groups")) return [200, { items: [deskGroup] }];
    if (method === "POST" && url.endsWith("/groups")) return [201, { id: "g2" }];
    return undefined;
  });
  show(<Groups base={base} />);
  fireEvent.click(await screen.findByRole("button", { name: "Create group" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Finance" } });
  fireEvent.change(within(dialog).getByLabelText("What it is for"), {
    target: { value: "The money people" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create group" }));
  await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
  expect(calls.find((c) => c.method === "POST")?.body).toEqual({
    name: "Finance",
    description: "The money people",
  });
  fireEvent.click(await screen.findByRole("button", { name: "Describe" }));
  await answer("Save", "Front desk staff");
  await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
  expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
    description: "Front desk staff",
  });
});

test("ACC-MP9: a service account is renamed in place, and its fixed key is shown", async () => {
  routes.push((method, url) =>
    method === "GET" && url.endsWith("/service-accounts")
      ? [
          200,
          {
            items: [
              {
                id: "s1",
                key: "ci",
                name: "ci",
                description: "Deploys",
                createdAt: "2026-11-01T00:00:00Z",
              },
            ],
          },
        ]
      : undefined,
  );
  const me = {
    principal: { id: "m1", type: "member" },
    tenants: [{ id: "t1", name: "Acme", slug: "acme" }],
    instancePermissions: [],
  } as never;
  show(<Tenant tenantId="t1" me={me} path="/t/t1/service-accounts/s1" />);
  expect(await screen.findByText("Key")).toBeTruthy();
  fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "pipeline" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
  expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ name: "pipeline" });
});

const pat = {
  id: "u1",
  email: "pat@x.test",
  name: "Pat",
  hasPassword: true,
  attributes: {},
  groups: [],
  disabled: false,
  lastSignedInAt: "2026-11-02T00:00:00Z",
  createdAt: "2026-11-01T00:00:00Z",
};

test("ACC-MP10, ACC-MP11: an end user is renamed, and a link is built on the address chosen", async () => {
  history.replaceState(null, "", "/t/t1/end-users?user=u1");
  routes.push((method, url) => {
    if (method === "GET" && url.includes("/end-users?"))
      return [200, { items: [pat], nextCursor: null }];
    if (method === "GET" && url.endsWith("/domains"))
      return [
        200,
        {
          items: [
            { id: "d1", hostname: "portal.acme.test", enabled: true },
            { id: "d2", hostname: "old.acme.test", enabled: false },
          ],
        },
      ];
    if (method === "POST" && url.endsWith("/links"))
      return [
        201,
        {
          url: "https://portal.acme.test/reset/abc",
          expiresAt: "2026-11-30T00:00:00Z",
          emailed: false,
        },
      ];
    return undefined;
  });
  show(<EndUsers base={base} />);
  fireEvent.click(await screen.findByRole("button", { name: "Rename" }));
  await answer("Rename", "Patricia");
  await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
  expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ name: "Patricia" });
  fireEvent.click(await screen.findByRole("button", { name: "Password reset link" }));
  const dialog = await screen.findByRole("dialog");
  const choices = within(dialog).getByLabelText("On which address") as HTMLSelectElement;
  expect([...choices.options].map((o) => o.text)).toEqual([
    "This instance's own address",
    "portal.acme.test",
  ]);
  fireEvent.change(choices, { target: { value: "d1" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Make link" }));
  await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
  expect(calls.find((c) => c.method === "POST")?.body).toEqual({
    purpose: "reset",
    domainId: "d1",
  });
});

test("ACC-MP12: a group of end users shows its key and who made it", async () => {
  routes.push((method, url) =>
    method === "GET" && url.endsWith("/end-user-groups")
      ? [
          200,
          {
            items: [
              {
                id: "e1",
                key: "front-desk",
                name: "Front desk",
                description: "",
                memberCount: 2,
                managedBy: "provider",
              },
            ],
          },
        ]
      : undefined,
  );
  show(<EndUserGroups base={base} />);
  expect(await screen.findByText("front-desk")).toBeTruthy();
  expect(screen.getByText("Identity provider")).toBeTruthy();
});

test("ACC-MP19: an operator's grant takes any length from 1 to 1440 minutes, by choosing Other", async () => {
  routes.push((method, url) =>
    method === "POST" && url.endsWith("/access-grants") ? [201, { id: "g1" }] : undefined,
  );
  const me = {
    principal: { id: "op1", type: "member" },
    tenants: [],
    instancePermissions: ["tenant:write"],
  } as never;
  show(<Tenant tenantId="t1" me={me} path="/t/t1/overview" />);
  fireEvent.click(await screen.findByRole("button", { name: "Open operator access" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Ticket 7" } });
  fireEvent.change(within(dialog).getByLabelText("Duration"), { target: { value: "other" } });
  fireEvent.change(within(dialog).getByLabelText("Minutes"), { target: { value: "2000" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Open operator access" }));
  expect(await within(dialog).findByText(/Give a whole number/)).toBeTruthy();
  expect(calls.some((c) => c.method === "POST")).toBe(false);
  fireEvent.change(within(dialog).getByLabelText("Minutes"), { target: { value: "90" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Open operator access" }));
  await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
  expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ durationMinutes: 90 });
});

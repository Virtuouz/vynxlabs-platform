// @vitest-environment happy-dom
import { cleanup, fireEvent, renderHook, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useRememberPlace } from "./App.tsx";
import { Account } from "./screens/Account.tsx";
import { InstanceMembers } from "./screens/Instance.tsx";
import { SignIn } from "./screens/SignIn.tsx";
import { Tenants } from "./screens/Tenants.tsx";
import { answer, show } from "./testing.tsx";

type Handler = (body: unknown, headers: Headers) => [number, unknown];
let routes: Record<string, Handler>;
let calls: { method: string; url: string; body: unknown; headers: Headers }[];

beforeEach(() => {
  calls = [];
  routes = {};
  history.replaceState(null, "", "/");
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    const headers = new Headers(init.headers);
    calls.push({ method, url, body, headers });
    const handler = routes[`${method} ${url}`];
    const [status, answered] = handler
      ? handler(body, headers)
      : [404, { status: 404, detail: `No mock for ${url}` }];
    return new Response(answered === null ? "" : JSON.stringify(answered), { status });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("an API key is told apart by its first characters and its last four", async () => {
  routes["GET /api/v1/api-keys"] = () => [
    200,
    {
      items: [
        {
          id: "k1",
          name: "Laptop",
          prefix: "vx_abc",
          suffix: "9f2e",
          expiresAt: null,
          lastUsedAt: null,
          revokedAt: null,
          createdAt: "2026-11-01T00:00:00.000Z",
        },
        {
          id: "k2",
          name: "Old",
          prefix: "vx_old",
          suffix: null,
          expiresAt: null,
          lastUsedAt: null,
          revokedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    },
  ];
  routes["GET /api/v1/me/recovery-codes"] = () => [200, { eligible: false, left: 0, madeAt: null }];
  show(<Account />);
  expect(await screen.findByText("vx_abc…9f2e")).toBeTruthy();
  expect(screen.getByText("vx_old…")).toBeTruthy();
  // Not a tenant's owner: there are no recovery codes to make.
  await waitFor(() =>
    expect(calls.some((call) => call.url.endsWith("/recovery-codes"))).toBe(true),
  );
  expect(screen.queryByText("Recovery codes")).toBeNull();
});

test("an owner makes recovery codes, sees them once, and is asked before replacing them", async () => {
  let made: string | null = null;
  routes["GET /api/v1/api-keys"] = () => [200, { items: [] }];
  routes["GET /api/v1/me/recovery-codes"] = () => [
    200,
    { eligible: true, left: made ? 10 : 0, madeAt: made },
  ];
  routes["POST /api/v1/me/recovery-codes"] = () => {
    made = "2026-11-13T10:00:00.000Z";
    return [201, { codes: ["aaaa-bbbb", "cccc-dddd"] }];
  };
  show(<Account />);
  fireEvent.click(await screen.findByRole("button", { name: "Make recovery codes" }));
  const shown = await screen.findByRole("list", { name: "New recovery codes" });
  expect(
    within(shown)
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(["aaaa-bbbb", "cccc-dddd"]);
  fireEvent.click(screen.getByRole("button", { name: "I have kept them" }));
  expect(screen.queryByRole("list", { name: "New recovery codes" })).toBeNull();
  expect(screen.getByText("10")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Make new codes" }));
  expect(await answer("Cancel")).toContain("stop working");
  expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
});

test("while the organization's sign-in is required, an owner can sign in with a recovery code", async () => {
  routes["GET /api/v1/sso/providers?email=olive%40acme.example"] = () => [
    200,
    { providers: [{ id: "p1", name: "Acme Login", url: "/api/v1/sso/p1/start" }], password: false },
  ];
  routes["POST /api/v1/auth/sign-in/email"] = (_body, headers) =>
    headers.get("x-recovery-code") === "aaaa-bbbb"
      ? [200, { token: "x" }]
      : [403, { code: "SSO_REQUIRED", message: "Sign in with Acme Login." }];
  const signedIn = vi.fn();
  show(<SignIn onSignedIn={signedIn} />);
  fireEvent.input(screen.getByLabelText("Email"), { target: { value: "olive@acme.example" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(await screen.findByRole("button", { name: "Use a recovery code" }));
  fireEvent.input(screen.getByLabelText("Password"), { target: { value: "her-password" } });
  fireEvent.input(screen.getByLabelText(/Recovery code/), { target: { value: "wrong" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in with the recovery code" }));
  expect((await screen.findByRole("alert")).textContent).toContain("works once");
  expect(signedIn).not.toHaveBeenCalled();

  fireEvent.input(screen.getByLabelText(/Recovery code/), { target: { value: " aaaa-bbbb " } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in with the recovery code" }));
  await waitFor(() => expect(signedIn).toHaveBeenCalled());
  expect(calls.at(-1)?.body).toEqual({ email: "olive@acme.example", password: "her-password" });
});

test("where a member is is sent once it settles, and only when it changes", async () => {
  vi.useFakeTimers();
  routes["PUT /api/v1/me/recent"] = () => [204, null];
  const sent = () => calls.filter((call) => call.url === "/api/v1/me/recent");
  const { rerender } = renderHook(({ path }) => useRememberPlace(true, path), {
    initialProps: { path: "/t/t1/workspaces/w1/flows" },
  });
  rerender({ path: "/t/t1/workspaces/w1/runs" });
  await vi.advanceTimersByTimeAsync(1000);
  expect(sent().map((call) => call.body)).toEqual([{ tenantId: "t1", workspaceId: "w1" }]);
  // Moving within the workspace sends nothing more.
  rerender({ path: "/t/t1/workspaces/w1/scripts" });
  await vi.advanceTimersByTimeAsync(1000);
  expect(sent()).toHaveLength(1);
  // Passing through a workspace on the way to another sends only the last.
  rerender({ path: "/t/t1/workspaces/w2/flows" });
  rerender({ path: "/t/t1/members" });
  await vi.advanceTimersByTimeAsync(1000);
  expect(sent().map((call) => call.body)).toEqual([
    { tenantId: "t1", workspaceId: "w1" },
    { tenantId: "t1", workspaceId: null },
  ]);
});

test("tenants are found by name, and one opens in the inspector", async () => {
  routes["GET /api/v1/tenants?limit=200"] = () => [
    200,
    {
      items: [
        {
          id: "t1",
          slug: "acme",
          name: "Acme Corp",
          dataLocation: null,
          createdAt: "2026-11-11T00:00:00.000Z",
        },
        {
          id: "t2",
          slug: "globex",
          name: "Globex",
          dataLocation: "eu",
          createdAt: "2026-11-11T00:00:00.000Z",
        },
      ],
    },
  ];
  show(
    <Tenants
      me={{
        principal: { type: "member", id: "m1", name: "Op", email: "op@example.com" },
        instancePermissions: ["tenant:*"],
        tenants: [{ id: "t1", slug: "acme", name: "Acme Corp" }],
      }}
    />,
  );
  const table = await screen.findByRole("table", { name: "Tenants" });
  expect(within(table).getByText("Member")).toBeTruthy();
  expect(within(table).getByText("Through a grant")).toBeTruthy();
  fireEvent.input(screen.getByLabelText("Search tenants"), { target: { value: "glob" } });
  expect(within(table).queryByText("Acme Corp")).toBeNull();
  fireEvent.click(within(table).getByText("eu"));
  const inspector = await screen.findByRole("dialog");
  expect(within(inspector).getByText(/operator access grant/)).toBeTruthy();
  expect(within(inspector).getByRole("button", { name: "Delete" })).toBeTruthy();
});

test("disabling a member from the list asks first, and does not open the inspector", async () => {
  let disabled = false;
  routes["GET /api/v1/members?limit=200"] = () => [
    200,
    {
      items: [
        {
          id: "m2",
          name: "Bob",
          email: "bob@acme.example",
          createdAt: "2026-11-11T00:00:00.000Z",
          disabled,
        },
      ],
    },
  ];
  routes["PATCH /api/v1/members/m2"] = (body) => {
    disabled = (body as { disabled: boolean }).disabled;
    return [200, {}];
  };
  show(<InstanceMembers />);
  fireEvent.click(await screen.findByRole("button", { name: "Disable" }));
  await answer("Disable");
  expect(await screen.findByText("Disabled")).toBeTruthy();
  expect(screen.queryByRole("complementary")).toBeNull();
});

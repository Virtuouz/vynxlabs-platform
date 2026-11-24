// @vitest-environment happy-dom
import { cleanup, fireEvent, renderHook, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App, returnTarget, useReopenLastPlace } from "./App.tsx";
import { match } from "./router.tsx";
import { endSession } from "./session.ts";
import { show } from "./testing.tsx";

type Handler = (body: unknown) => [number, unknown];
let routes: Record<string, Handler>;
let signedIn: boolean;
let permissions: string[];

beforeEach(() => {
  signedIn = false;
  permissions = [];
  history.replaceState(null, "", "/");
  routes = {
    "GET /api/v1/me": () =>
      signedIn
        ? [
            200,
            {
              principal: { type: "member", id: "m1", name: "Alice", email: "alice@acme.example" },
              instancePermissions: permissions,
              tenants: [{ id: "t1", slug: "acme", name: "Acme Corp" }],
            },
          ]
        : [401, { status: 401, code: "unauthenticated", detail: "Sign in or send an API key." }],
    "POST /api/v1/auth/sign-in/email": (body) => {
      if ((body as { password: string }).password !== "right-password") {
        return [
          401,
          { status: 401, code: "invalid_email_or_password", detail: "Invalid email or password" },
        ];
      }
      signedIn = true;
      return [200, { token: "x" }];
    },
    "GET /api/v1/sso/providers?email=alice%40acme.example": () => [
      200,
      { providers: [], password: true },
    ],
    "GET /api/v1/tenants?limit=50": () => [
      200,
      {
        items: [
          { id: "t1", slug: "acme", name: "Acme Corp", createdAt: "2026-11-11T00:00:00.000Z" },
        ],
        nextCursor: null,
      },
    ],
  };
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const handler = routes[`${init.method ?? "GET"} ${url}`];
    const [status, body] = handler
      ? handler(init.body ? JSON.parse(init.body as string) : undefined)
      : [404, { status: 404, detail: `No mock for ${url}` }];
    return new Response(JSON.stringify(body), { status });
  });
});
afterEach(() => {
  cleanup();
  endSession();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("signing in: a wrong password explains itself, the right one shows the member's tenants", async () => {
  show(<App />);
  await screen.findByRole("heading", { name: "Sign in" });
  fireEvent.input(screen.getByLabelText("Email"), { target: { value: "alice@acme.example" } });
  // The password is asked for once it is known that this email may use one.
  expect(screen.queryByLabelText("Password")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.input(await screen.findByLabelText("Password"), { target: { value: "wrong" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "That email and password do not match an account.",
  );

  fireEvent.input(screen.getByLabelText("Password"), { target: { value: "right-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("heading", { name: "Tenants" });
  // The tenant is listed on the screen, and in the navigation beside it.
  const main = screen.getByRole("main");
  expect((await within(main).findByRole("link", { name: "Acme Corp" })).getAttribute("href")).toBe(
    "/t/t1",
  );
  // A member who is not an operator sees no instance section and cannot create tenants.
  expect(screen.queryByText("Operators")).toBeNull();
  expect(screen.queryByRole("button", { name: "Create tenant" })).toBeNull();
});

test("route matching", () => {
  expect(match("/t/:tenantId/*", "/t/abc/members")).toEqual({ tenantId: "abc" });
  expect(match("/t/:t/workspaces/:w/:tab", "/t/a/workspaces/b/secrets")).toEqual({
    t: "a",
    w: "b",
    tab: "secrets",
  });
  expect(match("/t/:t/workspaces/:w/:tab", "/t/a/workspaces")).toBeNull();
  expect(match("/instance/members", "/instance/audit")).toBeNull();
});

test("after signing in, a member an app sent here goes back to the app", async () => {
  const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
  history.replaceState(null, "", "/?return=%2Fapps%2Facme%2Fmain%2Forders%2F%3Ftab%3Dopen");
  show(<App />);
  await screen.findByRole("heading", { name: "Sign in" });
  expect(assign).not.toHaveBeenCalled();
  fireEvent.input(screen.getByLabelText("Email"), { target: { value: "alice@acme.example" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.input(await screen.findByLabelText("Password"), {
    target: { value: "right-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(assign).toHaveBeenCalledWith("/apps/acme/main/orders/?tab=open"));
  // The console itself is not shown on the way.
  expect(screen.queryByRole("heading", { name: "Tenants" })).toBeNull();
});

test("a member who is already signed in is sent back at once", async () => {
  signedIn = true;
  const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
  history.replaceState(null, "", "/?return=%2Fapi%2Fv1%2Fapp-handoffs%2Fstart%3Fto%3Dx");
  show(<App />);
  await waitFor(() => expect(assign).toHaveBeenCalledWith("/api/v1/app-handoffs/start?to=x"));
});

test("a return address that is not an app's is ignored", async () => {
  signedIn = true;
  const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
  history.replaceState(null, "", "/?return=https%3A%2F%2Fevil.example%2Fapps%2F");
  show(<App />);
  await screen.findByRole("heading", { name: "Tenants" });
  expect(assign).not.toHaveBeenCalled();

  expect(returnTarget("?return=/portal/acme/")).toBe("/portal/acme/");
  expect(returnTarget("?return=/apps/acme/main/orders/")).toBe("/apps/acme/main/orders/");
  expect(returnTarget("?return=//evil.example/apps/")).toBeNull();
  expect(returnTarget("?return=/t/t1/members")).toBeNull();
  expect(returnTarget("?return=/api/v1/tenants")).toBeNull();
  expect(returnTarget("?return=")).toBeNull();
  expect(returnTarget("")).toBeNull();
});

test("opening the console at its root goes back to the last workspace, once", async () => {
  routes["GET /api/v1/me/recent"] = () => [
    200,
    { items: [{ tenantId: "t1", workspaceId: "w1", visitedAt: "2026-11-14T00:00:00.000Z" }] },
  ];
  const { rerender } = renderHook(({ on }) => useReopenLastPlace(on), {
    initialProps: { on: false },
  });
  expect(location.pathname).toBe("/");
  rerender({ on: true });
  await waitFor(() => expect(location.pathname).toBe("/t/t1/workspaces/w1/overview"));
  // Going back to the tenant list afterward stays there.
  history.replaceState(null, "", "/");
  rerender({ on: false });
  rerender({ on: true });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(location.pathname).toBe("/");
});

test("a tenant list with a filter in its address stays on it when the console opens (INS-fix)", async () => {
  routes["GET /api/v1/me/recent"] = () => [
    200,
    { items: [{ tenantId: "t1", workspaceId: "w1", visitedAt: "2026-11-14T00:00:00.000Z" }] },
  ];
  history.replaceState(null, "", "/?dataLocation=cdrloc&q=acme");
  renderHook(() => useReopenLastPlace(true));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(location.pathname).toBe("/");
  expect(location.search).toBe("?dataLocation=cdrloc&q=acme");
  history.replaceState(null, "", "/");
});

test("a member with nowhere remembered stays on the tenant list", async () => {
  routes["GET /api/v1/me/recent"] = () => [200, { items: [] }];
  renderHook(() => useReopenLastPlace(true));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(location.pathname).toBe("/");
});

test("the instance's screens open for an operator and say whom they are for to anyone else (INS-20)", async () => {
  signedIn = true;
  routes["GET /api/v1/members?limit=50"] = () => [200, { items: [], nextCursor: null }];
  history.replaceState(null, "", "/instance/members");
  show(<App />);
  await screen.findByText("For operators");
  expect(screen.queryByRole("button", { name: "Create member" })).toBeNull();
  expect(document.body.textContent).not.toContain("Ask a member who can give access");
  cleanup();
  // A role that gives everything, bound at the instance, is an operator too.
  permissions = ["*:*"];
  show(<App />);
  await screen.findByRole("button", { name: "Create member" });
  expect(screen.queryByText("For operators")).toBeNull();
});

// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App, returnTarget } from "./App.tsx";
import { match } from "./router.tsx";
import { show } from "./testing.tsx";

type Handler = (body: unknown) => [number, unknown];
let routes: Record<string, Handler>;
let signedIn: boolean;

beforeEach(() => {
  signedIn = false;
  history.replaceState(null, "", "/");
  routes = {
    "GET /api/v1/me": () =>
      signedIn
        ? [
            200,
            {
              principal: { type: "member", id: "m1", name: "Alice", email: "alice@acme.example" },
              instancePermissions: [],
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
    "GET /api/v1/tenants?limit=200": () => [
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("signing in: a wrong password explains itself, the right one shows the member's tenants", async () => {
  show(<App />);
  await screen.findByRole("heading", { name: "Sign in" });
  fireEvent.input(screen.getByLabelText("Email"), { target: { value: "alice@acme.example" } });
  fireEvent.input(screen.getByLabelText("Password"), { target: { value: "wrong" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "That email and password do not match an account.",
  );

  fireEvent.input(screen.getByLabelText("Password"), { target: { value: "right-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("heading", { name: "Tenants" });
  expect((await screen.findByRole("link", { name: "Acme Corp" })).getAttribute("href")).toBe(
    "/t/t1/workspaces",
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
  fireEvent.input(screen.getByLabelText("Password"), { target: { value: "right-password" } });
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

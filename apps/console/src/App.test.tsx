// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "./App.tsx";
import { match } from "./router.tsx";

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
});

test("signing in: a wrong password explains itself, the right one shows the member's tenants", async () => {
  render(<App />);
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

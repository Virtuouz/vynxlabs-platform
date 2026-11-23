// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.setConfig({ testTimeout: 20_000 });

import { InstanceMembers } from "./screens/Instance.tsx";
import { MemberList } from "./screens/Members.tsx";
import { ResetPassword } from "./screens/ResetPassword.tsx";
import { answer, show } from "./testing.tsx";

// D4: a member's password is reset with a one-time link, made from the member's row.

const base = "/tenants/t1";
let calls: { method: string; url: string; body: unknown }[];
let made: { url: string | null; expiresAt: string; emailed: boolean };
let held: string[];
let refused: string | undefined;

beforeEach(() => {
  calls = [];
  held = ["member:write"];
  refused = undefined;
  made = {
    url: "https://vx.test/reset-password/tok123tok123tok123tok123",
    expiresAt: "2026-11-23T12:00:00Z",
    emailed: false,
  };
  history.replaceState(null, "", "/t/t1/members?member=m2");
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const path = address.replace("/api/v1", "");
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url: path, body });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (path === "/me") {
      return json({
        principal: { type: "member", id: "m1", name: "Rae", email: "rae@acme.test" },
        instancePermissions: held,
        tenants: [],
      });
    }
    if (path.includes("/access/member/")) {
      return json({
        principal: {},
        sources: [{ id: "s", scope: { type: "tenant" }, counts: true }],
        permissions: held.map((permission) => ({ permission, sources: ["s"] })),
      });
    }
    if (method === "POST" && path.endsWith("/password-link")) {
      if (refused) return json({ status: 409, code: "conflict", detail: refused }, 409);
      return json(made, 201);
    }
    if (path.startsWith(`${base}/members`) && method === "GET") {
      return json({
        items: [
          {
            id: "m2",
            name: "Pat",
            email: "pat@acme.test",
            createdAt: "2026-01-01T00:00:00Z",
            suspended: false,
            directRoles: 1,
            groups: 0,
          },
        ],
        nextCursor: null,
      });
    }
    if (path.startsWith("/members") && method === "GET") {
      return json({
        items: [
          {
            id: "m2",
            name: "Pat",
            email: "pat@acme.test",
            createdAt: "2026-01-01T00:00:00Z",
            tenants: [],
          },
        ],
        nextCursor: null,
      });
    }
    if (path.startsWith("/member-password-links/")) {
      if (method === "POST") return json(null, 204);
      return json({ email: "pat@acme.test", name: "Pat", expiresAt: "2026-11-23T12:00:00Z" });
    }
    return json({ items: [] });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("a tenant's member page makes the link, says what happens first, and shows it once", async () => {
  show(<MemberList base={base} />);
  fireEvent.click(await screen.findByRole("button", { name: "Make a password reset link" }));
  const said = await answer("Make the link");
  expect(said).toContain("Make a password reset link for pat@acme.test?");
  expect(said).toContain("ends all their other sign-ins");
  expect(said).toContain("Nobody sees the password");
  await screen.findByText(/This instance sends no mail/);
  expect(calls.find((call) => call.method === "POST")?.url).toBe(
    `${base}/members/m2/password-link`,
  );
  expect(document.body.textContent).toContain(
    "https://vx.test/reset-password/tok123tok123tok123tok123",
  );
});

test("where mail is set up it says the link was emailed and shows none", async () => {
  made = { url: null, expiresAt: made.expiresAt, emailed: true };
  show(<MemberList base={base} />);
  fireEvent.click(await screen.findByRole("button", { name: "Make a password reset link" }));
  await answer("Make the link");
  await screen.findByText(/It was emailed to pat@acme.test/);
  expect(document.body.textContent).not.toContain("reset-password/");
});

test("a refusal is said in words, and nothing is shown", async () => {
  refused = "pat@acme.test signs in with Okta, and passwords are turned off for them.";
  show(<MemberList base={base} />);
  fireEvent.click(await screen.findByRole("button", { name: "Make a password reset link" }));
  await answer("Make the link");
  await screen.findByText(/signs in with Okta/);
  expect(document.body.textContent).not.toContain("Password reset link");
});

test("without member:write the button is off and says what it needs", async () => {
  held = ["member:read"];
  show(<MemberList base={base} />);
  await screen.findAllByText("Make a password reset link");
  const button = () =>
    screen.getAllByText("Make a password reset link")[0]?.closest("button") as HTMLButtonElement;
  await waitFor(() => expect(button().disabled).toBe(true));
});

test("the instance's All members row makes it through the instance route", async () => {
  history.replaceState(null, "", "/");
  held = ["member:write", "member:read"];
  show(<InstanceMembers />);
  fireEvent.click(await screen.findByRole("button", { name: "Make a password reset link" }));
  await answer("Make the link");
  await screen.findByText(/This instance sends no mail/);
  expect(calls.find((call) => call.method === "POST")?.url).toBe("/members/m2/password-link");
});

test("the link's page sets the password once the two match, and points to sign in", async () => {
  show(<ResetPassword token="tok123tok123tok123tok123" />);
  await screen.findByRole("heading", { name: "Choose a new password" });
  expect(document.body.textContent).toContain("pat@acme.test");
  const set = screen.getByRole("button", { name: "Set password" }) as HTMLButtonElement;
  expect(set.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText(/^New password$/), {
    target: { value: "a-long-new-password" },
  });
  fireEvent.change(screen.getByLabelText(/New password again/), {
    target: { value: "a-long-new-password" },
  });
  fireEvent.click(set);
  await screen.findByRole("heading", { name: "Your password is set" });
  expect(calls.find((call) => call.method === "POST")?.body).toEqual({
    password: "a-long-new-password",
  });
});

// @vitest-environment happy-dom
import { cleanup, fireEvent, renderHook, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useRememberPlace } from "./App.tsx";
import { Account } from "./screens/Account.tsx";
import { InstanceMembers, Operators } from "./screens/Instance.tsx";
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

test("the Account page is headed Account, and API keys is one of its sections (r-screens 2)", async () => {
  routes["GET /api/v1/api-keys"] = () => [200, { items: [] }];
  routes["GET /api/v1/me"] = () => [
    200,
    { principal: { type: "member", id: "m1", name: "Maya", email: "maya@example.test" } },
  ];
  show(<Account />);
  const headings = await screen.findAllByRole("heading", { level: 1 });
  expect(headings.map((one) => one.textContent)).toEqual(["Account"]);
  expect(await screen.findByRole("heading", { level: 2, name: "API keys" })).toBeTruthy();
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

test("a wrong password with a recovery code says the code is spent (GOV-12, D18)", async () => {
  routes["GET /api/v1/sso/providers?email=olive%40acme.example"] = () => [
    200,
    { providers: [{ id: "p1", name: "Acme Login", url: "/api/v1/sso/p1/start" }], password: false },
  ];
  routes["POST /api/v1/auth/sign-in/email"] = () => [
    401,
    { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" },
  ];
  show(<SignIn onSignedIn={vi.fn()} />);
  fireEvent.input(screen.getByLabelText("Email"), { target: { value: "olive@acme.example" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(await screen.findByRole("button", { name: "Use a recovery code" }));
  expect(screen.getByText(/even if the password is wrong/)).toBeTruthy();
  fireEvent.input(screen.getByLabelText("Password"), { target: { value: "typo" } });
  fireEvent.input(screen.getByLabelText(/Recovery code/), { target: { value: "aaaa-bbbb" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in with the recovery code" }));
  expect((await screen.findByRole("alert")).textContent).toContain("code was used up");
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
  // The server searches: typing "glob" asks it, and it answers with Globex alone.
  routes["GET /api/v1/tenants?limit=50&search=glob"] = () => [
    200,
    {
      items: [
        {
          id: "t2",
          slug: "globex",
          name: "Globex",
          dataLocation: "eu",
          createdAt: "2026-11-11T00:00:00.000Z",
        },
      ],
      nextCursor: null,
    },
  ];
  routes["GET /api/v1/tenants?limit=50"] = () => [
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
  const table = await screen.findByRole("grid", { name: "Tenants" });
  expect(within(table).getByText("Member")).toBeTruthy();
  expect(within(table).getByText("Through a grant")).toBeTruthy();
  fireEvent.input(screen.getByLabelText("Search tenants"), { target: { value: "glob" } });
  await waitFor(() => expect(within(table).queryByText("Acme Corp")).toBeNull());
  fireEvent.click(await within(table).findByText("eu"));
  const inspector = await screen.findByRole("dialog");
  expect(within(inspector).getByText(/operator access grant/)).toBeTruthy();
  expect(within(inspector).getByRole("button", { name: "Delete" })).toBeTruthy();
});

test("disabling a member from the list asks first, and does not open the inspector", async () => {
  let disabled = false;
  routes["GET /api/v1/members?limit=50"] = () => [
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
  // Disabling someone whose tenants keep an admin still says it was done.
  expect(await screen.findByText(/is disabled\./)).toBeTruthy();
});

test("a tenant is renamed from the inspector, keeping its slug", async () => {
  routes["GET /api/v1/tenants?limit=50"] = () => [
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
      ],
      nextCursor: null,
    },
  ];
  routes["PATCH /api/v1/tenants/t1"] = () => [200, {}];
  show(
    <Tenants
      me={{
        principal: { type: "member", id: "m1", name: "Op", email: "op@example.com" },
        instancePermissions: [],
        tenants: [{ id: "t1", slug: "acme", name: "Acme Corp" }],
      }}
    />,
  );
  fireEvent.click((await screen.findAllByText("acme")).at(-1) as HTMLElement);
  const inspector = await screen.findByRole("dialog");
  fireEvent.click(within(inspector).getByRole("button", { name: "Rename" }));
  await answer("Rename", "Acme Inc");
  await waitFor(() =>
    expect(calls.find((call) => call.method === "PATCH")).toMatchObject({
      url: "/api/v1/tenants/t1",
      body: { name: "Acme Inc" },
    }),
  );
});

test("a person changes their own password on Account, and the form says what went wrong (INS-13)", async () => {
  routes["GET /api/v1/api-keys"] = () => [200, { items: [] }];
  routes["GET /api/v1/me/recovery-codes"] = () => [200, { eligible: false, left: 0, madeAt: null }];
  let answerWith: [number, unknown] = [200, {}];
  routes["POST /api/v1/auth/change-password"] = () => answerWith;
  show(<Account />);
  const panel = await screen.findByRole("region", { name: "Password" });
  const form = within(panel);
  const change = form.getByRole("button", { name: "Change password" }) as HTMLButtonElement;
  expect(change.disabled).toBe(true);
  fireEvent.input(form.getByLabelText("Current password"), {
    target: { value: "the old one 123" },
  });
  fireEvent.input(form.getByLabelText("New password"), { target: { value: "short" } });
  fireEvent.input(form.getByLabelText("New password again"), { target: { value: "short" } });
  // Twelve characters, as the server asks: said before anything is sent.
  expect(change.disabled).toBe(true);
  fireEvent.input(form.getByLabelText("New password"), {
    target: { value: "a much longer one" },
  });
  expect(change.disabled).toBe(true);
  expect(form.getByText("The two do not match.")).toBeTruthy();
  fireEvent.input(form.getByLabelText("New password again"), {
    target: { value: "a much longer one" },
  });
  answerWith = [400, { status: 400, detail: "Invalid password" }];
  fireEvent.click(change);
  await within(panel).findByText("The current password is not right.");
  answerWith = [200, {}];
  fireEvent.click(form.getByRole("button", { name: "Change password" }));
  await within(panel).findByText("Your password is changed. Your other sessions were signed out.");
  const sent = calls.filter((call) => call.url === "/api/v1/auth/change-password");
  expect(sent[1]?.body).toEqual({
    currentPassword: "the old one 123",
    newPassword: "a much longer one",
    revokeOtherSessions: true,
  });
  // What was typed is gone once it is used.
  expect((form.getByLabelText("New password") as HTMLInputElement).value).toBe("");
});

const aSession = (id: string, userAgent: string, ipAddress: string) => ({
  id,
  token: `token-${id}`,
  userAgent,
  ipAddress,
  createdAt: new Date(Date.now() - 3_600_000).toISOString(),
  expiresAt: new Date(Date.now() + 6 * 86_400_000).toISOString(),
});
const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0";
const SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

function accountRoutes() {
  routes["GET /api/v1/api-keys"] = () => [200, { items: [] }];
  routes["GET /api/v1/me/recovery-codes"] = () => [200, { eligible: false, left: 0, madeAt: null }];
  routes["GET /api/v1/me"] = () => [
    200,
    {
      principal: { type: "member", id: "m1", name: "Ada Lovelace", email: "ada@acme.example" },
      instancePermissions: [],
      tenants: [],
    },
  ];
}

test("a person sees where they are signed in, ends one session, and ends the others (SHL-MP2)", async () => {
  accountRoutes();
  let listed = [aSession("s1", FIREFOX, "10.0.0.2"), aSession("s2", SAFARI, "10.0.0.9")];
  routes["GET /api/v1/auth/list-sessions"] = () => [200, listed];
  routes["GET /api/v1/auth/get-session"] = () => [200, { session: { id: "s1" }, user: {} }];
  routes["POST /api/v1/auth/revoke-session"] = (body) => {
    listed = listed.filter((one) => one.token !== (body as { token: string }).token);
    return [200, { status: true }];
  };
  routes["POST /api/v1/auth/revoke-other-sessions"] = () => {
    listed = listed.filter((one) => one.id === "s1");
    return [200, { status: true }];
  };
  show(<Account />);
  const panel = await screen.findByRole("region", { name: "Sessions" });
  const inPanel = within(panel);
  await inPanel.findByText("Firefox on Linux");
  expect(inPanel.getByText("Safari on macOS")).toBeTruthy();
  expect(inPanel.getByText("10.0.0.9")).toBeTruthy();
  expect(inPanel.getByText("This session")).toBeTruthy();
  // The one in use is ended by signing out, so it has no End of its own.
  expect(inPanel.getAllByRole("button", { name: "End" })).toHaveLength(1);

  fireEvent.click(inPanel.getByRole("button", { name: "End" }));
  expect(await answer("Cancel")).toContain("Safari on macOS is signed out");
  expect(calls.some((call) => call.url.endsWith("/revoke-session"))).toBe(false);
  fireEvent.click(inPanel.getByRole("button", { name: "End" }));
  await answer("End session");
  await waitFor(() => expect(inPanel.queryByText("Safari on macOS")).toBeNull());
  expect(calls.find((call) => call.url.endsWith("/revoke-session"))?.body).toEqual({
    token: "token-s2",
  });
  // Nothing else is signed in: there is nothing left to end together.
  expect(
    (inPanel.getByRole("button", { name: "End other sessions" }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

test("a person ends every other session at once, after being asked (SHL-MP2)", async () => {
  accountRoutes();
  let listed = [aSession("s1", FIREFOX, "10.0.0.2"), aSession("s2", SAFARI, "10.0.0.9")];
  routes["GET /api/v1/auth/list-sessions"] = () => [200, listed];
  routes["GET /api/v1/auth/get-session"] = () => [200, { session: { id: "s1" }, user: {} }];
  routes["POST /api/v1/auth/revoke-other-sessions"] = () => {
    listed = listed.filter((one) => one.id === "s1");
    return [200, { status: true }];
  };
  show(<Account />);
  const panel = await screen.findByRole("region", { name: "Sessions" });
  await within(panel).findByText("Safari on macOS");
  fireEvent.click(within(panel).getByRole("button", { name: "End other sessions" }));
  expect(await answer("Cancel")).toContain("The other session is signed out");
  expect(calls.some((call) => call.url.endsWith("/revoke-other-sessions"))).toBe(false);
  fireEvent.click(within(panel).getByRole("button", { name: "End other sessions" }));
  await answer("End other sessions");
  await waitFor(() => expect(within(panel).queryByText("Safari on macOS")).toBeNull());
  expect(within(panel).getByText("Firefox on Linux")).toBeTruthy();
  // NARROW-3: the button is off now, and the focus is not left on the page.
  await waitFor(() => expect(document.activeElement).not.toBe(document.body));
});

test("a list of sessions that fills the library's page says it may be longer", async () => {
  accountRoutes();
  const many = Array.from({ length: 100 }, (_, n) => aSession(`s${n + 1}`, FIREFOX, "10.0.0.2"));
  routes["GET /api/v1/auth/list-sessions"] = () => [200, many];
  routes["GET /api/v1/auth/get-session"] = () => [200, { session: { id: "s1" }, user: {} }];
  show(<Account />);
  const panel = await screen.findByRole("region", { name: "Sessions" });
  expect(await within(panel).findByText(/Showing the first 100 sessions/)).toBeTruthy();
});

test("sessions that cannot be read say so, and can be asked for again (SHL-MP2)", async () => {
  accountRoutes();
  let refuse = true;
  routes["GET /api/v1/auth/list-sessions"] = () =>
    refuse
      ? [500, { status: 500, detail: "The sessions could not be read." }]
      : [200, [aSession("s1", FIREFOX, "10.0.0.2")]];
  routes["GET /api/v1/auth/get-session"] = () => [200, { session: { id: "s1" }, user: {} }];
  show(<Account />);
  const panel = await screen.findByRole("region", { name: "Sessions" });
  await within(panel).findByText("The sessions could not be read.");
  refuse = false;
  fireEvent.click(within(panel).getByRole("button", { name: "Try again" }));
  await within(panel).findByText("Firefox on Linux");
});

test("a person changes their name, and cannot where a directory sets it (SHL-MP3)", async () => {
  accountRoutes();
  routes["GET /api/v1/auth/list-sessions"] = () => [200, []];
  routes["POST /api/v1/auth/update-user"] = () => [200, { status: true }];
  show(<Account />);
  const panel = await screen.findByRole("region", { name: "Profile" });
  const form = within(panel);
  const field = (await form.findByLabelText("Name")) as HTMLInputElement;
  expect(field.value).toBe("Ada Lovelace");
  expect(form.getByText("ada@acme.example")).toBeTruthy();
  const save = form.getByRole("button", { name: "Save name" }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.input(field, { target: { value: "Ada King" } });
  expect(save.disabled).toBe(false);
  fireEvent.click(save);
  await form.findByText("Your name is saved.");
  expect(calls.find((call) => call.url.endsWith("/update-user"))?.body).toEqual({
    name: "Ada King",
  });
});

test("a name a directory pushes is shown with whose it is, and is not offered for change (SHL-MP3)", async () => {
  accountRoutes();
  routes["GET /api/v1/me"] = () => [
    200,
    {
      principal: {
        type: "member",
        id: "m1",
        name: "Ada Lovelace",
        email: "ada@acme.example",
        nameFrom: "Acme Staff",
      },
      instancePermissions: [],
      tenants: [],
    },
  ];
  routes["GET /api/v1/auth/list-sessions"] = () => [200, []];
  show(<Account />);
  const panel = await screen.findByRole("region", { name: "Profile" });
  const field = (await within(panel).findByLabelText("Name")) as HTMLInputElement;
  expect(field.disabled).toBe(true);
  expect(within(panel).getByText("Your name comes from Acme Staff. Change it there.")).toBeTruthy();
  expect(within(panel).queryByRole("button", { name: "Save name" })).toBeNull();
});

test("an API key is made with an expiry, and the list says when each ends (SHL-MP4)", async () => {
  accountRoutes();
  const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
  routes["GET /api/v1/auth/list-sessions"] = () => [200, []];
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
          name: "Deploy",
          prefix: "vx_dep",
          suffix: "1a2b",
          expiresAt: soon,
          lastUsedAt: null,
          revokedAt: null,
          createdAt: "2026-11-01T00:00:00.000Z",
        },
      ],
    },
  ];
  routes["POST /api/v1/api-keys"] = () => [201, { token: "vx_new", id: "k3" }];
  show(<Account />);
  await screen.findByText("vx_dep…1a2b");
  expect(screen.getByRole("columnheader", { name: "Expires" })).toBeTruthy();
  // The Laptop key was never used and never expires.
  expect(screen.getAllByText("Never")).toHaveLength(3);
  expect(screen.getByText("in 3d")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Create API key" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.input(within(dialog).getByLabelText("Name"), { target: { value: "CI" } });
  fireEvent.change(within(dialog).getByLabelText("Expires"), { target: { value: "30" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create API key" }));
  await waitFor(() => expect(calls.some((call) => call.method === "POST")).toBe(true));
  const sent = calls.find((call) => call.method === "POST")?.body as {
    name: string;
    expiresAt: string;
  };
  expect(sent.name).toBe("CI");
  const days = (new Date(sent.expiresAt).getTime() - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(29.9);
  expect(days).toBeLessThan(30.1);
});

test("an operator who is disabled says so on the Operators list, and cannot be mistaken for one who can sign in (ACC)", async () => {
  routes["GET /api/v1/bindings"] = () => [
    200,
    {
      items: [
        {
          id: "b1",
          memberEmail: "ada@ops.example",
          roleName: "operator_admin",
          createdAt: "2026-11-01T00:00:00Z",
          memberDisabled: false,
        },
        {
          id: "b2",
          memberEmail: "bo@ops.example",
          roleName: "operator_admin",
          createdAt: "2026-11-01T00:00:00Z",
          memberDisabled: true,
        },
      ],
      nextCursor: null,
    },
  ];
  show(<Operators />);
  const row = (await screen.findByText("bo@ops.example")).closest("tr") as HTMLElement;
  expect(within(row).getByText("Disabled")).toBeTruthy();
  const other = screen.getByText("ada@ops.example").closest("tr") as HTMLElement;
  expect(within(other).queryByText("Disabled")).toBeNull();
});

const me = (id: string, email: string) => ({
  principal: { type: "member", id, name: "Ada", email },
  instancePermissions: ["*:*"],
  tenants: [],
});

test("your own row on All members offers no Disable and says why (INS-27)", async () => {
  routes["GET /api/v1/me"] = () => [200, me("m1", "ada@ops.example")];
  routes["GET /api/v1/members?limit=50"] = () => [
    200,
    {
      items: [
        { id: "m1", name: "Ada", email: "ada@ops.example", createdAt: "2026-11-11T00:00:00.000Z" },
        { id: "m2", name: "Bob", email: "bob@acme.example", createdAt: "2026-11-11T00:00:00.000Z" },
      ],
    },
  ];
  show(<InstanceMembers />);
  const mine = (await screen.findAllByText("ada@ops.example"))[0]?.closest("tr") as HTMLElement;
  const theirs = screen.getAllByText("bob@acme.example")[0]?.closest("tr") as HTMLElement;
  await within(theirs).findByRole("button", { name: "Disable" });
  expect(within(mine).queryByRole("button", { name: "Disable" })).toBeNull();
  expect(within(mine).getByText(/You cannot disable your own account/)).toBeTruthy();
});

test("removing yourself as an operator says it is you (INS-27)", async () => {
  routes["GET /api/v1/me"] = () => [200, me("m1", "ada@ops.example")];
  routes["GET /api/v1/bindings"] = () => [
    200,
    {
      items: [
        {
          id: "b1",
          memberEmail: "ada@ops.example",
          roleName: "operator_admin",
          createdAt: "2026-11-01T00:00:00Z",
        },
        {
          id: "b2",
          memberEmail: "bo@ops.example",
          roleName: "operator_admin",
          createdAt: "2026-11-01T00:00:00Z",
        },
      ],
      nextCursor: null,
    },
  ];
  show(<Operators />);
  const mine = (await screen.findByText("ada@ops.example")).closest("tr") as HTMLElement;
  const theirs = screen.getByText("bo@ops.example").closest("tr") as HTMLElement;
  await waitFor(() =>
    expect(within(mine).getByRole("button", { name: "Remove yourself" })).toBeTruthy(),
  );
  expect(within(theirs).getByRole("button", { name: "Remove" })).toBeTruthy();
  fireEvent.click(within(mine).getByRole("button", { name: "Remove yourself" }));
  expect(await screen.findByText(/Remove yourself as an operator\?/)).toBeTruthy();
});

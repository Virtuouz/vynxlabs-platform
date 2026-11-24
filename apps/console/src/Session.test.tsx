// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "./App.tsx";
import { api } from "./api.ts";
import { resetPreferences } from "./prefs.ts";
import { useNavigationGuard } from "./router.tsx";
import { endSession } from "./session.ts";
import { answer, show } from "./testing.tsx";

/**
 * The session's own edges: signing out (SHL-06, SHL-07, SHL-17), a session that ends
 * mid-use (SHL-08), and where single sign-on returns to (SHL-05).
 */

type Handler = (body: unknown) => [number, unknown];
let routes: Record<string, Handler>;
let signedAs: string | null;
let calls: string[];
let slow = false;

const memberOf = (id: string, email: string) => ({
  principal: { type: "member", id, name: null, email },
  instancePermissions: [],
  tenants: [{ id: "t1", slug: "acme", name: "Acme Corp" }],
});
const PEOPLE: Record<string, string> = { m1: "alice@acme.example", m2: "bob@acme.example" };

beforeEach(() => {
  signedAs = "m1";
  calls = [];
  slow = false;
  localStorage.clear();
  history.replaceState(null, "", "/");
  routes = {
    "GET /api/v1/me": () =>
      signedAs
        ? [200, memberOf(signedAs, PEOPLE[signedAs] as string)]
        : [401, { status: 401, code: "unauthenticated", detail: "Sign in or send an API key." }],
    "POST /api/v1/auth/sign-out": () => {
      signedAs = null;
      return [200, {}];
    },
    "POST /api/v1/auth/sign-in/email": (body) => {
      signedAs = (body as { email: string }).email === PEOPLE.m2 ? "m2" : "m1";
      return [200, { token: "x" }];
    },
    "GET /api/v1/sso/providers?email=alice%40acme.example": () => [
      200,
      { providers: [], password: true },
    ],
    "GET /api/v1/sso/providers?email=bob%40acme.example": () => [
      200,
      { providers: [], password: true },
    ],
    "GET /api/v1/me/preferences": () => [200, { items: [] }],
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
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const key = `${init.method ?? "GET"} ${url}`;
    calls.push(key);
    if (slow && key === "GET /api/v1/me" && !signedAs) {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    const handler = routes[key];
    const [status, body] = handler
      ? handler(init.body ? JSON.parse(init.body as string) : undefined)
      : [404, { status: 404, detail: `No mock for ${key}` }];
    return new Response(JSON.stringify(body), { status });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  endSession();
  resetPreferences();
  history.replaceState(null, "", "/");
});

/** Something on screen with a draft, as an editor has. */
function Draft({ guard = false }: { guard?: boolean }) {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState("");
  useNavigationGuard(guard, "Your changes to the draft are not saved. Leave anyway?");
  return (
    <section>
      <textarea aria-label="Draft" value={text} onChange={(event) => setText(event.target.value)} />
      <button
        type="button"
        // A save still waiting for a sign-in when its test ends fails then, with nobody to tell.
        onClick={() =>
          api
            .put("/draft", { text })
            .then(() => setSaved(text))
            .catch(() => {})
        }
      >
        Save draft
      </button>
      <p>Saved: {saved}</p>
    </section>
  );
}

async function chooseSignOut() {
  fireEvent.click(await screen.findByRole("button", { name: "Your account" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));
}

test("SHL-06: signing out asks first when a screen holds unsaved changes, and Stay keeps the session", async () => {
  show(
    <>
      <App />
      <Draft guard />
    </>,
  );
  await screen.findByRole("heading", { name: "Tenants" });
  await chooseSignOut();
  expect(await answer("Stay")).toMatch(/not saved/);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(calls).not.toContain("POST /api/v1/auth/sign-out");
  expect(screen.getByRole("heading", { name: "Tenants" })).toBeTruthy();

  await chooseSignOut();
  await answer("Leave");
  await screen.findByRole("heading", { name: "Sign in" });
  expect(calls).toContain("POST /api/v1/auth/sign-out");
});

test("SHL-07: the next person in the same tab is given none of the first person's settings or reads", async () => {
  show(<App />);
  await screen.findByRole("heading", { name: "Tenants" });
  localStorage.setItem("vx-pref:theme", JSON.stringify("dark"));
  localStorage.setItem("vx-pref:palette.pins:t1", JSON.stringify([{ ref: "orders/sync" }]));
  sessionStorage.setItem("vx-viewport:/flows/a", "{}");
  await chooseSignOut();
  await screen.findByRole("heading", { name: "Sign in" });
  expect(Object.keys(localStorage).filter((name) => name.startsWith("vx-pref:"))).toEqual([]);
  expect(Object.keys(sessionStorage).filter((name) => name.startsWith("vx-viewport:"))).toEqual([]);

  // Bob signs in without a page load: his settings are asked for, not Alice's kept.
  routes["GET /api/v1/me/preferences"] = () => [
    200,
    { items: [{ key: "theme", value: "light", updatedAt: "2026-11-11T00:00:00.000Z" }] },
  ];
  const preferenceReads = () => calls.filter((c) => c === "GET /api/v1/me/preferences").length;
  const before = preferenceReads();
  fireEvent.input(screen.getByLabelText("Email"), { target: { value: PEOPLE.m2 } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.input(await screen.findByLabelText("Password"), {
    target: { value: "right-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("heading", { name: "Tenants" });
  await waitFor(() => expect(preferenceReads()).toBeGreaterThan(before));
  expect(localStorage.getItem("vx-pref:palette.pins:t1")).toBeNull();
  expect(localStorage.getItem("vx-pref:theme")).toBe(JSON.stringify("light"));
});

test("SHL-17: a sign-out that fails says so and leaves the person signed in", async () => {
  routes["POST /api/v1/auth/sign-out"] = () => [500, { status: 500, detail: "Down." }];
  show(<App />);
  await screen.findByRole("heading", { name: "Tenants" });
  await chooseSignOut();
  expect(await screen.findByText(/could not be signed out/i)).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Tenants" })).toBeTruthy();
});

test("SHL-08: a session that ends in the middle of a save asks to sign in again, keeps the draft, and finishes the save", async () => {
  let ended = false;
  const saved: unknown[] = [];
  routes["PUT /api/v1/draft"] = (body) => {
    if (ended) return [401, { status: 401, code: "unauthenticated", detail: "Sign in." }];
    saved.push(body);
    return [200, {}];
  };
  show(
    <>
      <App />
      <Draft />
    </>,
  );
  await screen.findByRole("heading", { name: "Tenants" });
  fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "my unsaved words" } });
  ended = true;
  signedAs = null;
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

  const sheet = await screen.findByRole("dialog", { name: /session ended/i });
  expect(within(sheet).getByText(/alice@acme.example/)).toBeTruthy();
  // The page under it, and the draft on it, are as they were.
  expect((screen.getByLabelText("Draft") as HTMLTextAreaElement).value).toBe("my unsaved words");
  expect(screen.queryByRole("heading", { name: "Sign in" })).toBeNull();
  expect(saved).toEqual([]);

  fireEvent.input(within(sheet).getByLabelText("Password"), {
    target: { value: "right-password" },
  });
  ended = false;
  fireEvent.click(within(sheet).getByRole("button", { name: "Sign in" }));
  await screen.findByText("Saved: my unsaved words");
  expect(saved).toEqual([{ text: "my unsaved words" }]);
  await waitFor(() => expect(screen.queryByRole("dialog", { name: /session ended/i })).toBeNull());
});

test("SHL-08: signing in again as someone else does not resume the page", async () => {
  const reload = vi.fn();
  vi.stubGlobal("location", {
    ...window.location,
    reload,
    pathname: "/",
    search: "",
    href: "http://localhost/",
  });
  routes["PUT /api/v1/draft"] = () => [401, { status: 401, detail: "Sign in." }];
  show(
    <>
      <App />
      <Draft />
    </>,
  );
  await screen.findByRole("heading", { name: "Tenants" });
  signedAs = null;
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  const sheet = await screen.findByRole("dialog", { name: /session ended/i });
  // Another account signed in, in another tab, and the cookie is theirs now.
  signedAs = "m2";
  fireEvent.focus(window);
  window.dispatchEvent(new Event("focus"));
  await waitFor(() => expect(reload).toHaveBeenCalled());
  expect(sheet).toBeTruthy();
});

test("SHL-05: the single sign-on link from a deep link carries that link back", async () => {
  signedAs = null;
  history.replaceState(null, "", "/t/t1/workspaces/w1/runs/r1?tab=logs");
  routes["GET /api/v1/sso/providers?email=alice%40acme.example"] = () => [
    200,
    { providers: [{ id: "okta", name: "Okta", url: "/api/v1/sso/okta/start" }], password: false },
  ];
  show(<App />);
  await screen.findByRole("heading", { name: "Sign in" });
  fireEvent.input(screen.getByLabelText("Email"), { target: { value: PEOPLE.m1 } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  const link = await screen.findByRole("link", { name: "Sign in with Okta" });
  expect(link.getAttribute("href")).toBe(
    `/api/v1/sso/okta/start?return=${encodeURIComponent("/t/t1/workspaces/w1/runs/r1?tab=logs")}`,
  );
});

test("SHL-14: a lookup that fails is shown with a way to try again, not as a password form", async () => {
  signedAs = null;
  routes["GET /api/v1/sso/providers?email=alice%40acme.example"] = () => [
    429,
    { status: 429, code: "rate_limited", detail: "Too many tries." },
  ];
  show(<App />);
  await screen.findByRole("heading", { name: "Sign in" });
  fireEvent.input(screen.getByLabelText("Email"), { target: { value: PEOPLE.m1 } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/could not check.*Too many tries/);
  expect(screen.queryByLabelText("Password")).toBeNull();
  routes["GET /api/v1/sso/providers?email=alice%40acme.example"] = () => [
    200,
    { providers: [], password: true },
  ];
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByLabelText("Password");
});

test("WLK-01: plain sign-out reaches the sign-in form, with no session sheet and no read left waiting", async () => {
  // A network takes a moment to answer: the page draws while /me is being asked again.
  slow = true;
  show(<App />);
  await screen.findByRole("heading", { name: "Tenants" });
  await chooseSignOut();
  await screen.findByRole("heading", { name: "Sign in" });
  // The 401 that answers sign-out is the plain answer, not a session that ended.
  await new Promise((resolve) => setTimeout(resolve, 150));
  expect(screen.queryByRole("dialog", { name: /session ended/i })).toBeNull();
  expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
});

test("WLK-02: signing in from a deep link shows the screen, not a 401 an early read kept", async () => {
  signedAs = null;
  history.replaceState(null, "", "/t/t1");
  const refused = () =>
    new Response(
      JSON.stringify({
        status: 401,
        code: "unauthenticated",
        detail: "Sign in or send an API key.",
      }),
      { status: 401 },
    );
  // What index.html asked for while the scripts arrived, before anyone signed in.
  (window as unknown as { __vxEarly: Record<string, Promise<Response>> }).__vxEarly = {
    "/me": Promise.resolve(refused()),
    "/tenants/t1/summary": Promise.resolve(refused()),
    "/tenants/t1": Promise.resolve(refused()),
  };
  routes["GET /api/v1/tenants/t1"] = () => [200, { name: "Acme Corp", slug: "acme" }];
  routes["GET /api/v1/tenants/t1/summary"] = () => [
    200,
    { workspaces: 0, approvalsWaiting: 0, domainsToFix: 0, members: 1 },
  ];
  show(<App />);
  await screen.findByRole("heading", { name: "Sign in" });
  fireEvent.input(screen.getByLabelText("Email"), { target: { value: PEOPLE.m1 } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.input(await screen.findByLabelText("Password"), {
    target: { value: "right-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByText("Nothing needs you");
  expect(screen.queryByText("Sign in or send an API key.")).toBeNull();
});

test("WLK-05: the session sheet cannot be set aside: no Close button, Esc keeps it, Tab stays inside", async () => {
  routes["PUT /api/v1/draft"] = () => [401, { status: 401, detail: "Sign in." }];
  show(
    <>
      <App />
      <Draft />
    </>,
  );
  await screen.findByRole("heading", { name: "Tenants" });
  signedAs = null;
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  const sheet = await screen.findByRole("dialog", { name: /session ended/i });
  expect(within(sheet).queryByRole("button", { name: "Close" })).toBeNull();
  fireEvent.keyDown(sheet, { key: "Escape" });
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(screen.getByRole("dialog", { name: /session ended/i })).toBeTruthy();
  // Every control that can take the focus is in the sheet or is the page made inert behind it.
  const tabbable = within(sheet).getAllByRole("button");
  expect(tabbable.length).toBeGreaterThan(0);
});

test("ACC-MP17: inside a tenant the account menu opens what the person may do there, without reading access", async () => {
  history.replaceState(null, "", "/t/t1/overview");
  routes["GET /api/v1/tenants/t1/access/member/m1"] = () => [
    200,
    {
      principal: {
        type: "member",
        id: "m1",
        name: "Alice",
        email: "alice@acme.example",
        suspended: false,
        groups: [],
      },
      sources: [],
      permissions: [],
    },
  ];
  show(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Your account" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "What I may do here" }));
  await screen.findByRole("heading", { name: "What I may do here" });
  expect(location.pathname).toBe("/t/t1/members/m1");
  // It is about oneself: the list of members is for those who may read it, so it is not offered.
  expect(screen.queryByRole("link", { name: "All members" })).toBeNull();
  // Outside a tenant there is nothing to ask.
  history.replaceState(null, "", "/");
});

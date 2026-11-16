// @vitest-environment happy-dom
import { cleanup, configure, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Me } from "./api.ts";
import { navigate, useNavigationGuard, usePath } from "./router.tsx";
import { Tenant } from "./screens/Tenant.tsx";
import { answer, show } from "./testing.tsx";

configure({ asyncUtilTimeout: 6000 });

// The editor falls back to a plain text box, as it does wherever Monaco cannot load.
vi.mock("./editor/monaco.ts", () => {
  throw new Error("Monaco is not loaded in tests.");
});

const base = "/tenants/t1/workspaces/w1";
const me: Me = {
  principal: { type: "member", id: "m1", name: "Ada", email: "ada@acme.test" },
  instancePermissions: [],
  tenants: [{ id: "t1", slug: "acme", name: "Acme" }],
};
let routes: Record<string, (body: unknown) => unknown>;
let calls: { method: string; url: string; body: unknown }[];

beforeEach(() => {
  calls = [];
  routes = { [`GET ${base}`]: () => ({ id: "w1", slug: "dev", name: "Dev", type: "dev" }) };
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    const path = address.replace("/api/v1", "").split("?")[0] as string;
    calls.push({ method, url: path, body });
    const answer = routes[`${method} ${path}`];
    if (!answer && method === "GET" && path.startsWith(`${base}/drafts/`)) {
      return new Response(JSON.stringify({ title: "Not found" }), { status: 404 });
    }
    const value = answer ? answer(body) : method === "GET" ? { items: [] } : {};
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  history.replaceState(null, "", "/a");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  history.replaceState(null, "", "/");
});

function Guarded({ active }: { active: boolean }) {
  useNavigationGuard(active, "Your changes to orders/sync are not saved. Leave anyway?");
  return <p>At {usePath()}</p>;
}

test("leaving a page with changes not saved asks first, by a link and by Back", async () => {
  show(<Guarded active />);
  navigate("/b");
  expect(await answer("Stay")).toContain("Your changes to orders/sync are not saved.");
  expect(location.pathname).toBe("/a");
  expect(screen.getByText("At /a")).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  navigate("/b");
  await answer("Leave");
  await waitFor(() => expect(location.pathname).toBe("/b"));
  expect(await screen.findByText("At /b")).toBeTruthy();
});

test("Back is held while changes are not saved, and refining the address never asks", async () => {
  show(<Guarded active />);
  // The same page refining its address, such as a filter, is not leaving it.
  navigate("/a?tab=logs", { replace: true });
  expect(screen.queryByRole("dialog")).toBeNull();

  // Back has already moved the address when the browser says so: the page's own comes back.
  history.replaceState(null, "", "/elsewhere");
  dispatchEvent(new PopStateEvent("popstate"));
  expect(location.pathname).toBe("/a");
  await answer("Stay");
  expect(screen.getByText("At /a")).toBeTruthy();
});

test("closing the tab asks only while there are changes not saved", () => {
  const { rerender } = show(<Guarded active={false} />);
  const quiet = new Event("beforeunload", { cancelable: true });
  dispatchEvent(quiet);
  expect(quiet.defaultPrevented).toBe(false);
  rerender(<Guarded active />);
  const asked = new Event("beforeunload", { cancelable: true });
  dispatchEvent(asked);
  expect(asked.defaultPrevented).toBe(true);
});

/** The workspace screens at whatever the address says, as the console shows them. */
function AtAddress() {
  return <Tenant tenantId="t1" me={me} path={usePath()} />;
}

const draft = (code: string) => ({
  path: "hello/greet",
  revision: 1,
  body: {
    description: "",
    input: { type: "object" },
    output: { type: "object" },
    timeoutSeconds: 60,
    retries: { limit: 0, delaySeconds: 0, backoff: false },
    uses: { connections: [], secrets: [], variables: [] },
    source: { language: "typescript", code },
  },
});

test("a draft saves itself a few seconds after a change", async () => {
  routes[`GET ${base}/drafts/hello/greet`] = () => draft("// one");
  routes[`PUT ${base}/drafts/hello/greet`] = (sent) => ({
    ...draft((sent as { body: { source: { code: string } } }).body.source.code),
    revision: 2,
  });
  history.replaceState(null, "", "/t/t1/workspaces/w1/scripts/edit/hello/greet");
  show(<AtAddress />);
  const code = await screen.findByLabelText("Source of hello/greet");
  fireEvent.change(code, { target: { value: "// two" } });
  expect(await screen.findByText("Unsaved changes")).toBeTruthy();
  await waitFor(() =>
    expect(calls.filter((call) => call.method === "PUT").map((call) => call.body)).toEqual([
      expect.objectContaining({ revision: 1 }),
    ]),
  );
  await waitFor(() => expect(screen.queryByText("Unsaved changes")).toBeNull());
});

test("a new script not saved yet is kept in this browser, and offered back", async () => {
  history.replaceState(null, "", "/t/t1/workspaces/w1/scripts/new");
  const { unmount } = show(<AtAddress />);
  const code = await screen.findByLabelText("Source of the new script");
  fireEvent.change(screen.getByLabelText("Path"), { target: { value: "orders/sync" } });
  fireEvent.change(code, { target: { value: "// half written" } });
  // Nothing new is sent before its first Save: a half-typed path would make a draft of its own.
  await new Promise((done) => setTimeout(done, 3500));
  expect(calls.filter((call) => call.method === "PUT")).toEqual([]);
  unmount();

  show(<AtAddress />);
  expect(await screen.findByText(/A new script \(orders\/sync\) that was not saved/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Restore it" }));
  expect(((await screen.findByLabelText("Path")) as HTMLInputElement).value).toBe("orders/sync");
  expect((screen.getByLabelText("Source of orders/sync") as HTMLTextAreaElement).value).toBe(
    "// half written",
  );
}, 15_000);

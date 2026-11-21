// @vitest-environment happy-dom
import { cleanup, configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Me } from "./api.ts";
import { nextEditorKey } from "./kit/editorKey.ts";
import { usePath } from "./router.tsx";
import { Tenant } from "./screens/Tenant.tsx";
import { answer, show } from "./testing.tsx";

configure({ asyncUtilTimeout: 5000 });

const base = "/tenants/t1/workspaces/w1";
const me: Me = {
  principal: { type: "member", id: "m1", name: "Ada", email: "ada@acme.test" },
  instancePermissions: [],
  tenants: [{ id: "t1", slug: "acme", name: "Acme" }],
};
let routes: Record<string, (body: unknown) => unknown>;
let calls: { method: string; url: string }[];

beforeEach(() => {
  calls = [];
  routes = {
    [`GET ${base}`]: () => ({ id: "w1", slug: "dev", name: "Dev", type: "dev" }),
  };
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
    calls.push({ method, url: path });
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
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

/** The workspace screens at whatever the address says, as the console shows them. */
function AtAddress() {
  return <Tenant tenantId="t1" me={me} path={usePath()} />;
}

test("a new script's first save and run keeps the editor, and shows the run it started", async () => {
  routes[`PUT ${base}/drafts/hello/greet`] = (body) => ({
    ...(body as object),
    path: "hello/greet",
    revision: 1,
  });
  routes[`POST ${base}/test-runs`] = () => ({ runId: "r1" });
  routes[`GET ${base}/runs/r1`] = () => ({
    id: "r1",
    script: "hello/greet",
    status: "succeeded",
    state: "succeeded",
    attempt: 1,
    maxAttempts: 1,
    trigger: { type: "manual" },
    startedBy: { type: "member", id: "m1" },
    bundleId: null,
    bundleVersion: null,
    error: null,
    errorSummary: null,
    tags: [],
    rerunOf: null,
    reruns: [],
    createdAt: "2026-11-16T10:00:00.000Z",
    startedAt: "2026-11-16T10:00:01.000Z",
    finishedAt: "2026-11-16T10:00:02.000Z",
    input: {},
    output: { hello: "Ada" },
    alert: null,
    pool: null,
  });
  routes[`GET ${base}/runs/r1/logs`] = () => ({ items: [], done: true });
  routes[`GET ${base}/runs/r1/insight`] = () => ({
    attempts: [],
    worker: null,
    timeoutSeconds: 60,
    uses: [],
    diagnosis: null,
  });
  history.replaceState(null, "", "/t/t1/workspaces/w1/scripts/new");
  show(<AtAddress />);

  const code = await screen.findByLabelText("Source of the new script");
  fireEvent.change(screen.getByLabelText("Path"), { target: { value: "hello/greet" } });
  // Typing a path renames the code area. It is the same one, not a new editor.
  expect(screen.getByLabelText("Source of hello/greet")).toBe(code);

  // The code and the test pane are side by side; running needs no tab.
  const pane = screen.getByRole("region", { name: "Test pane" });
  fireEvent.click(within(pane).getByRole("button", { name: "Save and run" }));

  // The result shows in the pane, beside the code.
  expect(await within(pane).findByRole("tablist", { name: "About this run" })).toBeTruthy();
  expect(location.pathname).toBe("/t/t1/workspaces/w1/scripts/edit/hello/greet");
  // The editor that saved it is still there, and did not read back what it just saved.
  expect(screen.getByLabelText("Source of hello/greet")).toBe(code);
  await waitFor(() => expect(calls.some((one) => one.url === `${base}/test-runs`)).toBe(true));
  expect(
    calls.filter((one) => one.method === "GET" && one.url === `${base}/drafts/hello/greet`),
  ).toEqual([]);
});

test("only a first save keeps the editor: any other address opens a new one", () => {
  const at = (from: string, to: string) => nextEditorKey({ at: from, key: from }, to);
  expect(at("scripts/new", "scripts/edit/hello/greet")).toBe("scripts/new");
  expect(at("extensions/connector/new", "extensions/connector/edit/billing/stripe")).toBe(
    "extensions/connector/new",
  );
  expect(at("scripts/edit/a", "scripts/edit/b")).toBe("scripts/edit/b");
  expect(at("scripts/new", "extensions/connector/edit/a")).toBe("extensions/connector/edit/a");
  expect(at("extensions/connector/new", "extensions/trigger_source/edit/a")).toBe(
    "extensions/trigger_source/edit/a",
  );
});

/** A finished test run as the API gives it. */
const finishedRun = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  script: "hello/greet",
  status: "succeeded",
  state: "succeeded",
  attempt: 1,
  maxAttempts: 1,
  trigger: { type: "manual", draft: true },
  startedBy: { type: "member", id: "m1" },
  bundleId: null,
  bundleVersion: null,
  error: null,
  errorSummary: null,
  tags: [],
  rerunOf: null,
  reruns: [],
  createdAt: "2026-11-16T10:00:00.000Z",
  startedAt: "2026-11-16T10:00:01.000Z",
  finishedAt: "2026-11-16T10:00:02.000Z",
  input: {},
  output: { hello: "Ada" },
  alert: null,
  pool: null,
  ...extra,
});
const draftOf = (code: string) => ({
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

function openSaved() {
  routes[`GET ${base}/drafts/hello/greet`] = () => draftOf("export default async () => ({});\n");
  routes[`GET ${base}/runs/r1`] = () => finishedRun("r1");
  routes[`GET ${base}/runs/r2`] = () => finishedRun("r2");
  for (const id of ["r1", "r2"]) {
    routes[`GET ${base}/runs/${id}/logs`] = () => ({ items: [], done: true });
    routes[`GET ${base}/runs/${id}/insight`] = () => ({
      attempts: [],
      worker: null,
      timeoutSeconds: 60,
      uses: [],
      diagnosis: null,
    });
  }
  history.replaceState(null, "", "/t/t1/workspaces/w1/scripts/edit/hello/greet");
  show(<AtAddress />);
}

test("the run's tab stays as chosen from one run to the next", async () => {
  localStorage.clear();
  let next = 0;
  routes[`POST ${base}/test-runs`] = () => ({ runId: ["r1", "r2"][next++] });
  openSaved();
  const pane = await screen.findByRole("region", { name: "Test pane" });
  fireEvent.click(await within(pane).findByRole("button", { name: "Run the draft" }));
  fireEvent.click(await within(pane).findByRole("tab", { name: "Input and output" }));
  fireEvent.click(within(pane).getByRole("button", { name: "Run the draft" }));
  await waitFor(() => expect(next).toBe(2));
  await waitFor(() =>
    expect(
      within(pane).getByRole("tab", { name: "Input and output" }).getAttribute("aria-selected"),
    ).toBe("true"),
  );
});

test("⌘S saves the draft, and code that does not build lists where, each line a way to it", async () => {
  routes[`PUT ${base}/drafts/hello/greet`] = () => {
    throw new Error("unused");
  };
  openSaved();
  const code = await screen.findByLabelText("Source of hello/greet");
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const path = address.replace("/api/v1", "").split("?")[0] as string;
    calls.push({ method, url: path });
    if (method === "PUT") {
      return new Response(
        JSON.stringify({
          title: "Bad request",
          status: 400,
          detail: "The code written in the console does not build.",
          errors: [{ path: "hello/greet.script.ts:2", message: 'Unexpected ";"' }],
        }),
        { status: 400, headers: { "content-type": "application/problem+json" } },
      );
    }
    return new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  fireEvent.change(code, { target: { value: "export default async () => {\n  return (;\n};\n" } });
  fireEvent.keyDown(code, { key: "s", metaKey: true });
  await waitFor(() => expect(calls.some((one) => one.method === "PUT")).toBe(true));
  const pane = screen.getByRole("region", { name: "Test pane" });
  fireEvent.click(await within(pane).findByRole("tab", { name: "Problems (1)" }));
  const problem = within(pane).getByRole("button", { name: /2:1\s*Unexpected ";"/ });
  fireEvent.click(problem);
  // The text box, standing in for the editor, selects line 2.
  const box = code as HTMLTextAreaElement;
  expect(box.value.slice(box.selectionStart, box.selectionEnd)).toBe("  return (;");
});

test("the divider between code and tests moves by keyboard, and stays where it was left", async () => {
  localStorage.clear();
  openSaved();
  const divider = await screen.findByRole("separator", {
    name: "Resize the code and the test pane",
  });
  expect(divider.getAttribute("aria-valuenow")).toBe("70");
  fireEvent.keyDown(divider, { key: "ArrowLeft", shiftKey: true });
  expect(divider.getAttribute("aria-valuenow")).toBe("60");
  cleanup();
  openSaved();
  expect(
    (
      await screen.findByRole("separator", { name: "Resize the code and the test pane" })
    ).getAttribute("aria-valuenow"),
  ).toBe("60");
});

test("opened from a failed run elsewhere, the editor carries its input and says what is edited", async () => {
  routes["GET /tenants/t1/workspaces/w9/runs/r7"] = () =>
    finishedRun("r7", { bundleVersion: 7, input: { sku: "A-1", apiKey: "[redacted]" } });
  routes["GET /tenants/t1/workspaces/w9"] = () => ({
    id: "w9",
    name: "Production",
    type: "production",
  });
  routes[`GET ${base}/drafts/hello/greet`] = () => draftOf("export default async () => ({});\n");
  history.replaceState(null, "", "/t/t1/workspaces/w1/scripts/edit/hello/greet?fromRun=w9%3Ar7");
  show(<AtAddress />);
  const said = await screen.findByText(/is in the test pane/);
  expect(said.textContent).toContain("enter again: apiKey");
  expect(said.textContent).toContain("Production runs version 7");
  expect(
    within(said).getByRole("link", { name: "the run in Production" }).getAttribute("href"),
  ).toBe("/t/t1/workspaces/w9/runs/r7");
});

test("a draft of a script is discarded, after saying what that does", async () => {
  routes[`DELETE ${base}/drafts/hello/greet`] = () => ({});
  openSaved();
  fireEvent.click(await screen.findByRole("button", { name: "Discard draft" }));
  expect(await answer("Discard")).toContain("goes back to how it was last deployed");
  await waitFor(() =>
    expect(
      calls.some((one) => one.method === "DELETE" && one.url === `${base}/drafts/hello/greet`),
    ).toBe(true),
  );
});

test("a deployed script is removed as a draft that removes it, and the Changes screen shows it", async () => {
  const saved: unknown[] = [];
  routes[`PUT ${base}/drafts/hello/greet`] = (body) => {
    saved.push(body);
    return {};
  };
  routes[`GET ${base}/resources/hello/greet`] = () => ({
    ownership: "ui",
    body: draftOf("export default async () => ({});\n").body,
  });
  history.replaceState(null, "", "/t/t1/workspaces/w1/scripts/edit/hello/greet");
  show(<AtAddress />);
  fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
  expect(await answer("Remove")).toContain("Nothing changes until that draft is deployed");
  await waitFor(() => expect(saved).toHaveLength(1));
  expect(saved[0]).toEqual({ kind: "script", schemaVersion: 1, body: {}, deleted: true });
  await waitFor(() => expect(location.pathname).toBe("/t/t1/workspaces/w1/changes"));
});

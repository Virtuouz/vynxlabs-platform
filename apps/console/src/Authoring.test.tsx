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
  const brought = vi.fn();
  Element.prototype.scrollIntoView = brought;
  fireEvent.click(within(pane).getByRole("button", { name: "Save and run" }));

  // The result shows in the pane, beside the code.
  expect(await within(pane).findByRole("tablist", { name: "About this run" })).toBeTruthy();
  // Round 4: the form sits above the result, so a run brings the result into view.
  await waitFor(() => expect(brought).toHaveBeenCalled());
  expect(brought.mock.contexts[0]).toBe(
    within(pane)
      .getByRole("tablist", { name: "What the test run gave" })
      .closest("div[class*='scroll-mt']"),
  );
  expect(location.pathname).toBe("/t/t1/workspaces/w1/scripts/edit/hello/greet");
  // The editor that saved it is still there, and did not read back what it just saved.
  expect(screen.getByLabelText("Source of hello/greet")).toBe(code);
  await waitFor(() => expect(calls.some((one) => one.url === `${base}/test-runs`)).toBe(true));
  expect(
    calls.filter((one) => one.method === "GET" && one.url === `${base}/drafts/hello/greet`),
  ).toEqual([]);
});

test("a script written in the console can be given a place among the flow's steps (EXT-08)", async () => {
  const puts: { body: { node?: unknown } }[] = [];
  routes[`PUT ${base}/drafts/hello/greet`] = (body) => {
    puts.push({ body: (body as { body: { node?: unknown } }).body });
    return { ...(body as object), path: "hello/greet", revision: 1 };
  };
  history.replaceState(null, "", "/t/t1/workspaces/w1/scripts/new");
  show(<AtAddress />);
  const code = await screen.findByLabelText("Source of the new script");
  fireEvent.change(screen.getByLabelText("Path"), { target: { value: "hello/greet" } });
  // Nothing to choose until the script is given a name as a step.
  expect(screen.queryByLabelText("Group")).toBeNull();
  fireEvent.change(screen.getByLabelText("Step name"), { target: { value: "Greet someone" } });
  fireEvent.change(await screen.findByLabelText("Group"), { target: { value: "Greetings" } });
  fireEvent.change(screen.getByLabelText("Icon"), { target: { value: "mail" } });
  fireEvent.keyDown(code, { key: "s", metaKey: true });
  await waitFor(() => expect(puts.length).toBeGreaterThan(0));
  expect(puts.at(-1)?.body.node).toEqual({
    label: "Greet someone",
    category: "Greetings",
    icon: "mail",
  });
  // Emptied, the script is no longer a step: the draft carries no `node`.
  fireEvent.change(screen.getByLabelText("Step name"), { target: { value: "" } });
  fireEvent.keyDown(code, { key: "s", metaKey: true });
  await waitFor(() => expect(puts.at(-1)?.body.node).toBeUndefined());
  // Typed again, it has the icon and group it had.
  fireEvent.change(screen.getByLabelText("Step name"), { target: { value: "Greet them" } });
  fireEvent.keyDown(code, { key: "s", metaKey: true });
  await waitFor(() =>
    expect(puts.at(-1)?.body.node).toEqual({
      label: "Greet them",
      category: "Greetings",
      icon: "mail",
    }),
  );
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

test("Ctrl+Enter runs with what the test pane holds now, as its Run button does (P31)", async () => {
  const sent: unknown[] = [];
  routes[`POST ${base}/test-runs`] = (body) => {
    sent.push(body);
    return { runId: "r1" };
  };
  openSaved();
  routes[`GET ${base}/drafts/hello/greet`] = () => {
    const draft = draftOf("export default async () => ({});\n");
    return {
      ...draft,
      body: {
        ...draft.body,
        input: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
      },
    };
  };
  const pane = await screen.findByRole("region", { name: "Test pane" });
  fireEvent.change(await within(pane).findByLabelText(/^name/i), { target: { value: "Ada" } });
  fireEvent.keyDown(document.body, { key: "Enter", ctrlKey: true });
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]).toMatchObject({ script: "hello/greet", input: { name: "Ada" } });
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

test("a script drafted for removal opens as a removal: its deployed code, read only, and nothing is saved (SCR-11)", async () => {
  const saved: unknown[] = [];
  routes[`PUT ${base}/drafts/hello/greet`] = (body) => {
    saved.push(body);
    return {};
  };
  routes[`GET ${base}/drafts/hello/greet`] = () => ({
    path: "hello/greet",
    kind: "script",
    revision: 2,
    deleted: true,
    body: {},
  });
  routes[`GET ${base}/resources/hello/greet`] = () => ({
    ownership: "ui",
    body: draftOf("export default async () => ({});\n").body,
  });
  history.replaceState(null, "", "/t/t1/workspaces/w1/scripts/edit/hello/greet");
  show(<AtAddress />);
  expect(await screen.findByText(/This script is removed in your drafts/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Keep this script" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
  // An autosave would have run by now.
  await new Promise((done) => setTimeout(done, 3400));
  expect(saved).toEqual([]);
}, 15_000);

test("a new script gets the SDK's wait between tries and backoff, and both can be changed (SCR-15)", async () => {
  const saved: { body: { retries?: unknown } }[] = [];
  routes[`PUT ${base}/drafts/hello/greet`] = (body) => {
    saved.push(body as { body: { retries?: unknown } });
    return { ...(body as object), path: "hello/greet", revision: 1 };
  };
  history.replaceState(null, "", "/t/t1/workspaces/w1/scripts/new");
  show(<AtAddress />);
  await screen.findByLabelText("Source of the new script");
  expect((screen.getByLabelText("Give up after (seconds)") as HTMLInputElement).value).toBe("60");
  expect((screen.getByLabelText("Wait between tries (seconds)") as HTMLInputElement).value).toBe(
    "30",
  );
  const backoff = screen.getByLabelText("Wait longer after each failed try") as HTMLInputElement;
  expect(backoff.checked).toBe(true);
  fireEvent.click(backoff);
  fireEvent.change(screen.getByLabelText("Path"), { target: { value: "hello/greet" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saved.length).toBeGreaterThan(0));
  expect(saved[0]?.body.retries).toEqual({ limit: 0, delaySeconds: 30, backoff: false });
});

test("the list's inspector offers a script to an agent only when it is deployed (SCR-12)", async () => {
  const row = (path: string, deployed: boolean) => ({
    path,
    ownership: "ui",
    draft: !deployed,
    deployed,
    lastRun: null,
    failedInARow: 0,
    retries: 0,
    inputSchema: { type: "object" },
    uses: { connections: [], secrets: [], variables: [], tables: [] },
  });
  routes[`GET ${base}/scripts`] = () => ({
    items: [row("hello/live", true), row("hello/new", false)],
  });
  history.replaceState(null, "", "/t/t1/workspaces/w1/scripts?item=hello%2Fnew");
  show(<AtAddress />);
  await screen.findByRole("button", { name: "Open editor" });
  expect(screen.queryByRole("button", { name: /Offer to an agent/ })).toBeNull();
  cleanup();
  history.replaceState(null, "", "/t/t1/workspaces/w1/scripts?item=hello%2Flive");
  show(<AtAddress />);
  await screen.findByRole("button", { name: "Open editor" });
  expect(screen.getByRole("button", { name: /Offer to an agent/ })).toBeTruthy();
});

test("SCR-08, EXT-MP3: a script's memory, concurrency, worker pool, the rest of what it uses, and what happens when it fails are set in Settings", async () => {
  routes[`GET /tenants/t1/worker-pools`] = () => ({
    items: [
      { id: null, name: null, description: "" },
      { id: "p1", name: "eu-office", description: "" },
    ],
  });
  routes[`GET ${base}/tables`] = () => ({ items: [{ name: "orders" }] });
  routes[`GET ${base}/data-source-bindings`] = () => ({ items: [{ path: "warehouse" }] });
  routes[`GET ${base}/connection-groups`] = () => ({ items: [{ path: "stores" }] });
  routes[`GET ${base}/resources`] = () => ({ items: [{ path: "order/placed", kind: "event" }] });
  routes[`GET ${base}/scripts`] = () => ({ items: [{ path: "ops/alert" }] });
  routes[`GET ${base}/connection-bindings`] = () => ({ items: [{ path: "chat" }] });
  let saved: { body: Record<string, unknown> } | undefined;
  routes[`PUT ${base}/drafts/hello/greet`] = (body) => {
    saved = body as { body: Record<string, unknown> };
    return { path: "hello/greet", revision: 2, body: (body as { body: object }).body };
  };
  openSaved();
  fireEvent.input(await screen.findByLabelText("Memory (MB)"), { target: { value: "1024" } });
  fireEvent.input(screen.getByLabelText("Runs at once"), { target: { value: "4" } });
  fireEvent.input(screen.getByLabelText("One lane for each value of"), {
    target: { value: "input.customer" },
  });
  fireEvent.change(screen.getByLabelText("Worker pool"), { target: { value: "eu-office" } });
  fireEvent.change(screen.getByLabelText("If it fails for the last time, start"), {
    target: { value: "ops/alert" },
  });
  fireEvent.change(screen.getByLabelText("and send a summary through"), {
    target: { value: "chat" },
  });
  fireEvent.click(await screen.findByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saved).toBeTruthy());
  expect(saved?.body).toMatchObject({
    memoryMb: 1024,
    concurrency: { key: "input.customer", limit: 4 },
    worker: "eu-office",
    onFailure: { script: "ops/alert", notify: "chat" },
  });
  expect(screen.getByText("Tables it reads and writes")).toBeTruthy();
  expect(screen.getByText("Data sources it uses")).toBeTruthy();
  expect(screen.getByText("Events it may publish")).toBeTruthy();
  expect(screen.getByText("Connection groups it picks from")).toBeTruthy();
});

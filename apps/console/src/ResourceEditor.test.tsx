// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ResourceEditor, resourceProblems } from "./screens/ResourceEditor.tsx";
import { show } from "./testing.tsx";

const root = "/tenants/t1/workspaces/w1";
const link = "/t/t1/workspaces/w1";
let calls: { method: string; url: string; body: Record<string, unknown> | undefined }[];
let stored: Record<string, { ownership: string; body: Record<string, unknown> }>;

beforeEach(() => {
  calls = [];
  stored = {
    "orders/nightly": {
      ownership: "code",
      body: { script: "orders/sync", cron: "0 2 * * *", input: { full: true } },
    },
  };
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url: address, body });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (method === "PUT") return json({ body: body.body, revision: 1 });
    if (address.endsWith("/resources")) {
      return json({
        items: [
          { path: "orders/sync", kind: "script", body: {} },
          { path: "orders/placed", kind: "event", body: {} },
          { path: "connectors/shop", kind: "connector", body: {} },
          { path: "sources/inbox", kind: "trigger_source", body: { mode: "poll" } },
        ],
      });
    }
    if (address.endsWith("/drafts")) return json({ items: [] });
    if (address.endsWith("/secrets")) return json({ items: [{ name: "SHOP_SIGNING" }] });
    const drafted = /\/drafts\/(.+)$/.exec(address);
    if (drafted) return json({ title: "Not Found", status: 404, detail: "none" }, 404);
    const resource = /\/resources\/(.+)$/.exec(address);
    if (resource && stored[resource[1] as string]) return json(stored[resource[1] as string]);
    return json({ items: [] });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const saved = () => calls.find((call) => call.method === "PUT");

test("what a resource still needs is said before the server is asked", () => {
  expect(resourceProblems("schedule", { script: "", cron: " " }, { input: "[1]" })).toEqual([
    "The input is not a JSON object.",
    "Choose the script it starts.",
    "Say when, as a cron line.",
  ]);
  expect(resourceProblems("trigger", { type: "event", script: "a" }, {})).toEqual([
    "Choose the event it listens for.",
  ]);
  expect(
    resourceProblems("trigger", { type: "webhook", script: "a", verify: { secret: "" } }, {}),
  ).toEqual(["Choose the secret the signature is checked against."]);
  expect(resourceProblems("event", {}, { payload: "{not json" })).toEqual([
    "The payload schema is not a JSON object.",
  ]);
  expect(resourceProblems("connection", { connector: "smtp" }, {})).toEqual([]);
  expect(resourceProblems("variable", {}, {})).toEqual([]);
});

test("a variable is made with a path, a purpose and a default, and saved as a draft", async () => {
  show(<ResourceEditor root={root} link={link} kind="variable" path={undefined} editable />);
  fireEvent.change(await screen.findByLabelText("Path of the new variable"), {
    target: { value: "orders/batch-size" },
  });
  fireEvent.change(screen.getByLabelText("What it is for"), {
    target: { value: "How many orders at once." },
  });
  fireEvent.change(screen.getByLabelText("Value when a workspace sets none (optional)"), {
    target: { value: "50" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saved()).toBeTruthy());
  expect(saved()).toEqual({
    method: "PUT",
    url: `/api/v1${root}/drafts/orders/batch-size`,
    body: {
      kind: "variable",
      schemaVersion: 1,
      body: { description: "How many orders at once.", default: "50" },
    },
  });
  await screen.findByText("Draft");
});

test("a path that is not one is refused here, and nothing is sent", async () => {
  show(<ResourceEditor root={root} link={link} kind="event" path={undefined} editable />);
  fireEvent.change(await screen.findByLabelText("Path of the new event"), {
    target: { value: "Orders Placed" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText(/Give the event a path/);
  expect(saved()).toBeUndefined();
});

test("a schedule from the repository opens with its settings, and saving takes it over", async () => {
  show(<ResourceEditor root={root} link={link} kind="schedule" path="orders/nightly" editable />);
  expect(((await screen.findByLabelText("When, as a cron line")) as HTMLInputElement).value).toBe(
    "0 2 * * *",
  );
  expect(screen.getByText(/managed in the tenant's repository/)).toBeTruthy();
  // What is written as JSON is shown as JSON.
  expect(
    (screen.getByLabelText("Input for the script (optional), as JSON") as HTMLTextAreaElement)
      .value,
  ).toContain('"full": true');
  // A source for schedules is offered because the workspace has one.
  expect(screen.getByText("Trigger source (optional)")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Time zone (optional)"), {
    target: { value: "Europe/London" },
  });
  fireEvent.click(screen.getByLabelText("Turned on"));
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saved()).toBeTruthy());
  expect(saved()?.body?.body).toEqual({
    script: "orders/sync",
    cron: "0 2 * * *",
    input: { full: true },
    timezone: "Europe/London",
    enabled: false,
  });
});

test("a trigger is a webhook, an event or a form, each with its own settings", async () => {
  show(<ResourceEditor root={root} link={link} kind="trigger" path={undefined} editable />);
  fireEvent.change(await screen.findByLabelText("Path of the new trigger"), {
    target: { value: "hooks/feedback" },
  });
  // A webhook that starts a script is answered at once: only a flow can answer its request.
  expect(screen.getByLabelText("Each request is checked")).toBeTruthy();
  expect(screen.queryByLabelText("The request is answered")).toBeNull();
  fireEvent.change(screen.getByLabelText("It starts the script"), { target: { value: "form" } });
  fireEvent.change(screen.getByLabelText("Title of the form"), {
    target: { value: "Tell us how it went" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  // It has no script yet, and says so without asking the server.
  await screen.findByText("Choose the script it starts.");
  expect(saved()).toBeUndefined();
});

test("a production workspace shows a resource and offers no way to change it", async () => {
  show(
    <ResourceEditor
      root={root}
      link={link}
      kind="schedule"
      path="orders/nightly"
      editable={false}
    />,
  );
  await screen.findByText(/This is a production workspace/);
  expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
  expect((screen.getByLabelText("When, as a cron line") as HTMLInputElement).disabled).toBe(true);
});

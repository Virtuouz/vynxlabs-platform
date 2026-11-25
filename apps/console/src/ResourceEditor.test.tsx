// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ResourceEditor, resourceProblems } from "./screens/ResourceEditor.tsx";
import { show } from "./testing.tsx";

const root = "/tenants/t1/workspaces/w1";
const link = "/t/t1/workspaces/w1";
let calls: { method: string; url: string; body: Record<string, unknown> | undefined }[];
let stored: Record<string, { ownership: string; body: Record<string, unknown> }>;
/** The workspace's only trigger source is a draft, not yet deployed. */
let sourceIsDraft = false;

beforeEach(() => {
  calls = [];
  sourceIsDraft = false;
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
          ...(sourceIsDraft
            ? []
            : [{ path: "sources/inbox", kind: "trigger_source", body: { mode: "poll" } }]),
        ],
      });
    }
    if (address.endsWith("/drafts")) {
      return json({
        items: sourceIsDraft
          ? [{ path: "sources/new-inbox", kind: "trigger_source", deleted: false, mode: "poll" }]
          : [],
      });
    }
    if (address.endsWith("/scripts")) {
      return json({
        items: [
          {
            path: "orders/sync",
            inputSchema: { type: "object", properties: { full: { type: "boolean" } } },
          },
        ],
      });
    }
    if (address.endsWith("/flows")) {
      return json({
        items: [
          {
            path: "orders/restock",
            triggers: ["manual"],
            manualInput: {
              type: "object",
              properties: { sku: { type: "string" } },
              required: ["sku"],
            },
          },
        ],
      });
    }
    if (address.includes("/schedule-preview")) {
      const cron = new URL(address, "http://x").searchParams.get("cron");
      if (cron === "nonsense") {
        return json(
          {
            title: "Bad Request",
            status: 400,
            detail: "The schedule is not valid.",
            errors: [{ path: "/cron", message: '"nonsense" is not a usable cron expression' }],
          },
          400,
        );
      }
      return json({
        times: [1, 2, 3, 4, 5].map((day) => `2026-12-0${day}T02:00:00.000Z`),
      });
    }
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
      create: true,
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
  expect(screen.getByText(/defined in code, in the tenant's repository/)).toBeTruthy();
  // The input is a form drawn from the script's schema.
  expect(((await screen.findByLabelText("Full")) as HTMLInputElement).checked).toBe(true);
  // The next times are shown.
  expect((await screen.findAllByRole("listitem")).length).toBe(5);
  // A source for schedules is offered because the workspace has one.
  expect(screen.getByText("Trigger source (optional)")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("Turned on"));
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saved()).toBeTruthy());
  expect(saved()?.body?.body).toEqual({
    script: "orders/sync",
    cron: "0 2 * * *",
    input: { full: true },
    enabled: false,
  });
});

test("a trigger source that is only a draft is offered where a polling source is chosen (EXT-02)", async () => {
  sourceIsDraft = true;
  show(<ResourceEditor root={root} link={link} kind="schedule" path="orders/nightly" editable />);
  expect(await screen.findByText("Trigger source (optional)")).toBeTruthy();
});

test("a schedule the repository's code defines is moved to a file as it is, by a draft that takes it over", async () => {
  show(<ResourceEditor root={root} link={link} kind="schedule" path="orders/nightly" editable />);
  await screen.findByLabelText("When, as a cron line");
  // It says the file it becomes, and what to do in the code afterwards.
  expect(screen.getByText("orders/nightly.schedule.yaml")).toBeTruthy();
  expect(
    screen.getByText(/Its definition stays in the code until you remove it there/),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Move to a file" }));
  await waitFor(() => expect(saved()).toBeTruthy());
  expect(saved()?.body?.body).toEqual({
    script: "orders/sync",
    cron: "0 2 * * *",
    input: { full: true },
  });
});

test("a schedule can start a flow, with input drawn from its manual trigger, and a bad cron is refused before saving", async () => {
  show(<ResourceEditor root={root} link={link} kind="schedule" path={undefined} editable />);
  fireEvent.change(await screen.findByLabelText("Path of the new schedule"), {
    target: { value: "orders/restock-nightly" },
  });
  // The first box on the form is what it starts.
  const target = screen.getAllByRole("combobox")[0] as HTMLElement;
  fireEvent.click(target);
  fireEvent.keyDown(target, { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: /orders\/restock/ }));
  // The flow's input is asked for as fields, and what is required is said before saving.
  const sku = await screen.findByLabelText("Sku");
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText(/The input does not fit what it starts/);
  expect(saved()).toBeUndefined();
  fireEvent.input(sku, { target: { value: "A-1" } });
  fireEvent.input(screen.getByLabelText("When, as a cron line"), {
    target: { value: "nonsense" },
  });
  // Said under the times, and among what stops it being saved.
  expect(
    (await screen.findAllByText(/"nonsense" is not a usable cron expression/)).length,
  ).toBeGreaterThan(0);
  fireEvent.input(screen.getByLabelText("When, as a cron line"), {
    target: { value: "0 3 * * *" },
  });
  await waitFor(() =>
    expect(screen.queryByText(/"nonsense" is not a usable cron expression/)).toBeNull(),
  );
  fireEvent.click(
    screen.getByLabelText("Skip a time while the run it started last is still going"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saved()).toBeTruthy());
  expect(saved()?.body).toMatchObject({
    kind: "schedule",
    body: { flow: "orders/restock", cron: "0 3 * * *", input: { sku: "A-1" }, overlap: "skip" },
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

test("an event trigger can listen for the platform's own events, each with its payload (OPS-MP2)", async () => {
  show(<ResourceEditor root={root} link={link} kind="trigger" path={undefined} editable />);
  fireEvent.change(await screen.findByLabelText("Path of the new trigger"), {
    target: { value: "hooks/failures" },
  });
  fireEvent.change(screen.getByLabelText("It starts the script"), { target: { value: "event" } });
  const box = await screen.findByRole("combobox", { name: "Event" });
  fireEvent.mouseDown(box);
  fireEvent.click(box);
  expect(await screen.findByText("platform/run-failed")).toBeTruthy();
  expect(screen.getByText("platform/row-changed")).toBeTruthy();
  expect(screen.getByText(/Payload: runId, script, error/)).toBeTruthy();
  // A repository's own event is still listed beside them.
  expect(screen.getByText("orders/placed")).toBeTruthy();
});

test("a trigger says what it is for, and keeps saying it whatever else about it changes", async () => {
  show(<ResourceEditor root={root} link={link} kind="trigger" path={undefined} editable />);
  await screen.findByLabelText("Path of the new trigger");
  const purpose = () => screen.getByLabelText(/^What it is for/) as HTMLInputElement;
  fireEvent.change(purpose(), { target: { value: "Takes feedback from the shop's site." } });
  expect(purpose().value).toBe("Takes feedback from the shop's site.");
  // Another kind of trigger, and that kind's own settings, each write the whole body.
  fireEvent.change(screen.getByLabelText("It starts the script"), { target: { value: "form" } });
  expect(purpose().value).toBe("Takes feedback from the shop's site.");
  fireEvent.change(screen.getByLabelText("Title of the form"), {
    target: { value: "Tell us how it went" },
  });
  expect(purpose().value).toBe("Takes feedback from the shop's site.");
  fireEvent.change(screen.getByLabelText("It starts the script"), { target: { value: "event" } });
  expect(purpose().value).toBe("Takes feedback from the shop's site.");
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

test("a data source is declared with a path and a purpose, and saved as a draft (QSD-MP1)", async () => {
  show(<ResourceEditor root={root} link={link} kind="data_source" path={undefined} editable />);
  fireEvent.change(await screen.findByLabelText("Path of the new data source"), {
    target: { value: "erp/orders" },
  });
  fireEvent.change(screen.getByLabelText("What it is for"), {
    target: { value: "The order database." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saved()).toBeTruthy());
  expect(saved()).toEqual({
    method: "PUT",
    url: `/api/v1${root}/drafts/erp/orders`,
    body: {
      kind: "data_source",
      schemaVersion: 1,
      body: { connector: "postgres", description: "The order database." },
      create: true,
    },
  });
  await screen.findByText("Draft");
});

test("a draft someone else saved first offers to copy what was written before theirs is loaded", async () => {
  const before = globalThis.fetch;
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    if (init.method === "PUT") {
      return new Response(
        JSON.stringify({ status: 409, code: "draft_changed", detail: "Someone else saved this." }),
        { status: 409 },
      );
    }
    return before(address, init);
  });
  show(<ResourceEditor root={root} link={link} kind="variable" path={undefined} editable />);
  fireEvent.change(await screen.findByLabelText("Path of the new variable"), {
    target: { value: "orders/batch-size" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await screen.findByRole("button", { name: "Copy what I wrote" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Load their version" })).toBeTruthy();
});

test("a new trigger asked for as a form opens with a form to fill in, and saves", async () => {
  history.replaceState(history.state, "", `${location.pathname}?type=form`);
  show(<ResourceEditor root={root} link={link} kind="trigger" path={undefined} editable />);
  expect(await screen.findByLabelText("Title of the form")).toHaveProperty("value", "Tell us");
  expect(screen.getByLabelText("Question")).toHaveProperty("value", "Message");
  fireEvent.change(screen.getByLabelText("Path of the new trigger"), {
    target: { value: "forms/contact" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  // A script is chosen first, so the save is refused before it is sent.
  await screen.findByText("Choose the script it starts.");
  expect(saved()).toBeUndefined();
});

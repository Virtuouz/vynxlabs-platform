// @vitest-environment happy-dom
import { cleanup, configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { changedScript, FlowEditor } from "./screens/FlowEditor.tsx";
import type { PickableNode } from "./screens/FlowSteps.tsx";
import { show } from "./testing.tsx";

// The settings of a flow's steps that the inspector once left to code: what each is drawn as,
// and what the draft then holds. Each test opens a flow, changes a field as a person does, and
// reads the autosaved draft.

configure({ asyncUtilTimeout: 15_000 });
vi.setConfig({ testTimeout: 30_000 });

const root = "/tenants/t1/workspaces/w1";
const link = "/t/t1/workspaces/w1";
const api = `/api/v1${root}`;
let puts: { body: { body: FlowBody } }[];
let deployed: FlowBody;
let asked: string[];

interface FlowBody {
  nodes: Record<string, Record<string, unknown>>;
  edges: { from: string; to: string; output?: string; error?: boolean }[];
}

const sendEmail = {
  path: "core/send-email",
  label: "Send email",
  category: "Core",
  description: "Sends a message.",
  takes: ["connection"],
  input: {
    properties: {
      connection: { type: "string", title: "Mail connection", "x-pick": "connection" },
      subject: { type: "string", title: "Subject" },
    },
    required: ["connection", "subject"],
  },
};
const gate = {
  path: "core/gate",
  label: "Gate",
  category: "Core",
  description: "Lets a few through.",
  takes: [],
  input: {
    properties: {
      level: { type: "integer", title: "Level", enum: [1, 2] },
      flag: { type: "boolean", title: "Flag" },
    },
    required: [],
  },
};

beforeEach(() => {
  puts = [];
  asked = [];
  history.replaceState(null, "", "/");
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const path = address.split("?")[0] as string;
    asked.push(`${method} ${address}`);
    const send = (status: number, reply: unknown) =>
      new Response(reply === null ? null : JSON.stringify(reply), { status });
    if (method === "PUT" && path === `${api}/drafts/orders/sync`) {
      puts.push({ body: JSON.parse(init.body as string) });
      return send(200, { revision: puts.length });
    }
    if (method !== "GET") return send(204, null);
    if (path === `${api}/drafts/orders/sync`) return send(404, { code: "not_found", detail: "" });
    if (path === `${api}/resources/orders/sync`)
      return send(200, { ownership: "ui", body: deployed });
    if (path === api) return send(200, { timeZone: "UTC" });
    if (path === `${api}/scripts`) return send(200, { items: [] });
    if (path === "/api/v1/core-nodes") return send(200, { items: [sendEmail, gate] });
    if (path === "/api/v1/tenants/t1/groups")
      return send(200, {
        items: [
          { key: "finance", name: "Finance" },
          { key: "ops", name: "Operations" },
        ],
      });
    if (path === "/api/v1/tenants/t1/roles") return send(200, { items: [{ name: "Approver" }] });
    return send(200, { items: [] });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const manual = { type: "trigger", trigger: { type: "manual" } };

async function openAt(body: FlowBody, step: string, settings: string | RegExp) {
  deployed = body;
  history.replaceState(null, "", `/?step=${step}`);
  show(<FlowEditor root={root} link={link} path="orders/sync" />);
  await screen.findByText(settings);
}
const lastSaved = async (): Promise<FlowBody> => {
  await waitFor(() => expect(puts.length).toBeGreaterThan(0));
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return (puts.at(-1) as (typeof puts)[number]).body.body;
};
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("the inspector of a flow's steps", () => {
  test("a For each says how many items run at once (FLW-MP1)", async () => {
    await openAt(
      {
        nodes: {
          start: manual,
          each: { type: "foreach", items: "trigger.list", script: "jobs/one" },
        },
        edges: [{ from: "start", to: "each" }],
      },
      "each",
      "Keep going when an item fails",
    );
    change("How many at once (optional)", "5");
    expect((await lastSaved()).nodes.each).toMatchObject({ concurrency: 5 });
  });

  test("a step shows what it hands its script, and one can be taken away (FLW-MP3)", async () => {
    await openAt(
      {
        nodes: {
          start: manual,
          send: {
            type: "script",
            script: "core/send-email",
            inputs: {},
            with: { connections: ["crm/main"], tables: ["orders"] },
          },
        },
        edges: [{ from: "start", to: "send" }],
      },
      "send",
      "Sends a message.",
    );
    // A grant written in code is shown even though the workspace does not list it.
    fireEvent.click(await screen.findByRole("button", { name: "Remove crm/main" }));
    const saved = await lastSaved();
    expect(saved.nodes.send?.with).toEqual({ tables: ["orders"] });
  });

  test("an approval's time limit is a number with a unit, and Wait is the same field (FLW-MP4)", async () => {
    await openAt(
      {
        nodes: {
          start: manual,
          gate: { type: "approval", title: "Approve", timeoutSeconds: 7200 },
        },
        edges: [{ from: "start", to: "gate" }],
      },
      "gate",
      "Where it waits",
    );
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("2");
    expect((screen.getByLabelText("Unit") as HTMLSelectElement).value).toBe("3600");
    change("Amount", "3");
    expect((await lastSaved()).nodes.gate).toMatchObject({ timeoutSeconds: 10800 });
    cleanup();

    await openAt(
      {
        nodes: { start: manual, wait: { type: "delay", seconds: 86400 } },
        edges: [{ from: "start", to: "wait" }],
      },
      "wait",
      /How long to wait/,
    );
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("1");
    expect((screen.getByLabelText("Unit") as HTMLSelectElement).value).toBe("86400");
  });

  test("an approval says who may decide, by group and role (FLW-MP5)", async () => {
    await openAt(
      {
        nodes: {
          start: manual,
          gate: {
            type: "approval",
            title: "Approve",
            approvers: { groups: ["finance"], roles: ["Approver"] },
          },
        },
        edges: [{ from: "start", to: "gate" }],
      },
      "gate",
      "Where it waits",
    );
    expect(screen.getByText(/Only a member of one of these groups/)).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Remove finance" }));
    expect((await lastSaved()).nodes.gate?.approvers).toEqual({ roles: ["Approver"] });
  });

  test("with nobody named, an approval says anyone with the permission may decide (FLW-MP5)", async () => {
    await openAt(
      {
        nodes: { start: manual, gate: { type: "approval", title: "Approve" } },
        edges: [{ from: "start", to: "gate" }],
      },
      "gate",
      "Where it waits",
    );
    expect(screen.getByText(/Anyone who holds the approval permission may decide/)).toBeTruthy();
  });

  test("an event start has its filter, which is not worked out against a run (FLW-MP6)", async () => {
    await openAt(
      {
        nodes: { start: { type: "trigger", trigger: { type: "event", event: "orders/new" } } },
        edges: [],
      },
      "start",
      /Only when \(optional\)/,
    );
    change("Only when (optional)", "event.payload.amount > 100");
    expect((await lastSaved()).nodes.start?.trigger).toMatchObject({
      type: "event",
      event: "orders/new",
      filter: "event.payload.amount > 100",
    });
    // It sees event and nothing else: no preview asks for `trigger` and `steps` to be read.
    expect(asked.filter((one) => one.includes("/expressions/value"))).toEqual([]);
    expect(screen.queryByText("Gives")).toBeNull();
  });

  test.each([
    ["a webhook", { type: "webhook" }],
    ["a schedule", { type: "schedule", cron: "0 9 * * *" }],
    ["an event", { type: "event", event: "orders/new" }],
  ])("%s start gives its runs tags (FLW-MP7)", async (_name, trigger) => {
    await openAt(
      { nodes: { start: { type: "trigger", trigger } }, edges: [] },
      "start",
      /Tags for each run/,
    );
    change("Tags for each run (optional)", "'order:' + string(trigger.id)\n\n'vip'");
    expect((await lastSaved()).nodes.start?.trigger).toMatchObject({
      tags: ["'order:' + string(trigger.id)", "'vip'"],
    });
  });

  test("a manual start takes a JSON Schema for its input, and says when it is not JSON (FLW-MP8)", async () => {
    await openAt({ nodes: { start: manual }, edges: [] }, "start", /What it takes, as JSON Schema/);
    change("What it takes, as JSON Schema (optional)", '{"type": "object", ');
    expect(
      await screen.findByText(/This is not JSON yet, so the schema is not saved/),
    ).toBeTruthy();
    change(
      "What it takes, as JSON Schema (optional)",
      '{"type":"object","properties":{"sku":{"type":"string"}},"required":["sku"]}',
    );
    const saved = await lastSaved();
    expect(saved.nodes.start?.trigger).toEqual({
      type: "manual",
      input: { type: "object", properties: { sku: { type: "string" } }, required: ["sku"] },
    });
  });

  test("changing how a flow starts and back keeps what that start had (FLW-31)", async () => {
    const input = { type: "object", properties: { sku: { type: "string" } } };
    await openAt(
      { nodes: { start: { type: "trigger", trigger: { type: "manual", input } } }, edges: [] },
      "start",
      /What it takes, as JSON Schema/,
    );
    change("It starts", "event");
    await screen.findByLabelText(/^Event/);
    change("It starts", "manual");
    await screen.findByText(/What it takes, as JSON Schema/);
    const saved = await lastSaved();
    expect(saved.nodes.start?.trigger).toEqual({ type: "manual", input });
  });

  test("a signed webhook says what was signed, the timestamp header and how old a request may be (FLW-MP9)", async () => {
    await openAt(
      {
        nodes: {
          start: {
            type: "trigger",
            trigger: {
              type: "webhook",
              verify: { scheme: "hmac-sha256", header: "x-signature", secret: "hook" },
            },
          },
        },
        edges: [],
      },
      "start",
      /What the sender signed/,
    );
    change("What the sender signed", "v0:{timestamp}:{body}");
    // What is signed includes the timestamp, so the header it comes in is needed.
    expect(
      await screen.findByText(/Name the header: what was signed includes the timestamp/),
    ).toBeTruthy();
    change("Header the timestamp is sent in", "x-slack-request-timestamp");
    change("Amount", "10");
    change("Unit", "60");
    const saved = await lastSaved();
    const verify = (saved.nodes.start as unknown as { trigger: { verify: unknown } }).trigger
      .verify;
    expect(verify).toEqual({
      scheme: "hmac-sha256",
      header: "x-signature",
      secret: "hook",
      signed: "v0:{timestamp}:{body}",
      timestampHeader: "x-slack-request-timestamp",
      toleranceSeconds: 600,
    });
  });

  test.each([
    ["a Set", { type: "set", values: { a: "1" } }],
    ["a Branch", { type: "branch", cases: [{ name: "big", when: "trigger.n > 1" }] }],
  ])("%s has an error path, chosen by field (FLW-MP10)", async (_name, step) => {
    await openAt(
      {
        nodes: { start: manual, calc: step, oops: { type: "fail", message: "'no'" } },
        edges: [
          { from: "start", to: "calc" },
          ...(step.type === "branch"
            ? [{ from: "calc", to: "oops", output: "big" }]
            : [{ from: "calc", to: "oops" }]),
        ],
      },
      "calc",
      /Where it goes next/,
    );
    change("On failure, go to", "oops");
    const saved = await lastSaved();
    expect(saved.edges).toContainEqual({ from: "calc", to: "oops", error: true });
  });

  test("a choice, a yes/no and a pick can each be given by an expression (FLW-MP11)", async () => {
    await openAt(
      {
        nodes: { start: manual, gate: { type: "script", script: "core/gate", inputs: {} } },
        edges: [{ from: "start", to: "gate" }],
      },
      "gate",
      "Lets a few through.",
    );
    const switches = screen.getAllByRole("checkbox", { name: "Use an expression" });
    expect(switches).toHaveLength(2);
    fireEvent.click(switches[0] as HTMLElement);
    change("Level (optional)", "trigger.level");
    expect((await lastSaved()).nodes.gate).toMatchObject({ inputs: { level: "trigger.level" } });
    cleanup();

    await openAt(
      {
        nodes: {
          start: manual,
          send: {
            type: "script",
            script: "core/send-email",
            inputs: { connection: "trigger.connection", subject: "'Hi'" },
          },
        },
        edges: [{ from: "start", to: "send" }],
      },
      "send",
      "Sends a message.",
    );
    // An expression that is not a chosen connection is shown as the expression it is.
    expect((screen.getByLabelText("Mail connection") as HTMLTextAreaElement).value).toBe(
      "trigger.connection",
    );
    expect(
      (screen.getByRole("checkbox", { name: "Use an expression" }) as HTMLInputElement).checked,
    ).toBe(true);
  });

  test("the script a step runs is changed in place, keeping the fields the new one has (FLW-MP12)", async () => {
    await openAt(
      {
        nodes: {
          start: manual,
          send: {
            type: "script",
            script: "core/send-email",
            inputs: { connection: "'mail/outbox'", subject: "'Hi'" },
            with: { connections: ["mail/outbox"] },
          },
        },
        edges: [{ from: "start", to: "send" }],
      },
      "send",
      "Sends a message.",
    );
    const script = within(
      screen.getByRole("complementary", { name: "The chosen step" }),
    ).getAllByRole("combobox")[0] as HTMLInputElement;
    expect(script.value).toBe("Send email");
    fireEvent.click(script);
    fireEvent.keyDown(script, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: /Gate/ }));
    const saved = await lastSaved();
    expect(saved.nodes.send).toEqual({ type: "script", script: "core/gate", inputs: {} });
  });

  test("changing script keeps what the new one has, takes back what the old one's picks handed over", () => {
    const specs = new Map<string, PickableNode>([
      [sendEmail.path, sendEmail as PickableNode],
      [gate.path, gate as PickableNode],
    ]);
    expect(
      changedScript(
        {
          type: "script",
          script: "core/send-email",
          inputs: { connection: "'mail/outbox'", subject: "'Hi'" },
          with: { connections: ["mail/outbox", "crm/main"] },
        },
        "core/gate",
        specs,
      ),
    ).toEqual({ script: "core/gate", inputs: {}, with: { connections: ["crm/main"] } });
  });
});

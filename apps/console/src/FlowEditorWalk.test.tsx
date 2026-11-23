// @vitest-environment happy-dom
import { cleanup, configure, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FlowEditor } from "./screens/FlowEditor.tsx";
import { show } from "./testing.tsx";

// What a person does in the flow editor, and what it then saves: the editor is drawn, a
// step is chosen as the address says, a field is changed, and the autosaved draft is read.

configure({ asyncUtilTimeout: 15_000 });

const root = "/tenants/t1/workspaces/w1";
const api = `/api/v1${root}`;
const link = "/t/t1/workspaces/w1";
let puts: { body: { body: FlowBody } }[];
let zone: string | undefined;
let deployed: FlowBody;

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

beforeEach(() => {
  puts = [];
  zone = undefined;
  history.replaceState(null, "", "/");
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const path = address.split("?")[0] as string;
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
    if (path === api) return send(200, { timeZone: zone });
    if (path === "/api/v1/core-nodes") return send(200, { items: [sendEmail] });
    return send(200, { items: [] });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const manual = { type: "trigger", trigger: { type: "manual" } };

/** Opens the flow with a step chosen, and waits for its settings. */
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
const rename = (label: string, index: number, to: string) => {
  const field = screen.getAllByLabelText(label)[index] as HTMLInputElement;
  fireEvent.change(field, { target: { value: to } });
  fireEvent.submit(field.closest("form") as HTMLFormElement);
};

describe("the flow editor, as a person uses it", () => {
  test("renaming a schedule that came with the flow leaves its time zone alone (FLW-03)", async () => {
    zone = "America/New_York";
    await openAt(
      {
        nodes: { every: { type: "trigger", trigger: { type: "schedule", cron: "0 9 * * *" } } },
        edges: [],
      },
      "every",
      "Press Enter to rename. Expressions that read this step are changed to the new name.",
    );
    // The workspace's zone is known before the rename.
    await waitFor(() => expect(screen.getAllByText(/America\/New_York/).length).toBeGreaterThan(0));
    rename("Name", 0, "daily");
    const saved = await lastSaved();
    expect(Object.keys(saved.nodes)).toEqual(["daily"]);
    expect(
      (saved.nodes.daily as { trigger: { timezone?: string } }).trigger.timezone,
    ).toBeUndefined();
  });

  test("renaming a webhook start keeps its address by the old name as its key (FLW-04)", async () => {
    await openAt(
      { nodes: { hook: { type: "trigger", trigger: { type: "webhook" } } }, edges: [] },
      "hook",
      "Press Enter to rename. Expressions that read this step are changed to the new name.",
    );
    rename("Name", 0, "intake");
    const saved = await lastSaved();
    expect(saved.nodes.intake).toMatchObject({ type: "trigger", key: "hook" });
  });

  test("changing one field of a step keeps the grants written in code (FLW-05)", async () => {
    const grants = { connections: ["crm/main"], tables: ["orders"] };
    await openAt(
      {
        nodes: {
          start: manual,
          send: { type: "script", script: "core/send-email", inputs: {}, with: grants },
        },
        edges: [{ from: "start", to: "send" }],
      },
      "send",
      "Sends a message.",
    );
    fireEvent.change(await screen.findByLabelText("Subject"), { target: { value: "'Hello'" } });
    const saved = await lastSaved();
    expect(saved.nodes.send).toMatchObject({ inputs: { subject: "'Hello'" }, with: grants });
  });

  test("a name already used in Set values does not delete the other value (FLW-06)", async () => {
    await openAt(
      {
        nodes: { start: manual, fill: { type: "set", values: { one: "1", two: "2" } } },
        edges: [{ from: "start", to: "fill" }],
      },
      "fill",
      "Values",
    );
    const names = () => screen.getAllByLabelText("Name").slice(1) as HTMLInputElement[];
    fireEvent.change(names()[1] as HTMLInputElement, { target: { value: "one" } });
    // Whatever is saved on the way, the first value is not given the second's.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    for (const put of puts) expect(put.body.body.nodes.fill?.values).not.toEqual({ one: "2" });
    fireEvent.change(names()[1] as HTMLInputElement, { target: { value: "three" } });
    const saved = await lastSaved();
    expect(saved.nodes.fill?.values).toEqual({ one: "1", three: "2" });
  });

  test("a Branch added in the middle of a flow takes the connection on its first case (FLW-07)", async () => {
    await openAt(
      {
        nodes: {
          start: manual,
          first: { type: "set", values: { a: "1" } },
          second: { type: "join" },
        },
        edges: [
          { from: "start", to: "first" },
          { from: "first", to: "second" },
        ],
      },
      "first",
      "Values",
    );
    fireEvent.click(screen.getByRole("button", { name: /Add step/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^Branch/ }));
    const saved = await lastSaved();
    expect(saved.edges).toContainEqual({ from: "branch", to: "second", output: "yes" });
    expect(saved.edges).toContainEqual({ from: "first", to: "branch" });
    expect(saved.edges.some((edge) => edge.from === "branch" && edge.output === undefined)).toBe(
      false,
    );
  });

  test("renaming a Branch case past another's name keeps each connection with its case (FLW-08)", async () => {
    await openAt(
      {
        nodes: {
          start: manual,
          route: {
            type: "branch",
            cases: [
              { name: "a", when: "true" },
              { name: "ab", when: "false" },
            ],
          },
          x: { type: "join" },
          y: { type: "join" },
        },
        edges: [
          { from: "start", to: "route" },
          { from: "route", to: "x", output: "a" },
          { from: "route", to: "y", output: "ab" },
        ],
      },
      "route",
      "Cases, tried in order",
    );
    // The name is typed one key at a time: "ab" on the way to "abc" is another case's name.
    const first = screen.getAllByLabelText("Name")[1] as HTMLInputElement;
    fireEvent.change(first, { target: { value: "ab" } });
    fireEvent.change(first, { target: { value: "abc" } });
    const form = first.closest("form");
    if (form) fireEvent.submit(form);
    const saved = await lastSaved();
    expect(saved.edges).toContainEqual({ from: "route", to: "x", output: "abc" });
    expect(saved.edges).toContainEqual({ from: "route", to: "y", output: "ab" });
  });

  test("a removed Branch case takes its connection with it (FLW-08)", async () => {
    await openAt(
      {
        nodes: {
          start: manual,
          route: {
            type: "branch",
            cases: [
              { name: "a", when: "true" },
              { name: "maybe", when: "false" },
            ],
          },
          x: { type: "join" },
          y: { type: "join" },
        },
        edges: [
          { from: "start", to: "route" },
          { from: "route", to: "x", output: "a" },
          { from: "route", to: "y", output: "maybe" },
        ],
      },
      "route",
      "Cases, tried in order",
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Remove case" })[1] as HTMLElement);
    const saved = await lastSaved();
    expect(saved.edges.some((edge) => edge.output === "maybe")).toBe(false);
  });
});

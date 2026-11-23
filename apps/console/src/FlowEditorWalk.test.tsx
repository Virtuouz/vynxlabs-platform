// @vitest-environment happy-dom
import { cleanup, configure, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FlowEditor } from "./screens/FlowEditor.tsx";
import { show } from "./testing.tsx";

// What a person does in the flow editor, and what it then saves: the editor is drawn, a
// step is chosen as the address says, a field is changed, and the autosaved draft is read.

// The canvas measures a step's handles when told to; what it is told is read here.
const measured = vi.hoisted(() => [] as string[]);
vi.mock("@xyflow/react", async (original) => {
  const real = await original<typeof import("@xyflow/react")>();
  return {
    ...real,
    useUpdateNodeInternals: () => {
      const update = real.useUpdateNodeInternals();
      return (id: string | string[]) => {
        measured.push(String(id));
        update(id);
      };
    },
  };
});

configure({ asyncUtilTimeout: 15_000 });

const root = "/tenants/t1/workspaces/w1";
const api = `/api/v1${root}`;
const link = "/t/t1/workspaces/w1";
let puts: { body: { body: FlowBody } }[];
let zone: string | undefined;
let deployed: FlowBody;
let scripts: unknown[] = [];
/** Where the flow was arranged on its page. */
let arranged: Record<string, { x: number; y: number }> | undefined;
let clash = false;

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
  zone = undefined;
  scripts = [];
  arranged = undefined;
  clash = false;
  history.replaceState(null, "", "/");
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const path = address.split("?")[0] as string;
    const send = (status: number, reply: unknown) =>
      new Response(reply === null ? null : JSON.stringify(reply), { status });
    if (method === "PUT" && clash && path === `${api}/drafts/orders/sync`)
      return send(409, { status: 409, code: "draft_changed", detail: "Someone else saved this." });
    if (method === "PUT" && path === `${api}/drafts/orders/sync`) {
      puts.push({ body: JSON.parse(init.body as string) });
      return send(200, { revision: puts.length });
    }
    if (method !== "GET") return send(204, null);
    if (path === `${api}/drafts/orders/sync`) return send(404, { code: "not_found", detail: "" });
    if (path === `${api}/flows/orders/sync`) return send(200, { layout: arranged });
    if (path === `${api}/resources/orders/sync`)
      return send(200, { ownership: "ui", body: deployed });
    if (path === api) return send(200, { timeZone: zone });
    if (path === `${api}/scripts`) return send(200, { items: scripts });
    if (path === "/api/v1/core-nodes") return send(200, { items: [sendEmail, gate] });
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

  test("WLK-15: a renamed case has its handle measured again, so its edge stays drawn", async () => {
    await openAt(
      {
        nodes: {
          start: manual,
          route: { type: "branch", cases: [{ name: "a", when: "true" }] },
          x: { type: "join" },
        },
        edges: [
          { from: "start", to: "route" },
          { from: "route", to: "x", output: "a" },
        ],
      },
      "route",
      "Cases, tried in order",
    );
    measured.length = 0;
    rename("Name", 1, "b");
    await waitFor(() => expect(measured).toContain("route"));
  });

  test("WLK-15: the state is said once in the header, not as a pill and again as a word", async () => {
    await openAt({ nodes: { start: manual }, edges: [] }, "start", /Press Enter to rename/);
    await screen.findByText("Deployed");
    expect(screen.getAllByText("Deployed")).toHaveLength(1);
  });

  test("WLK-15: a deployed flow opens where it was last arranged on its page", async () => {
    arranged = { start: { x: 777, y: 40 } };
    await openAt({ nodes: { start: manual }, edges: [] }, "start", /Press Enter to rename/);
    await waitFor(() => {
      const card = document.querySelector('.react-flow__node[data-id="start"]') as HTMLElement;
      expect(card.style.transform).toContain("777px");
    });
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

  test("WLK-17c: a draft saved from another window is said, not 'Saving...', and what was written can be copied", async () => {
    clash = true;
    await openAt(
      {
        nodes: { start: manual, first: { type: "set", values: { a: "1" } } },
        edges: [{ from: "start", to: "first" }],
      },
      "first",
      "Values",
    );
    fireEvent.click(screen.getByRole("button", { name: /Add step/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^Branch/ }));
    expect(await screen.findByRole("button", { name: "Copy what I wrote" })).toBeTruthy();
    const status = screen
      .getAllByRole("status")
      .find((one) => /Saving|Not saved|Could not save/.test(one.textContent ?? ""));
    expect(status?.textContent).toBe("Not saved: someone else saved this flow");
  });

  test("WLK-15: in Add step, Enter in the search adds the first match", async () => {
    await openAt(
      {
        nodes: { start: manual, first: { type: "set", values: { a: "1" } } },
        edges: [{ from: "start", to: "first" }],
      },
      "first",
      "Values",
    );
    fireEvent.click(screen.getByRole("button", { name: /Add step/ }));
    const find = await screen.findByLabelText("Find a step");
    fireEvent.change(find, { target: { value: "branch" } });
    fireEvent.keyDown(find, { key: "Enter" });
    const saved = await lastSaved();
    expect(Object.values(saved.nodes).some((node) => node.type === "branch")).toBe(true);
    expect(screen.queryByLabelText("Find a step")).toBeNull();
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

  test("a For each added from the palette holds no empty script, so a flow chosen for it saves (FLW-10)", async () => {
    await openAt(
      { nodes: { start: manual }, edges: [] },
      "start",
      "Press Enter to rename. Expressions that read this step are changed to the new name.",
    );
    fireEvent.click(screen.getByRole("button", { name: /Add step/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^For each/ }));
    const saved = await lastSaved();
    expect(saved.nodes.each).toBeDefined();
    expect("script" in (saved.nodes.each as object)).toBe(false);
  });

  test("a For each that takes its flow from the data is finished, and says so (FLW-14)", async () => {
    await openAt(
      {
        nodes: {
          start: manual,
          each: {
            type: "foreach",
            items: "trigger.items",
            flowFrom: "trigger.flow",
            allow: ["a/child"],
          },
        },
        edges: [{ from: "start", to: "each" }],
      },
      "each",
      "Expression that gives the flow's path",
    );
    expect(screen.queryByText(/needs a script or a flow to run for each item/)).toBeNull();
    expect((screen.getByLabelText("Which flow") as HTMLSelectElement).value).toBe("chosen");
  });

  test("clearing the expression of a flow chosen by the data keeps it chosen by the data (FLW-21)", async () => {
    await openAt(
      {
        nodes: {
          start: manual,
          sub: { type: "subflow", flowFrom: "trigger.flow", allow: ["a/child"] },
        },
        edges: [{ from: "start", to: "sub" }],
      },
      "sub",
      "Expression that gives the flow's path",
    );
    fireEvent.change(screen.getByLabelText("Expression that gives the flow's path"), {
      target: { value: "" },
    });
    // The field stays, and the draft says it is unfinished, as it was before the last key.
    expect(screen.getByLabelText("Expression that gives the flow's path")).toBeTruthy();
    expect((screen.getByLabelText("Which flow") as HTMLSelectElement).value).toBe("chosen");
    const saved = await lastSaved();
    expect(saved.nodes.sub).toMatchObject({ flowFrom: "", allow: ["a/child"] });
  });

  test("a number chosen from a list is written as a number, and an expression shows as one (FLW-20)", async () => {
    await openAt(
      {
        nodes: {
          start: manual,
          pass: { type: "script", script: "core/gate", inputs: { flag: "trigger.flag" } },
        },
        edges: [{ from: "start", to: "pass" }],
      },
      "pass",
      "Lets a few through.",
    );
    // An expression in a yes/no field is shown as the expression it is, not as "Not set".
    expect((screen.getByLabelText(/^Flag/) as HTMLInputElement | HTMLTextAreaElement).value).toBe(
      "trigger.flag",
    );
    fireEvent.change(screen.getByLabelText(/^Level/), { target: { value: "2" } });
    const saved = await lastSaved();
    expect((saved.nodes.pass as { inputs: Record<string, string> }).inputs.level).toBe("2");
  });

  test("a needed field is not marked optional (FLW-29)", async () => {
    await openAt(
      {
        nodes: { start: manual, stop: { type: "fail", message: "'Stopped'" } },
        edges: [{ from: "start", to: "stop" }],
      },
      "stop",
      "An expression that gives text.",
    );
    expect((screen.getByLabelText(/^Message/) as HTMLTextAreaElement).required).toBe(true);
  });

  test("a question named for the form itself is flagged as it is typed (FLW-18)", async () => {
    await openAt(
      {
        nodes: {
          start: {
            type: "trigger",
            trigger: {
              type: "form",
              title: "Tell us",
              fields: [{ name: "website", label: "Site", type: "text" }],
            },
          },
        },
        edges: [],
      },
      "start",
      "What it asks",
    );
    expect((await screen.findAllByText(/kept for the form itself/)).length).toBeGreaterThan(0);
  });

  test("a choice list takes Enter and spaces as they are typed (FLW-19)", async () => {
    await openAt(
      {
        nodes: {
          start: {
            type: "trigger",
            trigger: {
              type: "form",
              title: "Tell us",
              fields: [
                { name: "rating", label: "Rating", type: "select", options: ["One", "Two"] },
              ],
            },
          },
        },
        edges: [],
      },
      "start",
      "What it asks",
    );
    const list = screen.getByLabelText("The list, one to a line") as HTMLTextAreaElement;
    fireEvent.change(list, { target: { value: "One\nTwo\n" } });
    // The new line is still there after the draft was changed.
    expect(list.value).toBe("One\nTwo\n");
    fireEvent.change(list, { target: { value: "One\nTwo\nVery good" } });
    expect(list.value).toBe("One\nTwo\nVery good");
    const saved = await lastSaved();
    const field = (saved.nodes.start as { trigger: { fields: { options: string[] }[] } }).trigger
      .fields[0];
    expect(field?.options).toEqual(["One", "Two", "Very good"]);
  });

  test("removing a step does not ask, says so, and Undo brings it back (D34)", async () => {
    await openAt(
      {
        nodes: { start: manual, fill: { type: "set", values: { a: "1" } } },
        edges: [{ from: "start", to: "fill" }],
      },
      "fill",
      "Values",
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove this step" }));
    // No question is put: the step is gone, and the message names it and offers Undo.
    expect(screen.queryByRole("dialog")).toBeNull();
    const undo = await screen.findByText(/Removed fill\./);
    expect(undo).toBeTruthy();
    expect(screen.queryByText("Values")).toBeNull();
    // The message's own Undo is the last of the buttons called that.
    fireEvent.click(screen.getAllByRole("button", { name: "Undo" }).at(-1) as HTMLElement);
    const saved = await lastSaved();
    expect(Object.keys(saved.nodes).sort()).toEqual(["fill", "start"]);
    expect(saved.edges).toContainEqual({ from: "start", to: "fill" });
  });

  test("a step's icon is drawn beside its label in the palette, and an unknown name is a puzzle piece (EXT-09, EXT-17)", async () => {
    const own = (path: string, icon: string, label: string) => ({
      path,
      description: "",
      timeoutSeconds: 60,
      inputSchema: { type: "object" },
      node: { label, icon },
    });
    scripts = [
      own("orders/ship", "truck", "Ship it"),
      own("orders/call", "globe", "Call out"),
      own("orders/odd", "no-such-icon", "Odd one"),
    ];
    await openAt({ nodes: { start: manual }, edges: [] }, "start", /Press Enter to rename/);
    fireEvent.click(screen.getByRole("button", { name: /Add step/ }));
    const iconOf = async (label: string) => {
      const row = (await screen.findByText(label)).closest("span") as HTMLElement;
      return row.querySelector("svg")?.getAttribute("class") ?? "";
    };
    expect(await iconOf("Ship it")).toContain("lucide-truck");
    expect(await iconOf("Call out")).toContain("lucide-globe");
    expect(await iconOf("Odd one")).toContain("lucide-puzzle");
  });
});

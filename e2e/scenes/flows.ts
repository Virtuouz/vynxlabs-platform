import type { Given, Scene } from "./scene.ts";

/** The scenes of the area "flows"'s pictures (packages/docs/shots/flows.mjs), by the name a shot's `setup` gives. */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A flow that decides by amount: a branch, a step for each way, and an approval after the large one. */
const decide = (description: string) => ({
  kind: "flow",
  schemaVersion: 1,
  body: {
    description,
    nodes: {
      start: {
        type: "trigger",
        trigger: {
          type: "manual",
          input: {
            type: "object",
            properties: { amount: { type: "number", title: "Amount" } },
            required: ["amount"],
          },
        },
      },
      size: { type: "branch", cases: [{ name: "large", when: "trigger.amount > 100" }] },
      large: { type: "set", values: { size: "'large'" } },
      small: { type: "set", values: { size: "'small'" } },
      approve: {
        type: "approval",
        title: "Approve a large amount",
        detail: "trigger.amount",
        approvers: { groups: ["practice-managers"] },
      },
    },
    edges: [
      { from: "start", to: "size" },
      { from: "size", to: "large", output: "large" },
      { from: "size", to: "small", output: "otherwise" },
      { from: "large", to: "approve" },
    ],
  },
  create: true,
});

const settled = async (given: Given, W: string, id: string) => {
  for (let tries = 0; tries < 60; tries += 1) {
    const run = await given.call("GET", `${W}/flow-runs/${id}`);
    if (!["queued", "running"].includes(run.state ?? run.status)) return run;
    await sleep(500);
  }
  throw new Error(`The flow run ${id} did not settle.`);
};

/** A tenant and a Sandbox of their own, with flows deployed, run and drafted. */
const lab: Scene = async (given) => {
  const tenant = await given.call("POST", "/tenants", {
    slug: `flows-${given.stamp}`,
    name: "Fernhill",
    addCreator: true,
  });
  const sandbox = await given.call("POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "sandbox",
    name: "Sandbox",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${sandbox.id}`;
  // A list's description is shown the first time a member sees it and folded after: the
  // administrator has seen it, so that each look of the picture is the same however many came before.
  await given.call("PUT", "/me/preferences/seen:flows", { value: true });
  await given.call("PATCH", W, { triggersPaused: false });
  await given.call("POST", `/tenants/${tenant.id}/groups`, { name: "Practice managers" });
  const put = (path: string, body: unknown) => given.call("PUT", `${W}/drafts/${path}`, body);
  await put("orders/reorder", {
    kind: "flow",
    schemaVersion: 1,
    body: {
      description: "Asks a practice manager before a low item is ordered.",
      nodes: {
        low: { type: "trigger", trigger: { type: "event", event: "orders/low" } },
        approve: {
          type: "approval",
          title: "Approve a stock order",
          detail: "{'item': trigger.item}",
          approvers: { groups: ["practice-managers"] },
        },
        done: { type: "set", values: { ordered: "true" } },
      },
      edges: [
        { from: "low", to: "approve" },
        { from: "approve", to: "done" },
      ],
    },
    create: true,
  });
  await put("orders/low", {
    kind: "event",
    schemaVersion: 1,
    body: { payload: { type: "object", properties: { item: { type: "string" } } } },
    create: true,
  });
  await put("billing/chase-unpaid", {
    kind: "flow",
    schemaVersion: 1,
    body: {
      description: "Marks invoices unpaid for two weeks to be chased.",
      nodes: {
        weekly: {
          type: "trigger",
          trigger: { type: "schedule", cron: "0 9 * * 1", timezone: "America/Los_Angeles" },
        },
        mark: { type: "set", values: { chased: "true" } },
      },
      edges: [{ from: "weekly", to: "mark" }],
    },
    create: true,
  });
  await put("appointments/after-visit", {
    kind: "flow",
    schemaVersion: 1,
    body: {
      description: "Writes the invoice for a finished visit.",
      nodes: {
        by_hand: { type: "trigger", trigger: { type: "manual" } },
        invoice: { type: "set", values: { written: "true" } },
      },
      edges: [{ from: "by_hand", to: "invoice" }],
    },
    create: true,
  });
  await given.call("POST", `${W}/changes/deploy`, {});
  await settled(
    given,
    W,
    (await given.call("POST", `${W}/flow-runs`, { flow: "appointments/after-visit", input: {} }))
      .id,
  );
  await given.call("POST", `${W}/events`, { name: "orders/low", payload: { item: "Ear drops" } });
  // A draft, not deployed: the flow the editor is shown on.
  await put("orders/decide", decide("Decides by amount, and asks a person about a large one."));
  await sleep(2000);
  return { at: `/t/${tenant.id}/workspaces/${sandbox.id}` };
};

export const scenes: Record<string, Scene> = { "flows-lab": lab };

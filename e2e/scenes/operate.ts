import type { Given, Scene } from "./scene.ts";

/** The scenes of the area "operate"'s pictures (packages/docs/shots/operate.mjs), by the name a shot's `setup` gives. */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const CHECK = `import type { ScriptContext } from "@volvel/sdk";

export default async function (_given: unknown, ctx: ScriptContext) {
  ctx.log.info("Checked the shelves", { shelves: 14 });
  return { checked: 14, low: 2 };
}
`;
const LOOKUP = `import type { ScriptContext } from "@volvel/sdk";

export default async function (given: { order: string }, ctx: ScriptContext) {
  ctx.log.info("Looking the order up", { order: given.order });
  ctx.log.warn("The supplier was slow to answer", { seconds: 4 });
  throw new Error("Supplier answered 404 for /orders/" + given.order + ": no such order");
}
`;
const NOTE = `import type { ScriptContext } from "@volvel/sdk";

export default async function (_given: unknown, ctx: ScriptContext) {
  ctx.log.info("Recorded");
  return { recorded: true };
}
`;

const script = (description: string, code: string, extra: Record<string, unknown> = {}) => ({
  kind: "script",
  schemaVersion: 1,
  body: {
    description,
    input: { type: "object" },
    output: { type: "object" },
    timeoutSeconds: 60,
    retries: { limit: 0, delaySeconds: 0, backoff: false },
    uses: { connections: [], secrets: [], variables: [] },
    source: { language: "typescript", code },
    ...extra,
  },
  create: true,
});

/** Waits until a run (script or flow) has left the queue and is no longer going. */
const settled = async (given: Given, base: string, id: string, kind = "runs") => {
  for (let tries = 0; tries < 60; tries += 1) {
    const run = await given.call("GET", `${base}/${kind}/${id}`);
    if (!["queued", "running", "waiting"].includes(run.state ?? run.status)) return run;
    await sleep(500);
  }
  throw new Error(`The run ${id} did not settle.`);
};

/** A workspace of its own for a scene, with its scripts, flows, event and group deployed. */
async function ops(given: Given, slug: string) {
  const { tenant } = given;
  const made = await given.call("POST", `/tenants/${tenant.id}/workspaces`, {
    slug,
    name: "Stockroom",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${made.id}`;
  // A new workspace holds its triggers paused: this one starts what it is asked to.
  await given.call("PATCH", W, { triggersPaused: false });
  // The group the flow names: made once in a tenant, found by the scenes after the first.
  await given
    .call("POST", `/tenants/${tenant.id}/groups`, { name: "Practice managers" })
    .catch(() => undefined);
  const put = (path: string, body: unknown) => given.call("PUT", `${W}/drafts/${path}`, body);
  await put("orders/check", script("Counts what is on the shelves.", CHECK));
  await put("orders/lookup", script("Looks one order up at the supplier.", LOOKUP));
  await put("alerts/run-failed", script("Records a run that failed for the last time.", NOTE));
  await put("orders/low", {
    kind: "event",
    schemaVersion: 1,
    body: {
      payload: {
        type: "object",
        properties: { item: { type: "string" }, clinic: { type: "string" } },
        required: ["item", "clinic"],
      },
    },
    create: true,
  });
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
          detail: "{'item': trigger.item, 'clinic': trigger.clinic}",
          approvers: { groups: ["practice-managers"] },
          timeoutSeconds: 259200,
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
  await put("orders/morning-check", {
    kind: "schedule",
    schemaVersion: 1,
    body: {
      cron: "0 7 * * 1-5",
      timezone: "America/Los_Angeles",
      script: "orders/check",
      input: {},
    },
    create: true,
  });
  const deployed = await given.call("POST", `${W}/changes/deploy`, {});
  // The deploy made the group the flow names. The administrator is one of its members, so that
  // the Approvals screen has something for them to decide.
  const group = (await given.call("GET", `/tenants/${tenant.id}/groups?limit=200`)).items.find(
    (one: { key: string }) => one.key === "practice-managers",
  );
  const me = await given.call("GET", "/me");
  await given.call(
    "PUT",
    `/tenants/${tenant.id}/groups/${group.id}/members/${me.principal.id}`,
    {},
  );
  return { W, id: made.id as string, deployed, tenant: tenant.id };
}

/** Runs, events, triggers and approvals in a workspace of their own. */
const stockroom: Scene = async (given) => {
  const { W, id, tenant } = await ops(given, "stockroom");
  for (let count = 0; count < 3; count += 1)
    await settled(
      given,
      W,
      (await given.call("POST", `${W}/runs`, { script: "orders/check", input: {} })).id,
    );
  const lookup = await given.call("POST", `${W}/runs`, {
    script: "orders/lookup",
    input: { order: "A-1043" },
  });
  await settled(given, W, lookup.id);
  for (const item of ["Rabies vaccine", "Ear drops"])
    await given.call("POST", `${W}/events`, {
      name: "orders/low",
      payload: { item, clinic: "Northside" },
    });
  await sleep(3000);
  return { at: `/t/${tenant}/workspaces/${id}` };
};

/** The page of one failed run. */
const failedRun: Scene = async (given) => {
  const { W, id, tenant } = await ops(given, "stockroom-failed");
  const run = await given.call("POST", `${W}/runs`, {
    script: "orders/lookup",
    input: { order: "A-1043" },
  });
  await settled(given, W, run.id);
  return { at: `/t/${tenant}/workspaces/${id}` };
};

/** The default alert: a script to start and a connection to post to. */
const alerts: Scene = async (given) => {
  const { W, id, tenant } = await ops(given, "stockroom-alerts");
  await given.call("PUT", `${W}/drafts/sms`, {
    kind: "connection",
    schemaVersion: 1,
    body: { connector: "http", description: "TextLine, the SMS gateway." },
    create: true,
  });
  await given.call("POST", `${W}/changes/deploy`, {});
  await given.call("PUT", `${W}/connection-bindings/sms`, {
    config: { baseUrl: "https://textline.example/api" },
  });
  await given.call("PATCH", W, {
    failureAlert: { script: "alerts/run-failed", notify: "sms" },
  });
  return { at: `/t/${tenant}/workspaces/${id}` };
};

export const scenes: Record<string, Scene> = {
  "operate-stockroom": stockroom,
  "operate-failed-run": failedRun,
  "operate-alerts": alerts,
};

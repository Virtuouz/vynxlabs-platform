import { createServer, type Server } from "node:http";
import type { Given, Scene } from "./scene.ts";

/** The scenes of the area "configure"'s pictures (packages/docs/shots/configure.mjs), by the name a shot's `setup` gives. */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** The port of the stand-in the connections point to: the same in each run, so the address is. */
const PORT = 48231;
const STAND_IN = `http://127.0.0.1:${PORT}`;

/** A stand-in for the outside systems: the SMS gateway answers, the supplier refuses the token. */
let standIn: Server | undefined;
const startStandIn = async () => {
  if (standIn) return;
  const made = createServer((request, response) => {
    request.resume();
    // The supplier refuses the account's token: a test of it fails (a 404 would still count as reached).
    const refused = request.url?.startsWith("/vetsupply");
    response.writeHead(refused ? 401 : 200, { "content-type": "application/json" });
    response.end(JSON.stringify(refused ? { error: "unauthorized" } : { ok: true }));
  });
  await new Promise<void>((resolve, reject) => {
    made.once("error", reject);
    made.listen(PORT, "127.0.0.1", resolve);
  });
  made.unref();
  standIn = made;
};

const script = (description: string, uses: Record<string, string[]>, code: string) => ({
  kind: "script",
  schemaVersion: 1,
  create: true,
  body: {
    description,
    input: { type: "object" },
    output: { type: "object" },
    timeoutSeconds: 60,
    retries: { limit: 0, delaySeconds: 0, backoff: false },
    uses: { connections: [], secrets: [], variables: [], ...uses },
    source: { language: "typescript", code },
  },
});
const OK = `import type { ScriptContext } from "@volvel/sdk";

export default async function (_given: unknown, ctx: ScriptContext) {
  ctx.log.info("Done");
  return { done: true };
}
`;
const FAILS = `import type { ScriptContext } from "@volvel/sdk";

export default async function (_given: unknown, ctx: ScriptContext) {
  ctx.log.info("Placing the order");
  throw new Error("VetSupply answered 404: no such stock line");
}
`;

/** A dev workspace of its own: Fernhill's outside systems, variables and secrets, set up as a clinic would. */
async function clinics(given: Given, slug: string) {
  await startStandIn();
  const { tenant } = given;
  const made = await given.call("POST", `/tenants/${tenant.id}/workspaces`, {
    slug,
    name: "Sandbox",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${made.id}`;
  const put = (path: string, body: unknown) => given.call("PUT", `${W}/drafts/${path}`, body);
  const variable = (description: string, value: string) => ({
    kind: "variable",
    schemaVersion: 1,
    create: true,
    body: { description, default: value },
  });
  const connection = (description: string) => ({
    kind: "connection",
    schemaVersion: 1,
    create: true,
    body: { connector: "http", description },
  });
  await put("billing/exam-fee", variable("The exam fee on every invoice, in cents.", "6500"));
  await put(
    "inventory/approval-threshold",
    variable("An order costing more than this, in cents, waits for a practice manager.", "30000"),
  );
  await put(
    "reminders/lead-hours",
    variable("How long before a visit its reminder is sent, in hours.", "24"),
  );
  await put("sms", connection("TextLine, the SMS gateway."));
  await put("supplier", connection("VetSupply, where stock is ordered."));
  await put("clinics", {
    kind: "connection_group",
    schemaVersion: 1,
    create: true,
    body: { connector: "http", description: "One connection for each clinic's own system." },
  });
  await put(
    "billing/create-invoice",
    script("Writes an invoice for a finished visit.", { variables: ["billing/exam-fee"] }, OK),
  );
  await put(
    "reminders/send",
    script(
      "Texts the owners whose visit is soon.",
      { connections: ["sms"], variables: ["reminders/lead-hours"] },
      OK,
    ),
  );
  await put(
    "inventory/place-order",
    script(
      "Orders a stock line from the supplier.",
      {
        connections: ["supplier"],
        secrets: ["SUPPLIER_ACCOUNT"],
        variables: ["inventory/approval-threshold"],
      },
      FAILS,
    ),
  );
  await put(
    "payments/record",
    script("Records a payment PayFern reported.", { secrets: ["PAYFERN_SIGNING_SECRET"] }, OK),
  );
  await put(
    "alerts/run-failed",
    script("Records a run that failed for the last time.", { connections: ["sms"] }, OK),
  );
  await given.call("POST", `${W}/changes/deploy`, {});
  return { W, id: made.id as string, tenant: tenant.id };
}

/** Sets up what is to be set up: the connections tested, the secrets and the variables set. */
async function configured(given: Given, slug: string) {
  const { W, id, tenant } = await clinics(given, slug);
  await given.call("PUT", `${W}/connection-bindings/sms`, {
    config: { baseUrl: `${STAND_IN}/textline`, auth: { type: "bearer" } },
    credential: "tl_demo_7f3a9c",
  });
  await given.call("PUT", `${W}/connection-bindings/supplier`, {
    config: { baseUrl: `${STAND_IN}/vetsupply`, auth: { type: "bearer" } },
    credential: "vs_demo_51be22",
  });
  await given.call("PUT", `${W}/connection-group-members/northside/clinics`, {
    config: { baseUrl: `${STAND_IN}/northside`, auth: { type: "bearer" } },
    credential: "ns_demo_2c81d0",
  });
  await given.call("PUT", `${W}/secrets/PAYFERN_SIGNING_SECRET`, { value: "whsec_fernhill_demo" });
  await given.call("PUT", `${W}/secrets/SUPPLIER_ACCOUNT`, { value: "acct_fernhill_0042" });
  // One variable with a value, one with an empty value, one on its default.
  await given.call("PUT", `${W}/variable-values/billing/exam-fee`, { value: "7000" });
  await given.call("PUT", `${W}/variable-values/reminders/lead-hours`, { value: "" });
  return { W, id, tenant };
}

/** Both connections tested: one is reached, one is refused. */
const connections: Scene = async (given) => {
  const { W, id, tenant } = await configured(given, "configure-connections");
  for (const path of ["sms", "supplier"]) {
    const test = await given.call("POST", `${W}/connection-tests`, { path });
    for (let tries = 0; tries < 40; tries += 1) {
      const found = (await given.call("GET", `${W}/connection-bindings`)).items.find(
        (one: { path: string }) => one.path === path,
      );
      if (found?.test) break;
      await sleep(500);
    }
    void test;
  }
  return { at: `/t/${tenant}/workspaces/${id}` };
};

/** Variables and secrets: as `configured` leaves them. */
const values: Scene = async (given) => {
  const { id, tenant } = await configured(given, "configure-values");
  return { at: `/t/${tenant}/workspaces/${id}` };
};

/** The default alert posts to a connection, and one run failed for the last time and was alerted. */
const alerts: Scene = async (given) => {
  const { W, id, tenant } = await configured(given, "configure-alerts");
  await given.call("PATCH", W, {
    failureAlert: { script: "alerts/run-failed", notify: "sms" },
  });
  const run = await given.call("POST", `${W}/runs`, { script: "inventory/place-order", input: {} });
  for (let tries = 0; tries < 60; tries += 1) {
    const alerted = (await given.call("GET", `${W}/alerts`)).items ?? [];
    if (alerted.length) break;
    await sleep(500);
  }
  void run;
  return { at: `/t/${tenant}/workspaces/${id}` };
};

/** The connection stock-prices, drafted and set up as the how-to leaves it, the sheet to be saved again. */
const sheet: Scene = async (given) => {
  const { W, id, tenant } = await clinics(given, "configure-sheet");
  await given.call("PUT", `${W}/drafts/stock-prices`, {
    kind: "connection",
    schemaVersion: 1,
    body: { connector: "http", description: "Share prices." },
    create: true,
  });
  await given.call("PUT", `${W}/connection-bindings/stock-prices`, {
    config: { baseUrl: `${STAND_IN}/prices`, auth: { type: "bearer" } },
    credential: "sp_demo_5d19e0",
  });
  return { at: `/t/${tenant}/workspaces/${id}` };
};

export const scenes: Record<string, Scene> = {
  "configure-connections": connections,
  "configure-values": values,
  "configure-alerts": alerts,
  "configure-sheet": sheet,
};

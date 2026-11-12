import {
  defineConnection,
  defineSchedule,
  defineScript,
  defineVariable,
  defineWebhook,
  z,
} from "@vynxlabs/sdk";

// Where each connection points, and its credential, is set per workspace.
export const shop = defineConnection({ path: "shop", description: "The web shop's order API." });
export const erp = defineConnection({ path: "erp", description: "The ERP's import API." });
export const alerts = defineConnection({
  path: "alerts",
  description: "Chat webhook for failures.",
});

export const batchSize = defineVariable({
  path: "orders/batch-size",
  description: "How many orders one sync sends to the ERP.",
  default: "50",
});

const Order = z.object({ id: z.string(), total: z.number(), currency: z.string() });

/** Copies new orders from the shop into the ERP. */
export const syncOrders = defineScript({
  path: "orders/sync",
  description: "Copies new orders from the shop into the ERP.",
  input: z.object({ since: z.iso.datetime().optional() }),
  output: z.object({ sent: z.number(), skipped: z.number() }),
  connections: [shop, erp],
  variables: [batchSize],
  timeoutSeconds: 120,
  retries: { limit: 3, delaySeconds: 30 },
  // Two syncs at once would send the same orders twice.
  concurrency: 1,
  onFailure: { script: "alerts/run-failed", notify: alerts },
  async run(input, ctx) {
    const limit = Number(await ctx.variable("orders/batch-size"));
    const shopApi = await ctx.connection("shop");
    const erpApi = await ctx.connection("erp");

    const found = await shopApi.get("/orders", { query: { since: input.since, limit } });
    const orders = z.array(Order).parse(found.json());
    ctx.log.info("Fetched orders from the shop", { count: orders.length, limit });

    let sent = 0;
    let skipped = 0;
    for (const order of orders) {
      if (ctx.signal.aborted) break;
      // The ERP ignores an order it has already seen with this key, so a retry is safe.
      const response = await erpApi.post("/import/orders", order, {
        headers: { "idempotency-key": `order-${order.id}` },
        allowFailure: true,
      });
      if (response.status === 409) skipped += 1;
      else if (response.ok) sent += 1;
      else throw new Error(`The ERP refused order ${order.id} with status ${response.status}.`);
    }
    ctx.log.info("Sync finished", { sent, skipped });
    return { sent, skipped };
  },
});

export const syncEveryFiveMinutes = defineSchedule({
  path: "orders/sync-every-five-minutes",
  script: syncOrders,
  cron: "*/5 * * * *",
  timezone: "Europe/Madrid",
});

/** Receives an order the moment the shop takes it. */
export const receiveOrder = defineScript({
  path: "orders/receive",
  description: "Sends one order to the ERP as soon as the shop reports it.",
  input: z.object({ secret: z.string(), order: Order }),
  output: z.object({ imported: z.boolean() }),
  connections: [erp],
  secrets: ["SHOP_WEBHOOK_SECRET"],
  timeoutSeconds: 30,
  retries: { limit: 2, delaySeconds: 5 },
  async run(input, ctx) {
    if (input.secret !== (await ctx.secret("SHOP_WEBHOOK_SECRET"))) {
      throw new Error("The request did not carry the shared secret.");
    }
    const erpApi = await ctx.connection("erp");
    const response = await erpApi.post("/import/orders", input.order, {
      headers: { "idempotency-key": `order-${input.order.id}` },
      allowFailure: true,
    });
    if (!response.ok && response.status !== 409) {
      throw new Error(`The ERP refused order ${input.order.id} with status ${response.status}.`);
    }
    ctx.log.info("Order imported", { id: input.order.id });
    return { imported: response.ok };
  },
});

export const orderPlaced = defineWebhook({ path: "orders/placed", script: receiveOrder });

/** Started when a run fails for the last time. */
export const runFailed = defineScript({
  path: "alerts/run-failed",
  description: "Records a failed run. A place to open a ticket or page someone.",
  input: z.object({
    run: z.object({ id: z.string(), script: z.string(), attempt: z.number(), error: z.string() }),
  }),
  output: z.object({ recorded: z.boolean() }),
  async run(input, ctx) {
    ctx.log.error("A run failed for the last time", input.run);
    return { recorded: true };
  },
});

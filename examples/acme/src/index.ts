import { defineApp, defineScript, z } from "@volvel/sdk";

const Order = z.object({
  id: z.string(),
  total: z.number(),
  currency: z.string(),
  /** The member who looks after this order, when there is one. */
  owner: z.uuid().optional(),
});

/** Copies new orders from the shop into the ERP. */
export const syncOrders = defineScript({
  path: "orders/sync",
  description: "Copies new orders from the shop into the ERP.",
  input: z.object({ since: z.iso.datetime().optional() }),
  output: z.object({ sent: z.number(), skipped: z.number() }),
  connections: ["shop", "erp"],
  variables: ["orders/batch-size"],
  events: ["orders/synced"],
  timeoutSeconds: 120,
  retries: { limit: 3, delaySeconds: 30 },
  // Two syncs at once would send the same orders twice.
  concurrency: 1,
  onFailure: { script: "alerts/run-failed", notify: "alerts" },
  async run(input, ctx) {
    const limit = Number(await ctx.variable("orders/batch-size"));
    const shopApi = await ctx.connection("shop");
    const erpApi = await ctx.connection("erp");

    const found = await shopApi.get("/orders", { query: { since: input.since, limit } });
    const fetched = z.array(Order).parse(found.json());
    ctx.log.info("Fetched orders from the shop", { count: fetched.length, limit });

    let sent = 0;
    let skipped = 0;
    for (const order of fetched) {
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
    await ctx.events.publish("orders/synced", { sent, skipped });
    return { sent, skipped };
  },
});

/** Receives an order the moment the shop takes it. */
export const receiveOrder = defineScript({
  path: "orders/receive",
  description: "Sends one order to the ERP as soon as the shop reports it.",
  input: z.object({ secret: z.string(), order: Order }),
  output: z.object({ imported: z.boolean() }),
  connections: ["erp"],
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

/** Decides whether an order can be sent on as it is. */
export const checkOrder = defineScript({
  path: "orders/check",
  description: "Checks an order before it goes to the ERP.",
  input: z.object({ order: Order }),
  output: z.object({ valid: z.boolean(), reason: z.string() }),
  async run(input) {
    if (input.order.total <= 0) return { valid: false, reason: "The order has no value." };
    if (input.order.currency !== "USD")
      return { valid: false, reason: "Only USD orders are handled." };
    return { valid: true, reason: "" };
  },
});

export const sendToErp = defineScript({
  path: "orders/send-to-erp",
  description: "Sends one checked order to the ERP.",
  input: z.object({ order: Order }),
  output: z.object({ imported: z.boolean() }),
  connections: ["erp"],
  retries: { limit: 2, delaySeconds: 5 },
  async run(input, ctx) {
    const erpApi = await ctx.connection("erp");
    const response = await erpApi.post("/import/orders", input.order, {
      headers: { "idempotency-key": `order-${input.order.id}` },
      allowFailure: true,
    });
    if (!response.ok && response.status !== 409) {
      throw new Error(`The ERP refused order ${input.order.id} with status ${response.status}.`);
    }
    return { imported: response.ok };
  },
});

/** Keeps one row per order, so a retry or a second delivery changes the row instead of adding one. */
export const recordOrder = defineScript({
  path: "orders/record",
  description: "Writes an order and how it ended to the orders table.",
  input: z.object({ order: Order, status: z.string() }),
  output: z.object({ id: z.string() }),
  tables: ["orders"],
  async run(input, ctx) {
    const table = ctx.table("orders");
    const { order } = input;
    const [known] = await table.find({ filter: { column: "number", value: order.id }, limit: 1 });
    if (known) {
      await table.update(known.id, { status: input.status });
      return { id: known.id };
    }
    const row = await table.insert({
      number: order.id,
      total: order.total,
      currency: order.currency,
      status: input.status,
      owner_id: order.owner ?? null,
    });
    return { id: row.id };
  },
});

// ----- A form anyone can send, handled with no code of the repository's -----

// ----- The portal: one app for staff and for customers -----

/**
 * A customer asks for an order from the portal. The script runs as the
 * workspace, and writes the row as the person who started it, so the row is
 * theirs and the table's policy holds.
 */
export const requestOrder = defineScript({
  path: "orders/request",
  description: "Records an order someone asks for from the portal, as theirs.",
  input: z.object({
    number: z.string().min(1).max(40),
    total: z.number().positive(),
    currency: z.string().length(3),
  }),
  output: z.object({ id: z.string() }),
  tables: ["orders"],
  async run(input, ctx) {
    const who = ctx.run.startedBy;
    if (who.id === null) throw new Error("An order is requested by a person.");
    const row = await ctx
      .table("orders")
      .as(who.id)
      .insert({ ...input, status: "requested" });
    ctx.log.info("Order requested", { number: input.number });
    return { id: row.id };
  },
});

/**
 * Staff see every order and write notices. A customer signs in and sees their
 * own orders. It is the same app: what each person sees is decided by their
 * role and by the orders table's policy, not by the app.
 */
export const portal = defineApp({
  path: "portal",
  title: "Acme orders",
  description: "Your orders with Acme.",
  source: "apps/portal",
});

/** A page for anyone, signed in or not. */
export const publicPage = defineApp({
  path: "public",
  title: "Acme notices",
  source: "apps/public",
});

// Who may open what. Staff need nothing here: their roles already let them read.

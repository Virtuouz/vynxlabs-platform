import {
  column,
  defineApp,
  defineBinding,
  defineConnection,
  defineEvent,
  defineFlow,
  defineInterface,
  defineRole,
  defineSchedule,
  defineScript,
  defineTable,
  defineTheme,
  defineVariable,
  defineWebhook,
  step,
  trigger,
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

const Order = z.object({
  id: z.string(),
  total: z.number(),
  currency: z.string(),
  /** The member who looks after this order, when there is one. */
  owner: z.uuid().optional(),
});

/**
 * Every order the flow has handled. Each member sees the orders they look
 * after. Changing this definition and deploying changes the table: a column
 * that is removed here is retired, and its data kept.
 */
export const orders = defineTable({
  path: "orders",
  description: "Every order the flow has handled, and how it ended.",
  columns: {
    number: column.text({ required: true, unique: true }),
    total: column.number({ required: true }),
    currency: column.text({ required: true }),
    status: column.text({ required: true, default: "received" }),
    owner_id: column.uuid(),
  },
  policy: { owner: "owner_id" },
});

/** Published after each sync, for anything that wants to know. */
export const ordersSynced = defineEvent({
  path: "orders/synced",
  description: "A sync from the shop to the ERP finished.",
  payload: z.object({ sent: z.number(), skipped: z.number() }),
});

/** Published by anything that learns of a new order. The order flow listens for it. */
export const orderReceived = defineEvent({
  path: "orders/received",
  description: "An order has arrived and needs handling.",
  payload: Order,
});

/** Copies new orders from the shop into the ERP. */
export const syncOrders = defineScript({
  path: "orders/sync",
  description: "Copies new orders from the shop into the ERP.",
  input: z.object({ since: z.iso.datetime().optional() }),
  output: z.object({ sent: z.number(), skipped: z.number() }),
  connections: [shop, erp],
  variables: [batchSize],
  events: [ordersSynced],
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
    await ctx.events.publish("orders/synced", { sent, skipped });
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

/** Decides whether an order can be sent on as it is. */
export const checkOrder = defineScript({
  path: "orders/check",
  description: "Checks an order before it goes to the ERP.",
  input: z.object({ order: Order }),
  output: z.object({ valid: z.boolean(), reason: z.string() }),
  async run(input) {
    if (input.order.total <= 0) return { valid: false, reason: "The order has no value." };
    if (input.order.currency !== "EUR")
      return { valid: false, reason: "Only EUR orders are handled." };
    return { valid: true, reason: "" };
  },
});

export const sendToErp = defineScript({
  path: "orders/send-to-erp",
  description: "Sends one checked order to the ERP.",
  input: z.object({ order: Order }),
  output: z.object({ imported: z.boolean() }),
  connections: [erp],
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
  tables: [orders],
  async run(input, ctx) {
    const table = ctx.table(orders);
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

/**
 * Handles one order: check it, ask a person about large ones, send it to the
 * ERP, write it to the orders table, and record what went wrong if the ERP refuses it.
 */
export const handleOrder = defineFlow({
  path: "orders/handle",
  description: "Checks an order, asks for approval when it is large, and sends it to the ERP.",
  nodes: {
    // Two ways in. Both carry an order.
    from_event: trigger.event(orderReceived),
    by_hand: trigger.manual(),
    check: step.script(checkOrder, { input: "{'order': trigger}" }),
    route: step.branch({
      invalid: "!steps.check.output.valid",
      large: "trigger.total > 1000.0",
    }),
    refuse: step.fail("'Order ' + trigger.id + ' was refused: ' + steps.check.output.reason"),
    approve: step.approval("Approve a large order", {
      detail: "{'order': trigger.id, 'total': trigger.total, 'currency': trigger.currency}",
    }),
    send: step.script(sendToErp, { input: "{'order': trigger}" }),
    record: step.script(recordOrder, { input: "{'order': trigger, 'status': 'sent'}" }),
    report: step.set({ order: "trigger.id", problem: "steps.send.error.message" }),
  },
  edges: [
    ["from_event", "check"],
    ["by_hand", "check"],
    ["check", "route"],
    ["route", "refuse", { when: "invalid" }],
    ["route", "approve", { when: "large" }],
    ["route", "send", { when: "otherwise" }],
    ["approve", "send"],
    ["send", "record"],
    ["send", "report", { error: true }],
  ],
});

// ----- The portal: one app for staff and for customers -----

/** Things customers should know, written by staff. Anyone may read them. */
export const notices = defineTable({
  path: "notices",
  description: "Short messages for customers, shown on the public page.",
  columns: {
    title: column.text({ required: true }),
    body: column.text(),
  },
});

/**
 * Invoices, which two kinds of people see differently. Someone in the
 * `finance` group of end users sees every invoice marked for that group. A
 * customer sees the invoices of their own company: the rows whose
 * `customer_id` equals the `customer_id` attribute on their account. Groups
 * and attributes are set under End users in the console, or by the identity
 * provider people sign in through.
 */
export const invoices = defineTable({
  path: "invoices",
  description: "Invoices, seen by the finance group and by each customer for their own company.",
  columns: {
    number: column.text({ required: true, unique: true }),
    total: column.number({ required: true }),
    customer_id: column.text({ required: true }),
    visible_to: column.text({ default: "finance" }),
  },
  policy: {
    rules: [
      { allow: "all", when: { column: "visible_to", in: "groups" } },
      { allow: "read", when: { column: "customer_id", equals: { attribute: "customer_id" } } },
    ],
  },
});

/**
 * An app with no code of its own: a screen over the invoices, as it would be
 * made in the console under "Apps made here". It is written here to show the
 * shape. A list of invoices, the one that is chosen beside it, and what is
 * owed by customer. Each person who opens it is given the rows the table's
 * rules give them, so finance and a customer see different invoices in the
 * same app.
 */
export const invoiceScreen = defineInterface({
  path: "screens/invoices",
  title: "Invoices",
  pages: [
    {
      id: "invoices",
      title: "Invoices",
      widgets: [
        {
          id: "list",
          type: "table",
          title: "Invoices",
          table: "invoices",
          fields: [
            { column: "number" },
            { column: "customer_id", label: "Customer" },
            { column: "total" },
          ],
          sort: [{ column: "number" }],
          at: { x: 0, y: 0, w: 8, h: 9 },
        },
        {
          id: "chosen",
          type: "card",
          title: "The invoice chosen",
          table: "invoices",
          link: { from: "list", type: "same" },
          at: { x: 8, y: 0, w: 4, h: 9 },
        },
        {
          id: "owed",
          type: "chart",
          title: "Owed by customer",
          table: "invoices",
          summary: {
            groupBy: [{ column: "customer_id" }],
            aggregates: [{ fn: "sum", column: "total", as: "owed" }],
          },
          options: { mark: "bar", x: "customer_id", y: "owed" },
          at: { x: 0, y: 9, w: 12, h: 8 },
        },
      ],
    },
  ],
});

export const invoiceApp = defineApp({
  path: "invoice-desk",
  title: "Invoices",
  description: "Invoices, as each person may see them.",
  interface: "screens/invoices",
});

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
  tables: [orders],
  async run(input, ctx) {
    const who = ctx.run.startedBy;
    if (who.id === null) throw new Error("An order is requested by a person.");
    const row = await ctx
      .table(orders)
      .as(who.id)
      .insert({ ...input, status: "requested" });
    ctx.log.info("Order requested", { number: input.number });
    return { id: row.id };
  },
});

/** Acme's colours, where they differ from the tenant's branding. */
export const theme = defineTheme({
  tokens: { action: "#0b6e4f", "action-soft": "#dff3ea", "radius-panel": "14px" },
  dark: { action: "#5fd3a6", "action-ink": "#04261a", "action-soft": "#143a2c" },
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

/** Customers open the portal and read and write their own orders. */
export const customersOpenPortal = defineBinding({
  path: "access/customers-portal",
  role: "portal_user",
  principal: { type: "end_users" },
  resource: portal,
});
export const customersReadOrders = defineBinding({
  path: "access/customers-orders",
  role: "portal_user",
  principal: { type: "end_users" },
  resource: orders,
});

export const orderRequester = defineRole({
  path: "roles/order-requester",
  name: "order_requester",
  description: "May start a script it is bound at.",
  permissions: ["run:write"],
});
export const customersRequestOrders = defineBinding({
  path: "access/customers-request",
  role: orderRequester,
  principal: { type: "end_users" },
  resource: requestOrder,
});

export const publicReader = defineRole({
  path: "roles/public-reader",
  name: "public_reader",
  description: "Opens an app and reads rows, where it is bound.",
  permissions: ["app:read", "data:read"],
});
/** Binding to `anonymous` is what makes the page and the notices public. */
export const anyoneOpensPublicPage = defineBinding({
  path: "access/public-page",
  role: publicReader,
  principal: { type: "anonymous" },
  resource: publicPage,
});
export const anyoneReadsNotices = defineBinding({
  path: "access/public-notices",
  role: publicReader,
  principal: { type: "anonymous" },
  resource: notices,
});

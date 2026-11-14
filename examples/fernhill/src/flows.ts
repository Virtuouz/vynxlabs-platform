import { defineFlow, defineSchedule, defineWebhook, step, trigger, z } from "@vynxlabs/sdk";
import { CLINICS } from "./constants.ts";
import { invoices, registrationReceived, registrations, stockLow, visitDone } from "./model.ts";
import {
  chaseOne,
  checkStock,
  createInvoice,
  placeOrder,
  quoteOrder,
  recordPayment,
  recordRefusedOrder,
  sendReminders,
  sendSms,
} from "./scripts.ts";

/**
 * After a visit: write the invoice, then text the owner. A text that cannot be
 * sent does not undo the invoice: the error path notes it and the flow ends.
 */
export const afterVisit = defineFlow({
  path: "appointments/after-visit",
  description: "Invoices a finished visit and texts the owner a thank-you with the amount.",
  nodes: {
    finished: trigger.event(visitDone),
    by_hand: trigger.manual(),
    invoice: step.script(createInvoice, { input: "{'appointment': trigger.appointment}" }),
    thank: step.script(sendSms, {
      inputs: {
        to: "steps.invoice.output.phone",
        text:
          "'Fernhill Vets: thank you for bringing ' + steps.invoice.output.pet + ' in today. Your invoice ' + " +
          "steps.invoice.output.number + ' is ' + steps.invoice.output.amount + '. Pay online in the pet portal.'",
      },
    }),
    unsent: step.set({
      invoice: "steps.invoice.output.number",
      problem: "'The thank-you text was not sent: ' + steps.thank.error.message",
    }),
  },
  edges: [
    ["finished", "invoice"],
    ["by_hand", "invoice"],
    ["invoice", "thank"],
    ["thank", "unsent", { error: true }],
  ],
});

/**
 * Low stock: ask the supplier for a price, have a practice manager approve a
 * large order, place it. A refusal is recorded so the line can be checked again.
 */
export const reorder = defineFlow({
  path: "inventory/reorder",
  description:
    "Prices and places an order for low stock. Orders over the threshold wait for a practice manager.",
  nodes: {
    low: trigger.event(stockLow),
    // Started by hand, or by an agent, with the same fields the event carries.
    by_hand: trigger.manual({
      input: z.object({
        line: z.uuid().describe("The stock line's row ID, from agent/low-stock."),
        clinic: z.enum(CLINICS),
        sku: z.string().describe("The supplier's product code, such as VAC-DHPP."),
        item: z.string(),
        on_hand: z.number().int(),
        quantity: z.number().int().positive().describe("How many to order."),
      }),
    }),
    quote: step.script(quoteOrder, {
      input: "{'sku': trigger.sku, 'quantity': trigger.quantity}",
    }),
    route: step.branch({ large: "steps.quote.output.needs_approval" }),
    approve: step.approval("Approve a stock order", {
      detail:
        "{'clinic': trigger.clinic, 'item': trigger.item, 'quantity': trigger.quantity, " +
        "'total': steps.quote.output.amount, 'on_hand': trigger.on_hand}",
      timeoutSeconds: 3 * 24 * 3600,
      approvers: { groups: ["Practice managers"] },
    }),
    place: step.script(placeOrder, {
      input:
        "{'line': trigger.line, 'quantity': trigger.quantity, 'total': steps.quote.output.total}",
    }),
    refused: step.script(recordRefusedOrder, {
      input:
        "{'line': trigger.line, 'quantity': trigger.quantity, 'total': steps.quote.output.total}",
    }),
  },
  edges: [
    ["low", "quote"],
    ["by_hand", "quote"],
    ["quote", "route"],
    ["route", "approve", { when: "large" }],
    ["route", "place", { when: "otherwise" }],
    ["approve", "place"],
    ["approve", "refused", { error: true }],
  ],
});

/**
 * Every Monday morning, text each owner with an invoice unpaid for two weeks.
 * A core step reads those invoices; a script texts each one. An owner who
 * cannot be texted does not stop the others.
 */
export const chaseUnpaid = defineFlow({
  path: "billing/chase-unpaid",
  description: "Texts owners about invoices unpaid for more than two weeks.",
  nodes: {
    weekly: trigger.schedule("0 9 * * 1", { timezone: "America/Los_Angeles" }),
    by_hand: trigger.manual(),
    find: step.script("core/table-read", {
      inputs: {
        table: "'invoices'",
        filter:
          "{'and': [{'column': 'status', 'value': 'unpaid'}, {'column': 'chased_at', 'op': 'is_null'}, " +
          "{'column': 'issued_on', 'op': 'lte', 'value': string(now - duration('336h')).substring(0, 10)}]}",
        sort: "'issued_on'",
        limit: "100",
      },
      with: { tables: [invoices] },
    }),
    chase: step.foreach("steps.find.output.rows", {
      script: chaseOne,
      input: "{'invoice': item.id}",
      concurrency: 4,
      continueOnError: true,
    }),
    count: step.set({
      looked_at: "size(steps.find.output.rows)",
      texted: "size(steps.chase.output.filter(x, has(x.texted) && x.texted))",
      failed: "size(steps.chase.output.filter(x, has(x.error)))",
    }),
  },
  edges: [
    ["weekly", "find"],
    ["by_hand", "find"],
    ["find", "chase"],
    ["chase", "count"],
  ],
});

/** The public form for new clients. Served by the platform under the portal. */
export const register = defineFlow({
  path: "registrations/new-client",
  description:
    "Takes a new client's details from the public form, for the front desk to call back.",
  nodes: {
    form: trigger.form({
      title: "Register with Fernhill Vets",
      description:
        "Tell us about you and your pet. Your nearest clinic will call you back within a day.",
      fields: [
        { name: "name", label: "Your name", type: "text", required: true },
        { name: "phone", label: "Phone", type: "text", required: true },
        { name: "email", label: "Email", type: "email" },
        { name: "pet_name", label: "Your pet's name", type: "text", required: true },
        {
          name: "species",
          label: "Species",
          type: "select",
          options: ["Dog", "Cat", "Rabbit", "Bird", "Other"],
          required: true,
        },
        {
          name: "clinic",
          label: "Nearest clinic",
          type: "select",
          options: ["northside", "riverside", "hilltop"],
          required: true,
        },
      ],
      submitLabel: "Register",
      success: "Thank you. Your clinic will call you within one working day.",
    }),
    keep: step.script("core/table-write", {
      inputs: {
        table: "'registrations'",
        values:
          "{'name': trigger.name, 'phone': trigger.phone, 'pet_name': trigger.pet_name, " +
          "'species': trigger.species, 'clinic': trigger.clinic, " +
          "'email': has(trigger.email) ? trigger.email : null}",
      },
      with: { tables: [registrations] },
    }),
    tell: step.script("core/publish-event", {
      inputs: { event: "'registrations/received'", payload: "{'id': steps.keep.output.row.id}" },
      with: { events: [registrationReceived] },
    }),
  },
  edges: [
    ["form", "keep"],
    ["keep", "tell"],
  ],
});

// ----- Starting by themselves -----

export const remindersEveryHour = defineSchedule({
  path: "reminders/hourly",
  script: sendReminders,
  cron: "0 * * * *",
  timezone: "America/Los_Angeles",
});

export const stockEveryHalfHour = defineSchedule({
  path: "inventory/half-hourly",
  script: checkStock,
  cron: "*/30 * * * *",
  timezone: "America/Los_Angeles",
});

/** PayFern signs each notification with the shared secret. An unsigned one is refused. */
export const paymentNotice = defineWebhook({
  path: "payments/payfern",
  script: recordPayment,
  verify: {
    scheme: "hmac-sha256",
    header: "x-payfern-signature",
    secret: "PAYFERN_SIGNING_SECRET",
    prefix: "sha256=",
  },
});

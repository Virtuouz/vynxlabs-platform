import { defineScript, type ScriptContext, z } from "@vynxlabs/sdk";
import {
  type AppointmentStatus,
  CLINICS,
  dollars,
  NEXT_STATUS,
  ROOMS,
  STATUS_WORDS,
  TIME_ZONE,
  VISIT_MINUTES,
} from "./constants.ts";
import {
  AppointmentState,
  appointments,
  approvalThreshold,
  Clinic,
  checkedIn,
  clients,
  clinics,
  examFee,
  inventory,
  invoicePaid,
  invoices,
  pets,
  purchaseOrders,
  REASONS,
  reminderLeadHours,
  sms,
  stockLow,
  supplier,
  visitDone,
} from "./model.ts";
import { clockText, hhmmOf, hoursOn, instantAt, wallClock } from "./time.ts";

/** What each reason for a visit adds to the exam fee, in cents. */
const EXTRAS: Record<string, { label: string; amount: number }[]> = {
  Vaccination: [{ label: "Vaccine, annual booster", amount: 4800 }],
  Dental: [
    { label: "Dental cleaning", amount: 14500 },
    { label: "General anesthesia", amount: 9500 },
  ],
  Surgery: [
    { label: "Surgical procedure", amount: 38000 },
    { label: "General anesthesia", amount: 9500 },
    { label: "Pain relief, 5 days", amount: 2400 },
  ],
  Lameness: [{ label: "Radiographs, two views", amount: 11500 }],
  Skin: [{ label: "Skin scrape and cytology", amount: 5200 }],
};

const MINUTE = 60_000;
const overlaps = (a: { start: number; minutes: number }, b: { start: number; minutes: number }) =>
  a.start < b.start + b.minutes * MINUTE && b.start < a.start + a.minutes * MINUTE;

/** A short number for people to read out over the phone. */
const shortNumber = (prefix: string) =>
  `${prefix}-${Date.now().toString(36).slice(-5).toUpperCase()}${Math.floor(Math.random() * 36)
    .toString(36)
    .toUpperCase()}`;

// ----- Booking -----

type Visit = NonNullable<typeof appointments.__row>;
type ClinicRow = NonNullable<typeof clinics.__row>;
const ACTIVE = ["booked", "checked_in", "in_exam"];

/** The clinic's row, or a refusal that says which clinics there are. */
async function clinicCalled(ctx: ScriptContext, code: string): Promise<ClinicRow> {
  const [clinic] = await ctx
    .table(clinics)
    .find({ filter: { column: "code", value: code }, limit: 1 });
  if (!clinic) throw new Error(`There is no clinic called ${code}. Choose ${CLINICS.join(", ")}.`);
  return clinic;
}

/** The visits still to happen at a clinic on one of its days, by its own clock. */
async function visitsOn(ctx: ScriptContext, clinic: string, date: string): Promise<Visit[]> {
  const from = instantAt(date, 0, TIME_ZONE);
  const to = instantAt(date, 24 * 60, TIME_ZONE);
  return ctx.table(appointments).find({
    filter: {
      and: [
        { column: "clinic", value: clinic },
        { column: "starts_at", op: "gte", value: from.toISOString() },
        { column: "starts_at", op: "lt", value: to.toISOString() },
        { column: "status", op: "in", value: ACTIVE },
      ],
    },
    limit: 1000,
  });
}

/**
 * Why a visit cannot start then, or null when it can: outside opening hours,
 * all consulting rooms taken, or the named vet already busy.
 */
function refusal(
  clinic: ClinicRow,
  booked: Visit[],
  start: Date,
  minutes: number,
  vet: string | undefined,
): string | null {
  const local = wallClock(start, TIME_ZONE);
  const hours = hoursOn(clinic, local.weekday);
  if (!hours)
    return `${clinic.name} is closed on ${local.weekday === "Sun" ? "Sundays" : "that day"}.`;
  if (local.minutes < hours.opens || local.minutes + minutes > hours.closes) {
    return `${clinic.name} is open ${hhmmOf(hours.opens)} to ${hhmmOf(hours.closes)} that day, Pacific time. Choose a time inside those hours.`;
  }
  const wanted = { start: start.getTime(), minutes };
  const meeting = booked.filter((other) =>
    overlaps(wanted, { start: new Date(other.starts_at).getTime(), minutes: other.minutes }),
  );
  const busyVet = vet ? meeting.find((other) => other.vet === vet) : undefined;
  if (busyVet) {
    return `${vet} is with ${busyVet.pet_name} then (${busyVet.number}). Try another time or any vet.`;
  }
  if (meeting.length >= ROOMS) return "Every consulting room is taken then. Try another time.";
  return null;
}

export const freeTimes = defineScript({
  path: "appointments/free-times",
  description:
    "Lists the times a visit of a given length can start at a clinic on a day, Pacific time. Shows no one else's visits.",
  input: z.object({
    clinic: Clinic,
    date: z.iso.date().describe("The day, YYYY-MM-DD, at the clinic."),
    minutes: z.number().int().min(10).max(240).default(20),
    vet: z.string().max(80).optional(),
  }),
  output: z.object({
    closed: z.boolean(),
    times: z.array(z.object({ starts_at: z.string(), local: z.string() })),
  }),
  tables: [clinics, appointments],
  async run(input, ctx) {
    const clinic = await clinicCalled(ctx, input.clinic);
    const booked = await visitsOn(ctx, input.clinic, input.date);
    const day = wallClock(instantAt(input.date, 12 * 60, TIME_ZONE), TIME_ZONE);
    const hours = hoursOn(clinic, day.weekday);
    if (!hours) return { closed: true, times: [] };
    const times = [];
    for (let at = hours.opens; at + input.minutes <= hours.closes; at += 20) {
      const start = instantAt(input.date, at, TIME_ZONE);
      if (start.getTime() < Date.now() + 15 * MINUTE) continue;
      if (refusal(clinic, booked, start, input.minutes, input.vet)) continue;
      times.push({ starts_at: start.toISOString(), local: hhmmOf(at) });
    }
    return { closed: false, times };
  },
});

export const bookAppointment = defineScript({
  path: "appointments/book",
  description:
    "Books a visit for a pet at a clinic. Refuses a time outside opening hours (Pacific time), when every room is taken, or when the named vet is busy. A pet owner may book only for their own pets.",
  input: z.object({
    pet: z.uuid().describe("The pet's row ID."),
    clinic: Clinic.describe("Which clinic: northside, riverside or hilltop."),
    starts_at: z.iso
      .datetime({ offset: true })
      .describe(
        "When the visit starts: an ISO date and time with its offset, such as 2026-11-17T10:00:00-08:00.",
      ),
    minutes: z
      .number()
      .int()
      .min(10)
      .max(240)
      .optional()
      .describe("Default: what the reason usually takes."),
    reason: z.enum(REASONS),
    vet: z.string().max(80).optional().describe("A vet's name, when the owner asks for one."),
    notes: z.string().max(500).optional(),
  }),
  output: z.object({
    id: z.string(),
    number: z.string(),
    starts_at: z.string(),
    local: z.string(),
  }),
  tables: [pets, clinics, appointments],
  async run(input, ctx) {
    const who = ctx.run.startedBy;
    // An owner sees only their own pets: ask the table as them.
    const petTable =
      who.type === "end_user" && who.id ? ctx.table(pets).as(who.id) : ctx.table(pets);
    const pet = await petTable.get(input.pet);
    if (!pet) throw new Error("There is no such pet, or it is not yours to book for.");

    const clinic = await clinicCalled(ctx, input.clinic);
    const start = new Date(input.starts_at);
    if (start.getTime() < Date.now() - 5 * MINUTE) throw new Error("That time has passed.");
    const minutes = input.minutes ?? VISIT_MINUTES[input.reason];
    const booked = await visitsOn(ctx, input.clinic, wallClock(start, TIME_ZONE).date);

    // The same animal cannot be in two places: a second booking is usually a retry.
    const twice = booked.find(
      (other) =>
        other.pet === pet.id &&
        overlaps(
          { start: start.getTime(), minutes },
          { start: new Date(other.starts_at).getTime(), minutes: other.minutes },
        ),
    );
    if (twice) {
      throw new Error(
        `${pet.name} is already booked at ${clockText(twice.starts_at, TIME_ZONE)} (${twice.number}).`,
      );
    }
    const why = refusal(clinic, booked, start, minutes, input.vet);
    if (why) throw new Error(why);

    const row = await ctx.table(appointments).insert({
      number: shortNumber("A"),
      pet: pet.id,
      pet_name: pet.name,
      species: pet.species,
      client_code: pet.client_code,
      clinic: input.clinic,
      vet: input.vet ?? null,
      starts_at: start.toISOString(),
      minutes,
      reason: input.reason,
      status: "booked",
      notes: input.notes ?? null,
    });
    ctx.log.info("Visit booked", { number: row.number, clinic: input.clinic, by: who.type });
    return {
      id: row.id,
      number: row.number,
      starts_at: row.starts_at,
      local: `${wallClock(start, TIME_ZONE).date} ${clockText(start, TIME_ZONE)} Pacific`,
    };
  },
});

export const setStatus = defineScript({
  path: "appointments/set-status",
  description:
    "Moves a visit on: checked in, in the exam room, done, a no-show, or canceled. Done starts the invoice.",
  input: z.object({
    appointment: z.uuid(),
    status: AppointmentState,
    notes: z.string().max(500).optional(),
  }),
  output: z.object({ id: z.string(), status: z.string() }),
  tables: [appointments],
  events: [checkedIn, visitDone],
  async run(input, ctx) {
    const who = ctx.run.startedBy;
    // Front-desk staff change only their own clinic's visits: the table's rules decide.
    const table =
      who.type === "end_user" && who.id
        ? ctx.table(appointments).as(who.id)
        : ctx.table(appointments);
    const visit = await table.get(input.appointment);
    if (!visit) throw new Error("There is no such visit, or it is another clinic's.");
    if (!NEXT_STATUS[visit.status as AppointmentStatus]?.includes(input.status)) {
      throw new Error(
        `A visit that is ${STATUS_WORDS[visit.status as AppointmentStatus].toLowerCase()} cannot become ${STATUS_WORDS[input.status].toLowerCase()}.`,
      );
    }
    const changes: Record<string, unknown> = { status: input.status };
    if (input.status === "checked_in") changes.checked_in_at = new Date().toISOString();
    if (input.notes) changes.notes = input.notes;
    const updated = await table.update(visit.id, changes);
    if (input.status === "checked_in") {
      await ctx.events.publish("appointments/checked-in", {
        appointment: visit.id,
        clinic: visit.clinic,
        pet: visit.pet_name,
      });
    }
    if (input.status === "done") {
      await ctx.events.publish("appointments/completed", {
        appointment: visit.id,
        clinic: visit.clinic,
        client: visit.client_code,
        pet: visit.pet_name,
        reason: visit.reason,
      });
    }
    return { id: updated.id, status: updated.status };
  },
});

// ----- Messages -----

export const sendSms = defineScript({
  path: "messaging/send-sms",
  description: "Sends one text message through TextLine.",
  input: z.object({ to: z.string().min(5), text: z.string().min(1).max(480) }),
  output: z.object({ id: z.string() }),
  connections: [sms],
  retries: { limit: 2, delaySeconds: 10 },
  async run(input, ctx) {
    const gateway = await ctx.connection("sms");
    const sent = await gateway.post("/messages", { to: input.to, text: input.text });
    const body = sent.json() as { id: string };
    ctx.log.info("Text sent", { to: `…${input.to.slice(-4)}`, id: body.id });
    return { id: body.id };
  },
});

export const sendReminders = defineScript({
  path: "reminders/send",
  description: "Texts every owner whose pet has a visit in the next day, once.",
  input: z.object({}),
  output: z.object({ sent: z.number(), failed: z.number() }),
  tables: [appointments, clients],
  connections: [sms],
  variables: [reminderLeadHours],
  timeoutSeconds: 300,
  concurrency: 1,
  onFailure: { script: "alerts/run-failed" },
  async run(_input, ctx) {
    const hours = Number(await ctx.variable("reminders/lead-hours"));
    const now = new Date();
    const until = new Date(now.getTime() + hours * 3_600_000);
    const due = await ctx.table(appointments).find({
      filter: {
        and: [
          { column: "status", value: "booked" },
          { column: "reminded_at", op: "is_null" },
          { column: "starts_at", op: "gte", value: now.toISOString() },
          { column: "starts_at", op: "lte", value: until.toISOString() },
        ],
      },
      limit: 1000,
    });
    const gateway = await ctx.connection("sms");
    let sent = 0;
    let failed = 0;
    for (const visit of due) {
      if (ctx.signal.aborted) break;
      const [owner] = await ctx
        .table(clients)
        .find({ filter: { column: "code", value: visit.client_code }, limit: 1 });
      if (!owner) continue;
      const when = new Intl.DateTimeFormat("en-US", {
        timeZone: TIME_ZONE,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(visit.starts_at));
      const response = await gateway.post(
        "/messages",
        {
          to: owner.phone,
          text: `Fernhill Vets: ${visit.pet_name} has a visit at our ${visit.clinic} clinic on ${when}. Reply C to cancel.`,
        },
        { allowFailure: true },
      );
      if (response.status >= 500) {
        throw new Error(
          `TextLine answered ${response.status}: the gateway is down. ${sent} reminders went out first.`,
        );
      }
      if (!response.ok) {
        failed += 1;
        ctx.log.warn("A reminder was refused", {
          visit: visit.number,
          status: response.status,
          reason: (response.json() as { error?: string }).error,
        });
        continue;
      }
      await ctx.table(appointments).update(visit.id, { reminded_at: new Date().toISOString() });
      sent += 1;
    }
    ctx.log.info("Reminders done", { due: due.length, sent, failed });
    return { sent, failed };
  },
});

// ----- Money -----

export const createInvoice = defineScript({
  path: "billing/create-invoice",
  description:
    "Writes the invoice for a finished visit: the consultation and what the visit was for.",
  input: z.object({ appointment: z.uuid() }),
  output: z.object({
    id: z.string(),
    number: z.string(),
    /** In cents. */
    total: z.number(),
    /** The total as people read it: $65.00. */
    amount: z.string(),
    phone: z.string(),
    pet: z.string(),
  }),
  tables: [appointments, invoices, clients],
  variables: [examFee],
  async run(input, ctx) {
    const visit = await ctx.table(appointments).get(input.appointment);
    if (!visit) throw new Error("There is no such visit.");
    const [existing] = await ctx
      .table(invoices)
      .find({ filter: { column: "appointment", value: visit.id }, limit: 1 });
    const [owner] = await ctx
      .table(clients)
      .find({ filter: { column: "code", value: visit.client_code }, limit: 1 });
    if (!owner) throw new Error(`No client has the code ${visit.client_code}.`);
    if (existing) {
      return {
        id: existing.id,
        number: existing.number,
        total: existing.total,
        amount: dollars(existing.total),
        phone: owner.phone,
        pet: visit.pet_name,
      };
    }
    const fee = Number(await ctx.variable("billing/exam-fee"));
    const lines = [{ label: "Exam", amount: fee }, ...(EXTRAS[visit.reason] ?? [])];
    const total = lines.reduce((sum, line) => sum + line.amount, 0);
    const row = await ctx.table(invoices).insert({
      number: shortNumber("INV"),
      appointment: visit.id,
      client_code: visit.client_code,
      clinic: visit.clinic,
      total,
      status: "unpaid",
      issued_on: wallClock(new Date(), TIME_ZONE).date,
      lines,
    });
    ctx.log.info("Invoice written", { number: row.number, total });
    return {
      id: row.id,
      number: row.number,
      total,
      amount: dollars(total),
      phone: owner.phone,
      pet: visit.pet_name,
    };
  },
});

/** What PayFern sends when a payment goes through. */
const Payment = z.object({
  type: z.literal("payment.succeeded"),
  invoice: z.string(),
  amount: z.number().int(),
  reference: z.string(),
});

export const recordPayment = defineScript({
  path: "billing/record-payment",
  description: "Marks an invoice paid when PayFern says the money arrived.",
  input: Payment,
  output: z.object({ invoice: z.string(), status: z.string() }),
  tables: [invoices],
  events: [invoicePaid],
  async run(input, ctx) {
    const [invoice] = await ctx
      .table(invoices)
      .find({ filter: { column: "number", value: input.invoice }, limit: 1 });
    if (!invoice) throw new Error(`PayFern paid ${input.invoice}, which is not one of ours.`);
    if (invoice.status === "paid") return { invoice: invoice.number, status: "paid" };
    if (input.amount !== invoice.total) {
      throw new Error(
        `PayFern paid ${input.amount} for ${invoice.number}, which is for ${invoice.total}. Look into it before marking it paid.`,
      );
    }
    await ctx.table(invoices).update(invoice.id, {
      status: "paid",
      paid_at: new Date().toISOString(),
      payment_ref: input.reference,
    });
    await ctx.events.publish("invoices/paid", { invoice: invoice.number, amount: input.amount });
    return { invoice: invoice.number, status: "paid" };
  },
});

export const chaseOne = defineScript({
  path: "billing/chase-one",
  description: "Texts the owner about one unpaid invoice, when it is more than two weeks old.",
  input: z.object({ invoice: z.uuid() }),
  output: z.object({ invoice: z.string(), texted: z.boolean() }),
  tables: [invoices, clients],
  connections: [sms],
  async run(input, ctx) {
    const invoice = await ctx.table(invoices).get(input.invoice);
    if (!invoice) throw new Error("There is no such invoice.");
    const age = Date.now() - new Date(`${invoice.issued_on}T00:00:00Z`).getTime();
    if (invoice.status !== "unpaid" || invoice.chased_at || age < 14 * 86_400_000) {
      return { invoice: invoice.number, texted: false };
    }
    const [owner] = await ctx
      .table(clients)
      .find({ filter: { column: "code", value: invoice.client_code }, limit: 1 });
    if (!owner) throw new Error(`No client has the code ${invoice.client_code}.`);
    const gateway = await ctx.connection("sms");
    const sent = await gateway.post(
      "/messages",
      {
        to: owner.phone,
        text: `Fernhill Vets: invoice ${invoice.number} for ${dollars(invoice.total)} is still unpaid. Pay it in the pet portal, or call your clinic.`,
      },
      { allowFailure: true },
    );
    // A number that cannot take texts is the clinic's to follow up by phone, not a failure.
    if (sent.status >= 400 && sent.status < 500) {
      ctx.log.warn("The owner could not be texted", {
        invoice: invoice.number,
        status: sent.status,
      });
      return { invoice: invoice.number, texted: false };
    }
    if (!sent.ok) throw new Error(`TextLine answered ${sent.status}.`);
    await ctx.table(invoices).update(invoice.id, { chased_at: new Date().toISOString() });
    return { invoice: invoice.number, texted: true };
  },
});

// ----- Stock -----

export const checkStock = defineScript({
  path: "inventory/check",
  description: "Finds every line at or under its reorder level and says so, once per line.",
  input: z.object({}),
  output: z.object({ low: z.number() }),
  tables: [inventory],
  events: [stockLow],
  concurrency: 1,
  async run(_input, ctx) {
    const lines = await ctx.table(inventory).find({
      filter: { column: "reorder_pending", value: false },
      limit: 1000,
    });
    const low = lines.filter((line) => line.on_hand <= line.reorder_at);
    for (const line of low) {
      await ctx.table(inventory).update(line.id, { reorder_pending: true });
      await ctx.events.publish("inventory/low", {
        line: line.id,
        clinic: line.clinic,
        sku: line.sku,
        item: line.item,
        on_hand: line.on_hand,
        quantity: line.reorder_qty,
      });
    }
    ctx.log.info("Stock checked", { lines: lines.length, low: low.length });
    return { low: low.length };
  },
});

export const quoteOrder = defineScript({
  path: "inventory/quote",
  description: "Asks VetSupply what an order would cost, and whether a manager must approve it.",
  input: z.object({ sku: z.string(), quantity: z.number().int().positive() }),
  output: z.object({
    /** In cents. */
    unit_price: z.number(),
    /** In cents. */
    total: z.number(),
    /** The total as people read it: $378.00. */
    amount: z.string(),
    needs_approval: z.boolean(),
    lead_days: z.number(),
  }),
  connections: [supplier],
  variables: [approvalThreshold],
  async run(input, ctx) {
    const api = await ctx.connection("supplier");
    const quote = (
      await api.get(`/catalog/${encodeURIComponent(input.sku)}`, {
        query: { quantity: input.quantity },
      })
    ).json() as { unit_price: number; lead_days: number };
    const total = quote.unit_price * input.quantity;
    const limit = Number(await ctx.variable("inventory/approval-threshold"));
    return {
      unit_price: quote.unit_price,
      total,
      amount: dollars(total),
      needs_approval: total > limit,
      lead_days: quote.lead_days,
    };
  },
});

export const placeOrder = defineScript({
  path: "inventory/place-order",
  description: "Places an order with VetSupply and records it.",
  input: z.object({
    line: z.uuid(),
    quantity: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  }),
  output: z.object({ number: z.string(), supplier_ref: z.string() }),
  tables: [inventory, purchaseOrders],
  connections: [supplier],
  retries: { limit: 2, delaySeconds: 15 },
  async run(input, ctx) {
    const line = await ctx.table(inventory).get(input.line);
    if (!line) throw new Error("That stock line no longer exists.");
    const number = shortNumber("PO");
    const api = await ctx.connection("supplier");
    const placed = (
      await api.post(
        "/orders",
        {
          account: `FERNHILL-${line.clinic.toUpperCase()}`,
          sku: line.sku,
          quantity: input.quantity,
        },
        { headers: { "idempotency-key": `${ctx.run.idempotencyKey}` } },
      )
    ).json() as { reference: string };
    await ctx.table(purchaseOrders).insert({
      number,
      clinic: line.clinic,
      sku: line.sku,
      item: line.item,
      quantity: input.quantity,
      total: input.total,
      status: "placed",
      supplier_ref: placed.reference,
    });
    ctx.log.info("Order placed", { number, sku: line.sku, clinic: line.clinic });
    return { number, supplier_ref: placed.reference };
  },
});

export const recordRefusedOrder = defineScript({
  path: "inventory/record-refused",
  description: "Records an order a manager turned down, and lets the line be checked again.",
  input: z.object({ line: z.uuid(), quantity: z.number().int(), total: z.number().int() }),
  output: z.object({ number: z.string() }),
  tables: [inventory, purchaseOrders],
  async run(input, ctx) {
    const line = await ctx.table(inventory).get(input.line);
    if (!line) throw new Error("That stock line no longer exists.");
    const number = shortNumber("PO");
    await ctx.table(purchaseOrders).insert({
      number,
      clinic: line.clinic,
      sku: line.sku,
      item: line.item,
      quantity: input.quantity,
      total: input.total,
      status: "refused",
    });
    await ctx.table(inventory).update(line.id, { reorder_pending: false });
    return { number };
  },
});

export const useStock = defineScript({
  path: "inventory/use",
  description: "Takes items out of a clinic's stock, as the person using them.",
  input: z.object({ line: z.uuid(), quantity: z.number().int().min(1).max(100) }),
  output: z.object({ on_hand: z.number() }),
  tables: [inventory],
  async run(input, ctx) {
    const who = ctx.run.startedBy;
    const table =
      who.type === "end_user" && who.id ? ctx.table(inventory).as(who.id) : ctx.table(inventory);
    const line = await table.get(input.line);
    if (!line) throw new Error("There is no such stock line, or it is another clinic's.");
    if (line.on_hand < input.quantity) {
      throw new Error(`Only ${line.on_hand} of ${line.item} are left.`);
    }
    const updated = await table.update(line.id, { on_hand: line.on_hand - input.quantity });
    return { on_hand: updated.on_hand };
  },
});

// ----- For the agent: questions people ask on the phone -----

export const findClient = defineScript({
  path: "agent/find-client",
  description:
    "Finds pet owners by name, phone number, client code or pet name. Answers with their pets and their next visit.",
  input: z.object({
    query: z
      .string()
      .min(2)
      .describe("A name, a phone number, a client code such as C-1042, or a pet's name."),
  }),
  output: z.object({
    matches: z.array(
      z.object({
        code: z.string(),
        name: z.string(),
        phone: z.string(),
        home_clinic: z.string(),
        pets: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            species: z.string(),
            alert: z.string().nullable(),
          }),
        ),
        next_visit: z
          .object({
            number: z.string(),
            starts_at: z.string(),
            clinic: z.string(),
            reason: z.string(),
          })
          .nullable(),
        unpaid: z.number(),
      }),
    ),
  }),
  tables: [clients, pets, appointments, invoices],
  async run(input, ctx) {
    const q = input.query.trim();
    const digits = q.replace(/\D/g, "");
    const byOwner = await ctx.table(clients).find({
      filter: {
        or: [
          { column: "name", op: "contains", value: q },
          // Numbers are stored as people write them, (503) 555-0142: match on the last digits.
          ...(digits.length >= 4
            ? [{ column: "phone", op: "contains" as const, value: digits.slice(-4) }]
            : []),
          { column: "code", value: q.toUpperCase() },
        ],
      },
      limit: 10,
    });
    const byPet = await ctx.table(pets).find({
      filter: { column: "name", op: "contains", value: q },
      limit: 10,
    });
    const codes = [
      ...new Set([...byOwner.map((one) => one.code), ...byPet.map((one) => one.client_code)]),
    ].slice(0, 10);
    const matches = [];
    for (const code of codes) {
      const [owner] = byOwner.filter((one) => one.code === code).length
        ? byOwner.filter((one) => one.code === code)
        : await ctx.table(clients).find({ filter: { column: "code", value: code }, limit: 1 });
      if (!owner) continue;
      const theirPets = await ctx
        .table(pets)
        .find({ filter: { column: "client_code", value: code } });
      const [next] = await ctx.table(appointments).find({
        filter: {
          and: [
            { column: "client_code", value: code },
            { column: "status", value: "booked" },
            { column: "starts_at", op: "gte", value: new Date().toISOString() },
          ],
        },
        sort: ["starts_at"],
        limit: 1,
      });
      const unpaid = await ctx.table(invoices).aggregate({
        measures: ["sum:total"],
        filter: {
          and: [
            { column: "client_code", value: code },
            { column: "status", value: "unpaid" },
          ],
        },
      });
      matches.push({
        code: owner.code,
        name: owner.name,
        phone: owner.phone,
        home_clinic: owner.home_clinic,
        pets: theirPets.map((pet) => ({
          id: pet.id,
          name: pet.name,
          species: pet.species,
          alert: pet.alert ?? null,
        })),
        next_visit: next
          ? {
              number: next.number,
              starts_at: next.starts_at,
              clinic: next.clinic,
              reason: next.reason,
            }
          : null,
        unpaid: Number(unpaid.items[0]?.values["sum:total"] ?? 0),
      });
    }
    return { matches };
  },
});

export const clinicDay = defineScript({
  path: "agent/clinic-day",
  description:
    "How a clinic's day looks: visits by status, who has not arrived, and what was invoiced, in dollars. Without a date, today (Pacific time).",
  input: z.object({
    clinic: Clinic,
    date: z.iso.date().optional().describe("YYYY-MM-DD. Default today."),
  }),
  output: z.object({
    clinic: z.string(),
    date: z.string(),
    visits: z.record(z.string(), z.number()),
    waiting: z.array(z.object({ number: z.string(), pet: z.string(), starts_at: z.string() })),
    /** In cents. */
    invoiced: z.number(),
    /** In cents. */
    paid: z.number(),
  }),
  tables: [appointments, invoices],
  async run(input, ctx) {
    const date = input.date ?? wallClock(new Date(), TIME_ZONE).date;
    const visits = await ctx.table(appointments).find({
      filter: {
        and: [
          { column: "clinic", value: input.clinic },
          { column: "starts_at", op: "gte", value: instantAt(date, 0, TIME_ZONE).toISOString() },
          {
            column: "starts_at",
            op: "lt",
            value: instantAt(date, 24 * 60, TIME_ZONE).toISOString(),
          },
        ],
      },
      sort: ["starts_at"],
      limit: 500,
    });
    const counts: Record<string, number> = {};
    for (const visit of visits) counts[visit.status] = (counts[visit.status] ?? 0) + 1;
    const late = visits.filter(
      (visit) => visit.status === "booked" && new Date(visit.starts_at).getTime() < Date.now(),
    );
    const money = await ctx.table(invoices).aggregate({
      group: ["status"],
      measures: ["sum:total"],
      filter: {
        and: [
          { column: "clinic", value: input.clinic },
          { column: "issued_on", value: date },
        ],
      },
    });
    const sum = (status?: string) =>
      money.items
        .filter((item) => !status || item.by.status === status)
        .reduce((total, item) => total + Number(item.values["sum:total"] ?? 0), 0);
    return {
      clinic: input.clinic,
      date,
      visits: counts,
      waiting: late.map((visit) => ({
        number: visit.number,
        pet: visit.pet_name,
        starts_at: visit.starts_at,
      })),
      invoiced: sum(),
      paid: sum("paid"),
    };
  },
});

export const lowStock = defineScript({
  path: "agent/low-stock",
  description:
    "Lists stock at or under its reorder level, and whether an order is already under way.",
  input: z.object({ clinic: Clinic.optional() }),
  output: z.object({
    lines: z.array(
      z.object({
        id: z.string(),
        clinic: z.string(),
        sku: z.string(),
        item: z.string(),
        on_hand: z.number(),
        reorder_at: z.number(),
        ordering: z.boolean(),
      }),
    ),
  }),
  tables: [inventory],
  async run(input, ctx) {
    const lines = await ctx.table(inventory).find({
      ...(input.clinic ? { filter: { column: "clinic", value: input.clinic } } : {}),
      limit: 1000,
    });
    return {
      lines: lines
        .filter((line) => line.on_hand <= line.reorder_at)
        .map((line) => ({
          id: line.id,
          clinic: line.clinic,
          sku: line.sku,
          item: line.item,
          on_hand: line.on_hand,
          reorder_at: line.reorder_at,
          ordering: line.reorder_pending ?? false,
        })),
    };
  },
});

// ----- When something fails for good -----

export const runFailed = defineScript({
  path: "alerts/run-failed",
  description: "Records a run that failed for the last time. The place to page someone.",
  input: z.object({
    run: z.object({ id: z.string(), script: z.string(), attempt: z.number(), error: z.string() }),
  }),
  output: z.object({ recorded: z.boolean() }),
  async run(input, ctx) {
    ctx.log.error("A run failed for the last time", input.run);
    return { recorded: true };
  },
});

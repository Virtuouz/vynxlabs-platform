import {
  column,
  defineConnection,
  defineEvent,
  defineTable,
  defineVariable,
  z,
} from "@vynxlabs/sdk";

/**
 * Fernhill Veterinary Group: three clinics, Northside, Riverside and Hilltop.
 *
 * Who sees what is decided by the tables' rules, not by the apps:
 *
 * - Front-desk staff are end users in a group named after their clinic. They
 *   see and change the rows whose `clinic` column names that group.
 * - Pet owners are end users with a `client_id` attribute. They read the rows
 *   whose `client_code` equals it.
 * - Practice managers and vets are members of the tenant. Their roles let them
 *   read everything.
 */

export const CLINICS = ["northside", "riverside", "hilltop"] as const;
export const Clinic = z.enum(CLINICS);

// ----- Places -----

export const clinics = defineTable({
  path: "clinics",
  description: "The group's clinics: where they are and when they open.",
  columns: {
    code: column.text({ required: true, unique: true }),
    name: column.text({ required: true }),
    phone: column.text({ required: true }),
    address: column.text({ required: true }),
    opens: column.text({ required: true, default: "08:00" }),
    closes: column.text({ required: true, default: "18:00" }),
  },
  policy: { rules: [{ allow: "read", when: { everyone: true } }] },
});

// ----- People and their animals -----

export const clients = defineTable({
  path: "clients",
  description: "Pet owners. `code` is what their portal account's client_id attribute holds.",
  columns: {
    code: column.text({ required: true, unique: true }),
    name: column.text({ required: true }),
    email: column.text(),
    phone: column.text({ required: true }),
    home_clinic: column.text({ required: true }),
    notes: column.text(),
  },
  indexes: [["home_clinic"], ["phone"]],
  policy: {
    rules: [
      { allow: "all", when: { column: "home_clinic", in: "groups" } },
      { allow: "read", when: { column: "code", equals: { attribute: "client_id" } } },
    ],
  },
});

export const pets = defineTable({
  path: "pets",
  description: "Every animal on the books, with its owner's client code.",
  columns: {
    name: column.text({ required: true }),
    species: column.text({ required: true }),
    breed: column.text(),
    born: column.date(),
    weight_kg: column.number(),
    client_code: column.text({ required: true }),
    clinic: column.text({ required: true }),
    /** Something every member of staff should know before handling the animal. */
    alert: column.text(),
  },
  indexes: [["client_code"], ["clinic"]],
  policy: {
    rules: [
      { allow: "all", when: { column: "clinic", in: "groups" } },
      { allow: "read", when: { column: "client_code", equals: { attribute: "client_id" } } },
    ],
  },
});

export const APPOINTMENT_STATES = [
  "booked",
  "checked_in",
  "in_exam",
  "done",
  "no_show",
  "cancelled",
] as const;
export const AppointmentState = z.enum(APPOINTMENT_STATES);

export const REASONS = [
  "Check-up",
  "Vaccination",
  "Dental",
  "Surgery",
  "Lameness",
  "Skin",
  "Follow-up",
] as const;

export const appointments = defineTable({
  path: "appointments",
  description: "Every visit, booked or past, and where it stands.",
  columns: {
    number: column.text({ required: true, unique: true }),
    pet: column.reference("pets", { required: true }),
    pet_name: column.text({ required: true }),
    species: column.text(),
    client_code: column.text({ required: true }),
    clinic: column.text({ required: true }),
    vet: column.text(),
    starts_at: column.timestamp({ required: true }),
    minutes: column.integer({ required: true, default: 20 }),
    reason: column.text({ required: true }),
    status: column.text({ required: true, default: "booked" }),
    checked_in_at: column.timestamp(),
    reminded_at: column.timestamp(),
    notes: column.text(),
  },
  indexes: [["clinic", "starts_at"], ["client_code"], ["status"]],
  policy: {
    rules: [
      { allow: "all", when: { column: "clinic", in: "groups" } },
      { allow: "read", when: { column: "client_code", equals: { attribute: "client_id" } } },
    ],
  },
});

// ----- Money -----

export const invoices = defineTable({
  path: "invoices",
  description: "One invoice per finished visit. Paid when the payment provider says so.",
  columns: {
    number: column.text({ required: true, unique: true }),
    appointment: column.reference("appointments"),
    client_code: column.text({ required: true }),
    clinic: column.text({ required: true }),
    /** In pence. */
    total: column.integer({ required: true }),
    status: column.text({ required: true, default: "unpaid" }),
    issued_on: column.date({ required: true }),
    paid_at: column.timestamp(),
    payment_ref: column.text(),
    lines: column.json(),
    chased_at: column.timestamp(),
  },
  indexes: [["clinic", "issued_on"], ["client_code"], ["status"]],
  policy: {
    rules: [
      { allow: "read", when: { column: "clinic", in: "groups" } },
      { allow: "read", when: { column: "client_code", equals: { attribute: "client_id" } } },
    ],
  },
});

// ----- Stock -----

export const inventory = defineTable({
  path: "inventory",
  description: "What each clinic holds, and when to order more.",
  columns: {
    clinic: column.text({ required: true }),
    sku: column.text({ required: true }),
    item: column.text({ required: true }),
    category: column.text({ required: true }),
    on_hand: column.integer({ required: true }),
    reorder_at: column.integer({ required: true }),
    reorder_qty: column.integer({ required: true }),
    /** In pence, as the supplier last quoted it. */
    unit_cost: column.integer({ required: true }),
    /** Set while an order for this line is being decided or is on its way. */
    reorder_pending: column.boolean({ default: false }),
  },
  indexes: [["clinic", "sku"]],
  policy: { rules: [{ allow: "all", when: { column: "clinic", in: "groups" } }] },
});

export const purchaseOrders = defineTable({
  path: "purchase_orders",
  description: "Orders to the supplier, as the reorder flow placed them.",
  columns: {
    number: column.text({ required: true, unique: true }),
    clinic: column.text({ required: true }),
    sku: column.text({ required: true }),
    item: column.text({ required: true }),
    quantity: column.integer({ required: true }),
    /** In pence. */
    total: column.integer({ required: true }),
    status: column.text({ required: true }),
    supplier_ref: column.text(),
  },
  policy: { rules: [{ allow: "read", when: { column: "clinic", in: "groups" } }] },
});

// ----- New clients from the public form -----

export const registrations = defineTable({
  path: "registrations",
  description:
    "People who asked to register through the public form, until the front desk calls back.",
  columns: {
    name: column.text({ required: true }),
    email: column.text(),
    phone: column.text({ required: true }),
    pet_name: column.text({ required: true }),
    species: column.text({ required: true }),
    clinic: column.text({ required: true }),
    status: column.text({ required: true, default: "new" }),
  },
  policy: { rules: [{ allow: "all", when: { column: "clinic", in: "groups" } }] },
});

// ----- Outside systems, configured per workspace -----

export const sms = defineConnection({
  path: "sms",
  description: "TextLine, the SMS gateway: reminders and thank-you messages.",
});
export const supplier = defineConnection({
  path: "supplier",
  description: "VetSupply Direct: prices and orders for stock.",
});

// ----- Settings -----

export const reminderLeadHours = defineVariable({
  path: "reminders/lead-hours",
  description: "How long before a visit its reminder is sent.",
  default: "24",
});
export const approvalThreshold = defineVariable({
  path: "inventory/approval-threshold",
  description: "An order costing more than this, in pence, waits for a practice manager.",
  default: "30000",
});
export const examFee = defineVariable({
  path: "billing/exam-fee",
  description: "The consultation fee on every invoice, in pence.",
  default: "6500",
});

// ----- What happens, for anything that wants to know -----

export const checkedIn = defineEvent({
  path: "appointments/checked-in",
  description: "A patient arrived at the front desk.",
  payload: z.object({ appointment: z.string(), clinic: z.string(), pet: z.string() }),
});
export const visitDone = defineEvent({
  path: "appointments/completed",
  description: "A visit ended and should be invoiced.",
  payload: z.object({
    appointment: z.string(),
    clinic: z.string(),
    client: z.string(),
    pet: z.string(),
    reason: z.string(),
  }),
});
export const stockLow = defineEvent({
  path: "inventory/low",
  description: "A clinic's stock of one item fell to its reorder level.",
  payload: z.object({
    line: z.string(),
    clinic: z.string(),
    sku: z.string(),
    item: z.string(),
    on_hand: z.number(),
    quantity: z.number(),
  }),
});
export const invoicePaid = defineEvent({
  path: "invoices/paid",
  description: "The payment provider confirmed a payment.",
  payload: z.object({ invoice: z.string(), amount: z.number() }),
});
export const registrationReceived = defineEvent({
  path: "registrations/received",
  description: "Someone asked to register through the public form.",
  payload: z.object({ id: z.string() }),
});

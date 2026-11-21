import { column, defineEvent, defineTable, z } from "@volvel/sdk";

/**
 * Lakeshore State University lends laptops, hotspots, calculators and the like
 * to students. A student asks for a kind of device; the Tech Desk approves it
 * (small things are approved at once); a device is set aside; the student
 * collects it, and brings it back by its due date.
 *
 * Who sees what is decided by the tables' rules:
 *
 * - Students are end users with a `student_id` attribute. They read their own
 *   student record, requests and loans, and every device (to see what is free).
 * - Tech Desk staff are members of the tenant. Their roles let them read and
 *   change everything.
 */

export const KINDS = ["laptop", "chromebook", "hotspot", "ipad", "calculator", "charger"] as const;
export const Kind = z.enum(KINDS);
/** Kinds handed out without anyone at the desk approving them. */
export const AUTO_APPROVED: readonly (typeof KINDS)[number][] = ["calculator", "charger"];
export const LOCATIONS = ["library", "tech-desk"] as const;
export const Location = z.enum(LOCATIONS);

export const DEVICE_STATES = [
  "available",
  "reserved",
  "checked_out",
  "maintenance",
  "retired",
] as const;
export const REQUEST_STATES = [
  "pending",
  "ready",
  "waitlisted",
  "fulfilled",
  "denied",
  "cancelled",
] as const;
export const LOAN_STATES = ["out", "returned", "lost"] as const;
export const CONDITIONS = ["good", "worn", "damaged"] as const;
export const Condition = z.enum(CONDITIONS);

/** Dates and the desk's day are kept in the university's time. */
export const TIME_ZONE = "America/Chicago";

// ----- People -----

export const students = defineTable({
  path: "students",
  description:
    "Students who may borrow. `student_number` is what their end-user account's student_id attribute holds.",
  columns: {
    student_number: column.text({ required: true, unique: true }),
    name: column.text({ required: true }),
    email: column.text({ required: true }),
    program: column.text(),
    /** A student with a hold (unpaid fines, a lost device) cannot borrow. */
    standing: column.text({ required: true, default: "good" }),
    hold_reason: column.text(),
  },
  policy: {
    rules: [
      { allow: "read", when: { column: "student_number", equals: { attribute: "student_id" } } },
    ],
  },
});

// ----- Things to lend -----

export const devices = defineTable({
  path: "devices",
  description: "Every device the desk lends, where it lives, and whether it is free.",
  columns: {
    asset_tag: column.text({ required: true, unique: true }),
    kind: column.text({ required: true }),
    model: column.text({ required: true }),
    serial: column.text({ required: true, unique: true }),
    location: column.text({ required: true }),
    status: column.text({ required: true, default: "available" }),
    condition: column.text({ required: true, default: "good" }),
    /** The request it is set aside for, while `reserved`. */
    reserved_for: column.text(),
    notes: column.text(),
  },
  indexes: [["kind", "status"], ["status"]],
  policy: { rules: [{ allow: "read", when: { everyone: true } }] },
});

// ----- Asking and lending -----

export const requests = defineTable({
  path: "requests",
  description: "A student asking to borrow a kind of device, and what the desk did about it.",
  columns: {
    number: column.text({ required: true, unique: true }),
    student_number: column.text({ required: true }),
    student_name: column.text({ required: true }),
    kind: column.text({ required: true }),
    reason: column.text({ required: true }),
    /** Where the student would like to collect it. */
    location: column.text({ required: true }),
    needed_by: column.date(),
    status: column.text({ required: true, default: "pending" }),
    /** The device set aside, once `ready`. */
    device_tag: column.text(),
    decided_at: column.timestamp(),
    decision_note: column.text(),
    /** Who asked: a student themselves, the desk, or the help-desk agent. */
    submitted_via: column.text({ required: true, default: "student" }),
  },
  indexes: [["status"], ["student_number"], ["kind", "status"]],
  policy: {
    rules: [
      { allow: "read", when: { column: "student_number", equals: { attribute: "student_id" } } },
    ],
  },
});

export const loans = defineTable({
  path: "loans",
  description: "A device in a student's hands, from check-out to return.",
  // Where something points to a loan, it is shown by its number.
  display: "number",
  columns: {
    number: column.text({ required: true, unique: true }),
    device_tag: column.text({ required: true }),
    kind: column.text({ required: true }),
    student_number: column.text({ required: true }),
    student_name: column.text({ required: true }),
    request_number: column.text(),
    checked_out_at: column.timestamp({ required: true }),
    due_on: column.date({ required: true }),
    // One of two, which the database holds it to, each with the colour it is drawn on.
    status: column.enum(
      [
        { value: "out", label: "Out", color: "blue" },
        { value: "returned", label: "Returned", color: "green" },
      ],
      { required: true, default: "out" },
    ),
    /** Set each morning for a loan still out after its due date. */
    overdue: column.boolean({ required: true, default: false }),
    returned_at: column.timestamp(),
    return_condition: column.text(),
    return_note: column.text(),
  },
  indexes: [["status"], ["student_number"], ["device_tag"]],
  policy: {
    rules: [
      { allow: "read", when: { column: "student_number", equals: { attribute: "student_id" } } },
    ],
  },
});

// ----- Settings -----

// How long a loan lasts is a variable, loans/days. It is not defined here: it is a file,
// platform/loans/days.variable.yaml, which the console edits too. Code names it by its path.

// ----- What happens -----

export const requestSubmitted = defineEvent({
  path: "requests/submitted",
  description: "A student asked to borrow a device.",
  payload: z.object({ request: z.string(), kind: Kind, student: z.string() }),
});

export const loanOverdue = defineEvent({
  path: "loans/overdue",
  description: "A loan passed its due date without the device coming back.",
  payload: z.object({
    loan: z.string(),
    device: z.string(),
    student: z.string(),
    due_on: z.string(),
  }),
});

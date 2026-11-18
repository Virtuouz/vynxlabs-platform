import { defineScript, type ScriptContext, z } from "@vynxlabs/sdk";
import {
  AUTO_APPROVED,
  Condition,
  devices,
  KINDS,
  Kind,
  Location,
  loanDays,
  loanOverdue,
  loans,
  requestSubmitted,
  requests,
  students,
  TIME_ZONE,
} from "./model.ts";

type Student = NonNullable<typeof students.__row>;
type Device = NonNullable<typeof devices.__row>;
type Request = NonNullable<typeof requests.__row>;
type Loan = NonNullable<typeof loans.__row>;

const OPEN_REQUEST = ["pending", "ready", "waitlisted"];

/** Today's date at the university, `YYYY-MM-DD`. */
export function today(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
}
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** A short number to read out at the desk: `REQ-7KQ2M`. */
const shortNumber = (prefix: string) =>
  `${prefix}-${Date.now().toString(36).slice(-4).toUpperCase()}${Math.floor(Math.random() * 1296)
    .toString(36)
    .toUpperCase()
    .padStart(2, "0")}`;

const studentNumber = z
  .string()
  .regex(/^S\d{7}$/, "A student number is S and seven digits, such as S1002003.")
  .describe("The student's number, such as S1002003.");

/**
 * The student a run is about. A student signed in to the portal is themselves,
 * whatever they pass; the desk and the agent name the student.
 */
async function whoFor(ctx: ScriptContext, named: string | undefined): Promise<Student> {
  const who = ctx.run.startedBy;
  if (who.type === "end_user" && who.id) {
    const [self] = await ctx.table(students).as(who.id).find({ limit: 1 });
    if (!self)
      throw new Error(
        "Your account is not linked to a student record. Ask the Tech Desk to link it.",
      );
    return self;
  }
  if (!named) throw new Error("Say which student this is for: student_number.");
  const [found] = await ctx
    .table(students)
    .find({ filter: { column: "student_number", value: named }, limit: 1 });
  if (!found) throw new Error(`There is no student ${named}.`);
  return found;
}

async function requestCalled(ctx: ScriptContext, number: string): Promise<Request> {
  const [row] = await ctx
    .table(requests)
    .find({ filter: { column: "number", value: number.toUpperCase() }, limit: 1 });
  if (!row) throw new Error(`There is no request ${number}.`);
  return row;
}

async function deviceTagged(ctx: ScriptContext, tag: string): Promise<Device> {
  const [row] = await ctx
    .table(devices)
    .find({ filter: { column: "asset_tag", value: tag.toUpperCase() }, limit: 1 });
  if (!row) throw new Error(`There is no device tagged ${tag}.`);
  return row;
}

/** The free device of a kind to set aside: at the wanted location if one is there. */
async function freeDevice(ctx: ScriptContext, kind: string, location: string) {
  const free = await ctx.table(devices).find({
    filter: {
      and: [
        { column: "kind", value: kind },
        { column: "status", value: "available" },
      ],
    },
    sort: ["asset_tag"],
    limit: 100,
  });
  return free.find((d) => d.location === location) ?? free[0] ?? null;
}

const requestOut = z.object({
  number: z.string(),
  student_number: z.string(),
  student_name: z.string(),
  kind: z.string(),
  status: z.string(),
  location: z.string(),
  device_tag: z.string().nullable(),
  needed_by: z.string().nullable(),
  decision_note: z.string().nullable(),
  created_at: z.string(),
  /** What happens now, in words a person can be told. */
  next_step: z.string(),
});
/** What happens next to a request, for whoever is telling the student. */
function nextStep(r: Request, freeNow?: number): string {
  const place = r.location === "library" ? "the library" : "the Tech Desk";
  switch (r.status) {
    case "pending":
      if ((AUTO_APPROVED as readonly string[]).includes(r.kind))
        return `Approved automatically within a minute; a ${r.kind} is then set aside at ${place}.`;
      return `Waiting for someone on the Tech Desk to approve it; they have three days, or it is denied. Once approved a ${r.kind} is set aside${freeNow === 0 ? `, but none is free right now, so it would join the waitlist and be set aside when one comes back` : freeNow ? ` (${freeNow} free right now)` : ", or it joins the waitlist if none is free"}.`;
    case "ready":
      return `${r.device_tag} is set aside at ${place}. Collect it with a student card.`;
    case "waitlisted":
      return `Approved, and waiting for a ${r.kind} to come back: the first one returned is set aside for the earliest approved request.`;
    case "fulfilled":
      return "Collected. See the student's loans.";
    default:
      return "Closed. Nothing more happens.";
  }
}
const asRequest = (r: Request, freeNow?: number) => ({
  number: r.number,
  student_number: r.student_number,
  student_name: r.student_name,
  kind: r.kind,
  status: r.status,
  location: r.location,
  device_tag: r.device_tag ?? null,
  needed_by: r.needed_by ?? null,
  decision_note: r.decision_note ?? null,
  created_at: r.created_at,
  next_step: nextStep(r, freeNow),
});
const loanOut = z.object({
  number: z.string(),
  device_tag: z.string(),
  kind: z.string(),
  student_number: z.string(),
  student_name: z.string(),
  checked_out_at: z.string(),
  due_on: z.string(),
  status: z.string(),
  /** Still out after its due date, as of today at the university. */
  overdue: z.boolean(),
});
const asLoan = (l: Loan) => ({
  number: l.number,
  device_tag: l.device_tag,
  kind: l.kind,
  student_number: l.student_number,
  student_name: l.student_name,
  checked_out_at: l.checked_out_at,
  due_on: l.due_on,
  status: l.status,
  overdue: l.status === "out" && l.due_on < today(),
});

// ----- Asking -----

export const submitRequest = defineScript({
  path: "requests/submit",
  description:
    "Asks to borrow a kind of device. A student signed in asks for themselves; the desk or an agent names the student. Refused when the student has a hold, or already has that kind out or asked for.",
  input: z.object({
    kind: Kind.describe(`What to borrow: ${KINDS.join(", ")}.`),
    reason: z.string().min(3).max(500).describe("Why, in a sentence: what it is for."),
    location: Location.default("tech-desk").describe("Where to collect it: library or tech-desk."),
    needed_by: z.iso.date().optional().describe("The date it is needed by, YYYY-MM-DD."),
    student_number: studentNumber.optional(),
  }),
  output: requestOut,
  tables: [students, requests, loans, devices],
  events: [requestSubmitted],
  async run(input, ctx) {
    const student = await whoFor(ctx, input.student_number);
    if (student.standing !== "good") {
      throw new Error(
        `${student.name} cannot borrow while their account has a hold${student.hold_reason ? ` (${student.hold_reason.replace(/\.$/, "")})` : ""}. The Tech Desk can lift it.`,
      );
    }
    const asked = await ctx.table(requests).find({
      filter: {
        and: [
          { column: "student_number", value: student.student_number },
          { column: "kind", value: input.kind },
          { column: "status", op: "in", value: OPEN_REQUEST },
        ],
      },
      limit: 1,
    });
    if (asked[0])
      throw new Error(
        `${student.name} already asked for a ${input.kind}: ${asked[0].number}, ${asked[0].status}.`,
      );
    const out = await ctx.table(loans).find({
      filter: {
        and: [
          { column: "student_number", value: student.student_number },
          { column: "kind", value: input.kind },
          { column: "status", value: "out" },
        ],
      },
      limit: 1,
    });
    if (out[0])
      throw new Error(
        `${student.name} already has a ${input.kind} out (${out[0].device_tag}, due ${out[0].due_on}).`,
      );
    if (input.needed_by && input.needed_by < today())
      throw new Error(`${input.needed_by} has passed. Give a date from today on.`);

    const via =
      ctx.run.startedBy.type === "end_user"
        ? "student"
        : ctx.run.startedBy.type === "service_account"
          ? "agent"
          : "desk";
    const row = await ctx.table(requests).insert({
      number: shortNumber("REQ"),
      student_number: student.student_number,
      student_name: student.name,
      kind: input.kind,
      reason: input.reason,
      location: input.location,
      needed_by: input.needed_by ?? null,
      submitted_via: via,
    });
    await ctx.run.tag(
      `request:${row.number.toLowerCase()}`,
      `student:${student.student_number.toLowerCase()}`,
    );
    await ctx.events.publish("requests/submitted", {
      request: row.number,
      kind: input.kind,
      student: student.student_number,
    });
    ctx.log.info("Request submitted", { request: row.number, kind: input.kind, via });
    const free = await ctx.table(devices).find({
      filter: {
        and: [
          { column: "kind", value: input.kind },
          { column: "status", value: "available" },
        ],
      },
      limit: 100,
    });
    return asRequest(row, free.length);
  },
});

export const cancelRequest = defineScript({
  path: "requests/cancel",
  description:
    "Withdraws a request that has not been collected yet. A device set aside for it goes back on the shelf.",
  input: z.object({
    request: z.string().describe("The request's number, such as REQ-7KQ2M."),
    student_number: studentNumber.optional(),
  }),
  output: requestOut,
  tables: [students, requests, devices],
  async run(input, ctx) {
    const student = await whoFor(ctx, input.student_number);
    const request = await requestCalled(ctx, input.request);
    if (request.student_number !== student.student_number)
      throw new Error(`${request.number} is not ${student.name}'s request.`);
    if (!OPEN_REQUEST.includes(request.status))
      throw new Error(`${request.number} is ${request.status} and cannot be cancelled.`);
    if (request.device_tag) {
      const device = await deviceTagged(ctx, request.device_tag);
      if (device.status === "reserved" && device.reserved_for === request.number)
        await ctx.table(devices).update(device.id, { status: "available", reserved_for: null });
    }
    const row = await ctx.table(requests).update(request.id, {
      status: "cancelled",
      decided_at: new Date().toISOString(),
      decision_note: "Withdrawn by the student.",
    });
    return asRequest(row);
  },
});

// ----- Deciding -----

export const decideRequest = defineScript({
  path: "requests/decide",
  description:
    "Approves a pending request, setting a free device aside for it (or putting it on the waitlist when none is free), or denies it.",
  input: z.object({
    request: z.string(),
    decision: z.enum(["approve", "deny"]),
    note: z.string().max(500).optional(),
  }),
  output: requestOut,
  tables: [requests, devices],
  // One decision at a time, so two approvals never set the same device aside.
  concurrency: 1,
  async run(input, ctx) {
    const request = await requestCalled(ctx, input.request);
    if (request.status !== "pending")
      throw new Error(`${request.number} is already ${request.status}.`);
    const now = new Date().toISOString();
    if (input.decision === "deny") {
      return asRequest(
        await ctx.table(requests).update(request.id, {
          status: "denied",
          decided_at: now,
          decision_note: input.note ?? "Not approved by the Tech Desk.",
        }),
      );
    }
    const device = await freeDevice(ctx, request.kind, request.location);
    if (!device) {
      ctx.log.warn("Nothing free: waitlisted", { request: request.number, kind: request.kind });
      return asRequest(
        await ctx.table(requests).update(request.id, {
          status: "waitlisted",
          decided_at: now,
          decision_note:
            input.note ??
            `Approved. No ${request.kind} is free yet: first in line for the next one back.`,
        }),
      );
    }
    await ctx
      .table(devices)
      .update(device.id, { status: "reserved", reserved_for: request.number });
    return asRequest(
      await ctx.table(requests).update(request.id, {
        status: "ready",
        device_tag: device.asset_tag,
        location: device.location,
        decided_at: now,
        decision_note:
          input.note ??
          `Approved. ${device.asset_tag} is waiting at the ${device.location === "library" ? "library" : "Tech Desk"}.`,
      }),
    );
  },
});

// ----- Lending -----

export const checkOut = defineScript({
  path: "loans/check-out",
  description:
    "Hands a device to a student: for a request that is ready, or at the desk with a device tag and a student number.",
  input: z.object({
    request: z.string().optional().describe("A ready request's number."),
    asset_tag: z
      .string()
      .optional()
      .describe("For a walk-up loan: the device's tag, such as LT-0007."),
    student_number: studentNumber.optional(),
    days: z
      .number()
      .int()
      .min(1)
      .max(120)
      .optional()
      .describe("How long. Default: the loans/days variable."),
  }),
  output: loanOut,
  tables: [students, requests, devices, loans],
  variables: [loanDays],
  concurrency: 1,
  async run(input, ctx) {
    let request: Request | null = null;
    let device: Device;
    let student: Student;
    if (input.request) {
      request = await requestCalled(ctx, input.request);
      if (request.status !== "ready" || !request.device_tag)
        throw new Error(`${request.number} is ${request.status}, not ready to collect.`);
      device = await deviceTagged(ctx, request.device_tag);
      student = await whoFor(ctx, request.student_number);
    } else {
      if (!input.asset_tag || !input.student_number)
        throw new Error("Give a ready request, or a device's asset_tag and a student_number.");
      device = await deviceTagged(ctx, input.asset_tag);
      if (device.status !== "available")
        throw new Error(
          `${device.asset_tag} is ${device.status}${device.reserved_for ? ` for ${device.reserved_for}` : ""}.`,
        );
      student = await whoFor(ctx, input.student_number);
    }
    if (student.standing !== "good")
      throw new Error(`${student.name} has a hold: ${student.hold_reason ?? "see their record"}.`);

    const days = input.days ?? Number(await ctx.variable("loans/days"));
    const loan = await ctx.table(loans).insert({
      number: shortNumber("LN"),
      device_tag: device.asset_tag,
      kind: device.kind,
      student_number: student.student_number,
      student_name: student.name,
      request_number: request?.number ?? null,
      checked_out_at: new Date().toISOString(),
      due_on: addDays(today(), days),
    });
    await ctx.table(devices).update(device.id, { status: "checked_out", reserved_for: null });
    if (request) await ctx.table(requests).update(request.id, { status: "fulfilled" });
    await ctx.run.tag(
      `loan:${loan.number.toLowerCase()}`,
      `device:${device.asset_tag.toLowerCase()}`,
    );
    return asLoan(loan);
  },
});

export const checkIn = defineScript({
  path: "loans/check-in",
  description:
    "Takes a device back. A device in good or worn condition goes back on the shelf, or straight to the first student waiting for one; a damaged one goes to maintenance.",
  input: z.object({
    asset_tag: z.string().describe("The device's tag, such as LT-0007."),
    condition: Condition.default("good"),
    note: z.string().max(500).optional(),
  }),
  output: z.object({
    loan: loanOut,
    device_status: z.string(),
    /** The waitlisted request the device was set aside for, if any. */
    now_ready: z.string().nullable(),
  }),
  tables: [requests, devices, loans],
  concurrency: 1,
  async run(input, ctx) {
    const device = await deviceTagged(ctx, input.asset_tag);
    const [loan] = await ctx.table(loans).find({
      filter: {
        and: [
          { column: "device_tag", value: device.asset_tag },
          { column: "status", value: "out" },
        ],
      },
      limit: 1,
    });
    if (!loan) throw new Error(`${device.asset_tag} is not out on loan.`);
    const returned = await ctx.table(loans).update(loan.id, {
      status: "returned",
      overdue: false,
      returned_at: new Date().toISOString(),
      return_condition: input.condition,
      return_note: input.note ?? null,
    });
    if (input.condition === "damaged") {
      await ctx.table(devices).update(device.id, {
        status: "maintenance",
        condition: "damaged",
        notes: input.note ?? null,
      });
      return { loan: asLoan(returned), device_status: "maintenance", now_ready: null };
    }
    const [next] = await ctx.table(requests).find({
      filter: {
        and: [
          { column: "kind", value: device.kind },
          { column: "status", value: "waitlisted" },
        ],
      },
      sort: ["decided_at"],
      limit: 1,
    });
    if (next) {
      await ctx.table(devices).update(device.id, {
        status: "reserved",
        reserved_for: next.number,
        condition: input.condition,
      });
      await ctx.table(requests).update(next.id, {
        status: "ready",
        device_tag: device.asset_tag,
        location: device.location,
        decision_note: `${device.asset_tag} came back and is set aside for you.`,
      });
      return { loan: asLoan(returned), device_status: "reserved", now_ready: next.number };
    }
    await ctx.table(devices).update(device.id, { status: "available", condition: input.condition });
    return { loan: asLoan(returned), device_status: "available", now_ready: null };
  },
});

export const markOverdue = defineScript({
  path: "loans/mark-overdue",
  description: "Marks every loan past its due date as overdue, and says so once for each.",
  input: z.object({}),
  output: z.object({ newly_overdue: z.number(), overdue: z.number() }),
  tables: [loans],
  events: [loanOverdue],
  async run(_input, ctx) {
    const late = await ctx.table(loans).find({
      filter: {
        and: [
          { column: "status", value: "out" },
          { column: "due_on", op: "lt", value: today() },
        ],
      },
      limit: 1000,
    });
    let fresh = 0;
    for (const loan of late) {
      if (loan.overdue) continue;
      await ctx.table(loans).update(loan.id, { overdue: true });
      await ctx.events.publish("loans/overdue", {
        loan: loan.number,
        device: loan.device_tag,
        student: loan.student_number,
        due_on: loan.due_on,
      });
      fresh++;
    }
    ctx.log.info("Overdue loans marked", { newly: fresh, total: late.length });
    return { newly_overdue: fresh, overdue: late.length };
  },
});

// ----- Looking -----

export const availability = defineScript({
  path: "devices/availability",
  description:
    "How many devices of each kind are free to borrow right now, at each location, and how many are out, set aside or in repair.",
  input: z.object({
    kind: Kind.optional().describe("Only this kind."),
    location: Location.optional().describe("Only this location."),
  }),
  output: z.object({
    kinds: z.array(
      z.object({
        kind: z.string(),
        available: z.number(),
        reserved: z.number(),
        checked_out: z.number(),
        maintenance: z.number(),
        available_by_location: z.record(z.string(), z.number()),
        waitlisted: z.number(),
      }),
    ),
  }),
  tables: [devices, requests],
  async run(input, ctx) {
    const conditions = [
      ...(input.kind ? [{ column: "kind", value: input.kind }] : []),
      ...(input.location ? [{ column: "location", value: input.location }] : []),
    ];
    const counted = await ctx.table(devices).aggregate({
      group: ["kind", "status", "location"],
      ...(conditions.length ? { filter: { and: conditions } } : {}),
      limit: 1000,
    });
    const waiting = await ctx.table(requests).aggregate({
      group: ["kind"],
      filter: { column: "status", value: "waitlisted" },
    });
    const kinds = new Map<
      string,
      {
        kind: string;
        available: number;
        reserved: number;
        checked_out: number;
        maintenance: number;
        available_by_location: Record<string, number>;
        waitlisted: number;
      }
    >();
    for (const kind of input.kind ? [input.kind] : KINDS)
      kinds.set(kind, {
        kind,
        available: 0,
        reserved: 0,
        checked_out: 0,
        maintenance: 0,
        available_by_location: {},
        waitlisted: 0,
      });
    for (const { by, values } of counted.items) {
      const entry = kinds.get(String(by.kind));
      if (!entry) continue;
      const n = Number(values.count ?? 0);
      const status = String(by.status);
      if (status === "available") {
        entry.available += n;
        const at = String(by.location);
        entry.available_by_location[at] = (entry.available_by_location[at] ?? 0) + n;
      } else if (status === "reserved" || status === "checked_out" || status === "maintenance")
        entry[status] += n;
    }
    for (const { by, values } of waiting.items) {
      const entry = kinds.get(String(by.kind));
      if (entry) entry.waitlisted = Number(values.count ?? 0);
    }
    return { kinds: [...kinds.values()] };
  },
});

export const deskQueue = defineScript({
  path: "desk/queue",
  description:
    "The Tech Desk's day: requests waiting for a decision, devices set aside waiting to be collected, the waitlist, and loans that are overdue or due today.",
  input: z.object({}),
  output: z.object({
    today: z.string(),
    pending: z.array(requestOut),
    ready: z.array(requestOut),
    waitlisted: z.array(requestOut),
    overdue: z.array(loanOut),
    due_today: z.array(loanOut),
  }),
  tables: [requests, loans],
  async run(_input, ctx) {
    const open = await ctx.table(requests).find({
      filter: { column: "status", op: "in", value: OPEN_REQUEST },
      sort: ["created_at"],
      limit: 500,
    });
    const out = await ctx.table(loans).find({
      filter: { column: "status", value: "out" },
      sort: ["due_on"],
      limit: 1000,
    });
    const day = today();
    const of = (status: string) => open.filter((r) => r.status === status).map((r) => asRequest(r));
    return {
      today: day,
      pending: of("pending"),
      ready: of("ready"),
      waitlisted: of("waitlisted"),
      overdue: out.filter((l) => l.due_on < day).map(asLoan),
      due_today: out.filter((l) => l.due_on === day).map(asLoan),
    };
  },
});

export const lookUpStudent = defineScript({
  path: "students/look-up",
  description:
    "Finds a student by number, name or email, with their standing, what they may ask for now, open requests and loans. A signed-in student always gets themselves. A name can match someone else: confirm the student number with the caller before acting for them.",
  input: z.object({
    query: z.string().min(2).optional().describe("A student number, part of a name, or an email."),
  }),
  output: z.object({
    matches: z.array(
      z.object({
        student_number: z.string(),
        name: z.string(),
        email: z.string(),
        program: z.string().nullable(),
        standing: z.string(),
        hold_reason: z.string().nullable(),
        /** The kinds they may ask for now: none with a hold, and not a kind they have out or asked for. */
        can_request: z.array(z.string()),
        requests: z.array(requestOut),
        loans: z.array(loanOut),
      }),
    ),
  }),
  tables: [students, requests, loans],
  async run(input, ctx) {
    let found: Student[];
    if (ctx.run.startedBy.type === "end_user") found = [await whoFor(ctx, undefined)];
    else {
      if (!input.query) throw new Error("Say who to look for: query.");
      const q = input.query.trim();
      found = await ctx.table(students).find({
        filter: /^S\d{7}$/i.test(q)
          ? { column: "student_number", value: q.toUpperCase() }
          : {
              or: [
                { column: "name", op: "contains", value: q },
                { column: "email", op: "contains", value: q.toLowerCase() },
              ],
            },
        limit: 5,
      });
    }
    const matches = [];
    for (const s of found) {
      const open = await ctx.table(requests).find({
        filter: {
          and: [
            { column: "student_number", value: s.student_number },
            { column: "status", op: "in", value: OPEN_REQUEST },
          ],
        },
        limit: 20,
      });
      const out = await ctx.table(loans).find({
        filter: {
          and: [
            { column: "student_number", value: s.student_number },
            { column: "status", value: "out" },
          ],
        },
        limit: 20,
      });
      matches.push({
        student_number: s.student_number,
        name: s.name,
        email: s.email,
        program: s.program ?? null,
        standing: s.standing,
        hold_reason: s.hold_reason ?? null,
        can_request:
          s.standing === "good"
            ? KINDS.filter((k) => !open.some((r) => r.kind === k) && !out.some((l) => l.kind === k))
            : [],
        requests: open.map((r) => asRequest(r)),
        loans: out.map(asLoan),
      });
    }
    return { matches };
  },
});

export { AUTO_APPROVED };

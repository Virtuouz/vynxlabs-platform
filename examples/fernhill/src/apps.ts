import {
  type DataInput,
  defineApp,
  defineBinding,
  defineInterface,
  defineRole,
  defineTheme,
} from "@volvel/sdk";
import { REASONS } from "./constants.ts";
import { reorder } from "./flows.ts";
import {
  bookAppointment,
  clinicDay,
  findClient,
  freeTimes,
  lowStock,
  setStatus,
  useStock,
} from "./scripts.ts";

/** Money is kept in cents and shown in dollars. */
const DOLLARS = { style: "currency", currency: "USD", minorUnits: true } as const;

// ----- The apps -----

/**
 * The front desk: the day's visits at the person's clinic, checking patients
 * in, booking, and stock. Front-desk staff are end users in their clinic's
 * group; the tables' rules give them that clinic's rows and no other's.
 */
export const frontDesk = defineApp({
  path: "front-desk",
  title: "Front desk",
  description: "Today's visits, check-in, booking and stock, for one clinic.",
  source: "apps/front-desk",
  reads: ["appointments", "pets", "clients", "clinics", "inventory", "registrations", "invoices"],
});

/** For pet owners: their animals, their visits, their invoices, and booking. */
export const petPortal = defineApp({
  path: "pet-portal",
  title: "Fernhill pet portal",
  description: "Your pets, their visits and your invoices.",
  source: "apps/pet-portal",
  reads: ["pets", "appointments", "invoices", "clinics", "clients"],
});

/** The page filters an input of `table` is narrowed by: the clinic, and a date range on `dateColumn`. */
const narrowedBy = (dateFilter: string, dateColumn: string, clinic = true) => [
  ...(clinic ? [{ filter: "clinic", column: "clinic" }] : []),
  { filter: dateFilter, column: dateColumn },
];

/** One value of the invoices, over the page's Issued range. */
const invoiceValue = (
  as: string,
  fn: "sum" | "avg",
  only: { column: string; op: "eq"; value: unknown }[] = [],
) => ({
  source: {
    visual: {
      table: "invoices",
      ...(only.length > 0 ? { filters: only } : {}),
      measures: [{ fn, column: "total", as }],
    },
  },
  filters: narrowedBy("issued", "issued_on"),
});

/** Invoices totalled by one breakdown. */
const invoicesBy = (group: { column: string; bucket?: "week" }): Record<string, DataInput> => ({
  rows: {
    source: {
      visual: {
        table: "invoices",
        groupBy: [group],
        measures: [{ fn: "sum", column: "total", as: "invoiced" }],
      },
    },
    filters: narrowedBy("issued", "issued_on"),
  },
});

/** Visits counted by one breakdown. */
const visitsBy = (column: string): Record<string, DataInput> => ({
  rows: {
    source: {
      visual: {
        table: "appointments",
        groupBy: [{ column }],
        measures: [{ fn: "count", as: "visits" }],
      },
    },
    filters: narrowedBy("when", "starts_at"),
  },
});

/** When a row is clicked, its record opens in a side sheet. */
const openSheet = (page: string) => ({
  rowClick: { steps: [{ do: "open" as const, page, record: "event" as const }] },
});

/** What an invoice shows, in the order the front desk reads it. */
const INVOICE_FIELDS = [
  { column: "clinic" },
  { column: "client_code", label: "Client" },
  { column: "total", label: "Total", format: DOLLARS },
  { column: "issued_on", label: "Issued" },
  { column: "paid_at", label: "Paid on" },
  { column: "payment_ref", label: "Payment reference" },
];

/** The fields of an invoice a form asks for. A column's own rules say what is required. */
const INVOICE_FORM_FIELDS = [
  { column: "client_code", label: "Client" },
  { column: "clinic" },
  { column: "total", label: "Total", format: DOLLARS },
  { column: "status" },
  { column: "issued_on", label: "Issued" },
  { column: "payment_ref", label: "Payment reference" },
];

/** For practice managers, with no code: money, visits and stock across the group. */
export const performance = defineInterface({
  path: "screens/performance",
  title: "Clinic performance",
  description: "Money, visits and stock across the group.",
  pages: [
    {
      id: "money",
      title: "Money",
      filters: [
        {
          name: "clinic",
          label: "Clinic",
          type: "choice",
          from: { table: "invoices", column: "clinic" },
        },
        { name: "issued", label: "Issued", type: "date_range", default: "last_30_days" },
        // The goal is a month's: its own range, so the page's range can be anything.
        { name: "goal_month", label: "Goal month", type: "date_range", default: "this_month" },
      ],
      widgets: [
        {
          id: "note",
          type: "core/text",
          at: { x: 0, y: 0, w: 12, h: 3 },
          config: {
            text: ":::alert[In dollars]{type=info}\nEvery amount here is in dollars, as the clinics invoice. Change **Issued** to look at another stretch of time.\n:::",
          },
        },
        {
          id: "invoiced",
          type: "core/stat",
          title: "Invoiced",
          at: { x: 0, y: 3, w: 3, h: 3 },
          data: { value: invoiceValue("invoiced", "sum") },
          config: { format: DOLLARS, caption: "Issued in the range chosen" },
          on: { click: { steps: [{ do: "rows" }] } },
        },
        {
          id: "unpaid",
          type: "core/stat",
          title: "Unpaid",
          at: { x: 3, y: 3, w: 3, h: 3 },
          data: {
            value: invoiceValue("unpaid", "sum", [{ column: "status", op: "eq", value: "unpaid" }]),
          },
          config: { format: DOLLARS, caption: "Not yet paid" },
          on: { click: { steps: [{ do: "rows" }] } },
        },
        {
          id: "average",
          type: "core/stat",
          title: "Average invoice",
          at: { x: 6, y: 3, w: 3, h: 3 },
          data: { value: invoiceValue("average", "avg") },
          config: { format: DOLLARS },
        },
        {
          id: "goal",
          type: "labs/goal",
          title: "This month",
          at: { x: 9, y: 3, w: 3, h: 3 },
          data: {
            value: {
              source: {
                visual: {
                  table: "invoices",
                  measures: [{ fn: "sum", column: "total", as: "invoiced" }],
                },
              },
              filters: narrowedBy("goal_month", "issued_on"),
            },
          },
          // $200,000, kept in cents like the invoices.
          config: { target: 20000000, format: DOLLARS, label: "of a $200,000 goal" },
        },
        {
          id: "by-week",
          type: "core/chart",
          title: "Invoiced by week",
          at: { x: 0, y: 6, w: 8, h: 8 },
          data: invoicesBy({ column: "issued_on", bucket: "week" }),
          config: { mark: "line", format: DOLLARS },
          on: { pointClick: { steps: [{ do: "rows" }] } },
        },
        {
          id: "by-clinic",
          type: "core/chart",
          title: "By clinic",
          at: { x: 8, y: 6, w: 4, h: 8 },
          data: invoicesBy({ column: "clinic" }),
          config: { mark: "bar", format: DOLLARS },
          on: { pointClick: { steps: [{ do: "narrow", filter: "clinic", from: "clinic" }] } },
        },
        {
          id: "managers",
          type: "core/text",
          at: { x: 0, y: 14, w: 12, h: 3 },
          config: {
            text: ":::alert[For practice managers]{type=info}\nOwners are texted about invoices unpaid for two weeks every Monday morning. Press an invoice to see it, mark it paid, or change it.\n:::",
          },
          rules: { showWhen: [{ user: "in", group: "Practice managers" }] },
        },
        {
          id: "new-invoice",
          type: "core/button",
          at: { x: 9, y: 17, w: 3, h: 1 },
          config: { label: "New invoice", tone: "primary" },
          on: { click: { steps: [{ do: "open", page: "new-invoice" }] } },
        },
        {
          id: "list",
          type: "core/table",
          title: "Invoices",
          at: { x: 0, y: 18, w: 12, h: 10 },
          data: {
            rows: {
              source: {
                visual: { table: "invoices", sort: [{ by: "issued_on", descending: true }] },
              },
              filters: narrowedBy("issued", "issued_on"),
            },
          },
          config: {
            pageSize: 25,
            columns: [
              { column: "number" },
              { column: "clinic" },
              { column: "client_code", label: "Client" },
              { column: "total", label: "Total", format: DOLLARS },
              { column: "status" },
              { column: "issued_on", label: "Issued" },
            ],
          },
          on: openSheet("invoice"),
        },
      ],
    },
    {
      id: "visits",
      title: "Visits",
      filters: [
        {
          name: "clinic",
          label: "Clinic",
          type: "choice",
          from: { table: "appointments", column: "clinic" },
        },
        { name: "when", label: "When", type: "date_range", default: "last_30_days" },
      ],
      widgets: [
        {
          id: "count",
          type: "core/stat",
          title: "Visits",
          at: { x: 0, y: 0, w: 4, h: 3 },
          data: {
            value: {
              source: {
                visual: { table: "appointments", measures: [{ fn: "count", as: "visits" }] },
              },
              filters: narrowedBy("when", "starts_at"),
            },
          },
          config: { caption: "In the range chosen" },
        },
        {
          id: "by-status",
          type: "core/chart",
          title: "How visits ended",
          at: { x: 4, y: 0, w: 4, h: 9 },
          data: visitsBy("status"),
          config: { mark: "pie" },
        },
        {
          id: "by-reason",
          type: "core/chart",
          title: "Why they came",
          at: { x: 8, y: 0, w: 4, h: 9 },
          data: visitsBy("reason"),
          config: { mark: "bar" },
        },
        {
          id: "list",
          type: "core/table",
          title: "Visits",
          at: { x: 0, y: 9, w: 8, h: 12 },
          data: {
            rows: {
              source: {
                visual: { table: "appointments", sort: [{ by: "starts_at", descending: true }] },
              },
              filters: narrowedBy("when", "starts_at"),
            },
          },
          config: {
            pageSize: 25,
            columns: [
              { column: "number" },
              { column: "starts_at", label: "When" },
              { column: "clinic" },
              { column: "pet_name", label: "Pet" },
              { column: "vet" },
              { column: "reason" },
              { column: "status" },
            ],
          },
          on: openSheet("visit"),
        },
        {
          id: "latest",
          type: "core/list",
          title: "Latest visits",
          at: { x: 8, y: 9, w: 4, h: 12 },
          data: {
            rows: {
              source: {
                visual: {
                  table: "appointments",
                  sort: [{ by: "starts_at", descending: true }],
                  limit: 20,
                },
              },
              filters: narrowedBy("when", "starts_at"),
            },
          },
          config: {
            primary: "pet_name",
            secondary: "reason",
            meta: ["starts_at", "clinic"],
            status: "status",
          },
          on: openSheet("visit"),
        },
      ],
    },
    {
      id: "stock",
      title: "Stock",
      filters: [
        {
          name: "clinic",
          label: "Clinic",
          type: "choice",
          from: { table: "inventory", column: "clinic" },
        },
      ],
      widgets: [
        {
          id: "lines",
          type: "core/table",
          title: "Stock",
          at: { x: 0, y: 0, w: 8, h: 14 },
          data: {
            rows: {
              source: { visual: { table: "inventory", sort: [{ by: "on_hand" }] } },
              filters: [{ filter: "clinic", column: "clinic" }],
            },
          },
          config: {
            columns: [
              { column: "clinic" },
              { column: "item" },
              { column: "category" },
              { column: "on_hand", label: "On hand" },
              { column: "reorder_at", label: "Reorder at" },
              { column: "reorder_pending", label: "Ordering" },
            ],
            rowActions: [
              {
                id: "reorder",
                label: "Reorder",
                action: {
                  when: [{ field: "reorder_pending", of: "event", test: "is_not", value: true }],
                  confirm: {
                    title: "Order more?",
                    text: "Order {reorder_qty} more of {item} for {clinic}? An order over the threshold waits for a practice manager.",
                    button: "Order",
                  },
                  steps: [
                    {
                      do: "flow",
                      path: "inventory/reorder",
                      input: {
                        line: { record: "id", of: "event" },
                        clinic: { record: "clinic", of: "event" },
                        sku: { record: "sku", of: "event" },
                        item: { record: "item", of: "event" },
                        on_hand: { record: "on_hand", of: "event" },
                        quantity: { record: "reorder_qty", of: "event" },
                      },
                    },
                    { do: "message", text: "The order is on its way to be priced." },
                  ],
                },
              },
            ],
          },
        },
        {
          id: "orders",
          type: "core/table",
          title: "Orders to VetSupply",
          at: { x: 8, y: 0, w: 4, h: 14 },
          data: {
            rows: {
              source: {
                visual: {
                  table: "purchase_orders",
                  sort: [{ by: "created_at", descending: true }],
                },
              },
              filters: [{ filter: "clinic", column: "clinic" }],
            },
          },
          config: {
            columns: [
              { column: "number" },
              { column: "clinic" },
              { column: "item" },
              { column: "total", label: "Total", format: DOLLARS },
              { column: "status" },
            ],
          },
        },
      ],
    },

    {
      id: "invoice",
      title: "Invoice detail",
      kind: "sheet",
      record: { table: "invoices" },
      widgets: [
        {
          id: "detail",
          type: "core/detail",
          at: { x: 0, y: 0, w: 12, h: 12 },
          data: { record: { source: { record: "this" } } },
          config: {
            heading: "number",
            status: "status",
            fields: INVOICE_FIELDS,
            actions: [
              {
                id: "mark-paid",
                label: "Mark paid",
                tone: "primary",
                action: {
                  when: [{ field: "status", test: "is", value: "unpaid" }],
                  confirm: {
                    title: "Mark as paid?",
                    text: "Mark {number} as paid?",
                    button: "Mark paid",
                  },
                  steps: [
                    {
                      do: "update",
                      record: "this",
                      set: { status: { value: "paid" }, paid_at: { now: true } },
                    },
                    { do: "message", text: "Invoice marked paid", tone: "success" },
                  ],
                },
              },
              {
                id: "edit",
                label: "Edit",
                tone: "default",
                action: { steps: [{ do: "open", page: "edit-invoice", record: "this" }] },
              },
            ],
          },
        },
      ],
    },
    {
      id: "edit-invoice",
      title: "Edit invoice",
      kind: "modal",
      record: { table: "invoices" },
      widgets: [
        {
          id: "form",
          type: "core/form",
          at: { x: 0, y: 0, w: 12, h: 12 },
          data: { record: { source: { record: "this" } } },
          config: {
            mode: "edit",
            fields: INVOICE_FORM_FIELDS,
            submitLabel: "Save",
            submit: {
              steps: [
                // What was typed into each field is saved to this invoice; a field left alone stays.
                {
                  do: "update",
                  record: "this",
                  set: Object.fromEntries(
                    INVOICE_FORM_FIELDS.map((field) => [field.column, { asked: field.column }]),
                  ),
                },
                { do: "close" },
                { do: "message", text: "Invoice saved", tone: "success" },
              ],
            },
          },
        },
      ],
    },
    {
      id: "new-invoice",
      title: "New invoice",
      kind: "modal",
      widgets: [
        {
          id: "form",
          type: "core/form",
          at: { x: 0, y: 0, w: 12, h: 14 },
          data: { record: { source: { visual: { table: "invoices" } } } },
          config: {
            mode: "create",
            fields: [{ column: "number" }, ...INVOICE_FORM_FIELDS],
            submitLabel: "Create invoice",
            submit: {
              steps: [
                // A new invoice, of what was typed into each field.
                {
                  do: "create",
                  table: "invoices",
                  set: Object.fromEntries(
                    ["number", ...INVOICE_FORM_FIELDS.map((field) => field.column)].map(
                      (column) => [column, { asked: column }],
                    ),
                  ),
                },
                { do: "close" },
                { do: "message", text: "Invoice created", tone: "success" },
              ],
            },
          },
        },
      ],
    },
    {
      id: "visit",
      title: "The visit chosen",
      kind: "sheet",
      record: { table: "appointments" },
      widgets: [
        {
          id: "detail",
          type: "core/detail",
          at: { x: 0, y: 0, w: 12, h: 12 },
          data: { record: { source: { record: "this" } } },
          config: {
            heading: "pet_name",
            status: "status",
            fields: [
              { column: "number", label: "Visit" },
              { column: "starts_at", label: "When" },
              { column: "minutes", label: "Booked for" },
              { column: "clinic" },
              { column: "vet" },
              { column: "reason" },
              { column: "client_code", label: "Client" },
              { column: "checked_in_at", label: "Checked in" },
              { column: "notes" },
            ],
          },
        },
      ],
    },
  ],
});

export const performanceApp = defineApp({
  path: "performance",
  title: "Clinic performance",
  description: "Money, visits and stock across the group.",
  interface: "screens/performance",
});

/**
 * For pet owners, with no code: their pets, with a way to ask for a visit, and their
 * invoices. The tables' rules give each owner their own rows. Asking for a visit is
 * an action: it adds one row to `visit_requests`, with the pet's own details, and
 * changes nothing else.
 */
export const myAccount = defineInterface({
  path: "screens/my-account",
  title: "My Fernhill account",
  description: "Your pets, your invoices, and asking for a visit.",
  pages: [
    {
      id: "pets",
      title: "My pets",
      widgets: [
        {
          id: "pets",
          type: "core/table",
          title: "My pets",
          at: { x: 0, y: 0, w: 12, h: 8 },
          data: { rows: { source: { visual: { table: "pets", sort: [{ by: "name" }] } } } },
          config: {
            columns: [
              { column: "name" },
              { column: "species" },
              { column: "breed" },
              { column: "clinic" },
            ],
            rowActions: [
              {
                id: "request",
                label: "Request an appointment",
                action: {
                  confirm: {
                    title: "Request an appointment",
                    text: "Your clinic will call you to settle a time for {name}.",
                    button: "Send request",
                    ask: [
                      {
                        name: "reason",
                        label: "Why is your pet coming in?",
                        type: "choice",
                        required: true,
                        choices: [...REASONS],
                      },
                      { name: "preferred_on", label: "A day that suits you", type: "date" },
                    ],
                  },
                  steps: [
                    {
                      do: "create",
                      table: "visit_requests",
                      set: {
                        client_code: { record: "client_code", of: "event" },
                        pet_name: { record: "name", of: "event" },
                        clinic: { record: "clinic", of: "event" },
                        reason: { asked: "reason" },
                        preferred_on: { asked: "preferred_on" },
                      },
                    },
                    {
                      do: "message",
                      text: "Asked for. Your clinic will call you.",
                      tone: "success",
                    },
                  ],
                },
              },
            ],
          },
        },
        {
          id: "asked",
          type: "core/table",
          title: "Visits you have asked for",
          at: { x: 0, y: 8, w: 12, h: 6 },
          data: {
            rows: {
              source: {
                visual: { table: "visit_requests", sort: [{ by: "created_at", descending: true }] },
              },
            },
          },
          config: {
            columns: [
              { column: "pet_name", label: "Pet" },
              { column: "reason" },
              { column: "preferred_on", label: "Day" },
              { column: "status" },
            ],
          },
        },
      ],
    },
    {
      id: "invoices",
      title: "My invoices",
      widgets: [
        {
          id: "list",
          type: "core/table",
          title: "My invoices",
          at: { x: 0, y: 0, w: 12, h: 12 },
          data: {
            rows: {
              source: {
                visual: { table: "invoices", sort: [{ by: "issued_on", descending: true }] },
              },
            },
          },
          config: {
            columns: [
              { column: "number" },
              { column: "clinic" },
              { column: "total", label: "Total", format: DOLLARS },
              { column: "status" },
              { column: "issued_on", label: "Issued" },
            ],
          },
          on: openSheet("invoice"),
        },
      ],
    },
    {
      id: "invoice",
      title: "Invoice",
      kind: "sheet",
      record: { table: "invoices" },
      widgets: [
        {
          id: "detail",
          type: "core/detail",
          at: { x: 0, y: 0, w: 12, h: 10 },
          data: { record: { source: { record: "this" } } },
          config: {
            heading: "number",
            status: "status",
            fields: [
              { column: "clinic" },
              { column: "total", label: "Total", format: DOLLARS },
              { column: "issued_on", label: "Issued" },
              { column: "paid_at", label: "Paid on" },
            ],
          },
        },
      ],
    },
  ],
});

export const myAccountApp = defineApp({
  path: "my-account",
  title: "My Fernhill account",
  description: "Your pets, your invoices, and asking for a visit.",
  interface: "screens/my-account",
});

/** Fernhill's own colors, for its apps and its portal pages. */
export const theme = defineTheme({
  tokens: {
    action: "#1f6f5c",
    "action-ink": "#ffffff",
    "action-soft": "#e3f1ec",
    "radius-panel": "12px",
  },
  dark: { action: "#6fd1b4", "action-ink": "#062a20", "action-soft": "#173a31" },
});

// ----- Who may do what -----

/** Front-desk staff: read and change rows. The tables' rules keep them to their clinic. */
export const frontDeskData = defineRole({
  path: "roles/front-desk-data",
  name: "front_desk_data",
  description: "Reads and changes rows where the tables' rules allow.",
  permissions: ["data:read", "data:write"],
});
export const opensApp = defineRole({
  path: "roles/opens-app",
  name: "opens_app",
  description: "Opens an app.",
  permissions: ["app:read"],
});
export const runsScript = defineRole({
  path: "roles/runs-script",
  name: "runs_script",
  description: "Starts a script and reads its runs.",
  permissions: ["run:write", "run:read"],
});
export const startsFlow = defineRole({
  path: "roles/starts-flow",
  name: "starts_flow",
  description: "Starts a flow and reads its runs.",
  permissions: ["flow_run:write", "flow_run:read"],
});
export const readsData = defineRole({
  path: "roles/reads-data",
  name: "reads_data",
  description: "Reads rows where the tables' rules allow.",
  permissions: ["data:read"],
});
export const decidesApprovals = defineRole({
  path: "roles/decides-approvals",
  name: "decides_approvals",
  description: "Sees approvals and decides those its holder is an approver of.",
  permissions: ["approval:read", "approval:write"],
});

// The handbook: the pages under platform/docs/handbook, served as a site to the front desk.
export const handbook = defineApp({
  path: "handbook",
  title: "Fernhill handbook",
  description: "How the front desk books, checks in and bills.",
  docs: "handbook",
});

const FRONT_DESK = { type: "end_user_group", key: "front-desk" } as const;
export const frontDeskReadsHandbook = defineBinding({
  path: "access/front-desk-handbook",
  role: opensApp,
  principal: FRONT_DESK,
  resource: handbook,
  description: "The front desk reads the handbook it works from.",
});
export const frontDeskOpens = defineBinding({
  path: "access/front-desk-app",
  role: opensApp,
  principal: FRONT_DESK,
  resource: frontDesk,
});
export const frontDeskRows = defineBinding({
  path: "access/front-desk-rows",
  role: frontDeskData,
  principal: FRONT_DESK,
});
export const frontDeskBooks = defineBinding({
  path: "access/front-desk-book",
  role: runsScript,
  principal: FRONT_DESK,
  resource: bookAppointment,
});
export const frontDeskFreeTimes = defineBinding({
  path: "access/front-desk-free-times",
  role: runsScript,
  principal: FRONT_DESK,
  resource: freeTimes,
});
export const frontDeskMoves = defineBinding({
  path: "access/front-desk-status",
  role: runsScript,
  principal: FRONT_DESK,
  resource: setStatus,
});
export const frontDeskUses = defineBinding({
  path: "access/front-desk-stock",
  role: runsScript,
  principal: FRONT_DESK,
  resource: useStock,
});

/** Every signed-in end user opens the pet portal, reads what the rules give them, and books. */
export const ownersOpen = defineBinding({
  path: "access/owners-portal",
  role: opensApp,
  principal: { type: "end_users" },
  resource: petPortal,
});
/** The no-code account pages open for every signed-in owner, as the portal does. */
export const ownersOpenAccount = defineBinding({
  path: "access/owners-account",
  role: opensApp,
  principal: { type: "end_users" },
  resource: myAccountApp,
});
export const ownersRead = defineBinding({
  path: "access/owners-rows",
  role: readsData,
  principal: { type: "end_users" },
});
/** Owners see which times are free without seeing anyone else's visits. */
export const ownersFreeTimes = defineBinding({
  path: "access/owners-free-times",
  role: runsScript,
  principal: { type: "end_users" },
  resource: freeTimes,
});
export const ownersBook = defineBinding({
  path: "access/owners-book",
  role: runsScript,
  principal: { type: "end_users" },
  resource: bookAppointment,
});

/**
 * The phone assistant: an AI agent connected over MCP with a service account's
 * key. It is given these tools and nothing else.
 */
const AGENT = { type: "service_account", key: "phone-assistant" } as const;
export const agentFinds = defineBinding({
  path: "access/agent-find-client",
  role: runsScript,
  principal: AGENT,
  resource: findClient,
});
export const agentDay = defineBinding({
  path: "access/agent-clinic-day",
  role: runsScript,
  principal: AGENT,
  resource: clinicDay,
});
export const agentStock = defineBinding({
  path: "access/agent-low-stock",
  role: runsScript,
  principal: AGENT,
  resource: lowStock,
});
export const agentFreeTimes = defineBinding({
  path: "access/agent-free-times",
  role: runsScript,
  principal: AGENT,
  resource: freeTimes,
});
export const agentBooks = defineBinding({
  path: "access/agent-book",
  role: runsScript,
  principal: AGENT,
  resource: bookAppointment,
});
export const agentReorders = defineBinding({
  path: "access/agent-reorder",
  role: startsFlow,
  principal: AGENT,
  resource: reorder,
});
/**
 * Connecting over MCP at all needs `workspace:read`: without it every request is
 * refused, whatever tools the account has been bound to.
 */
export const connectsToWorkspace = defineRole({
  path: "roles/connects",
  name: "connects",
  description: "Sees the workspace: what an agent needs to connect over MCP.",
  permissions: ["workspace:read"],
});
export const agentConnects = defineBinding({
  path: "access/agent-connects",
  role: connectsToWorkspace,
  principal: AGENT,
});
/** It may see approvals. The reorder step names who may decide, and the agent is not among them. */
export const agentApprovals = defineBinding({
  path: "access/agent-approvals",
  role: decidesApprovals,
  principal: AGENT,
});
/** Practice managers decide stock orders. */
export const managersDecide = defineBinding({
  path: "access/managers-approvals",
  role: decidesApprovals,
  principal: { type: "group", key: "practice-managers" },
});

import { defineApp, defineBinding, defineInterface, defineRole, defineTheme } from "@volvel/sdk";
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
const invoicesBy = (group: { column: string; bucket?: "week" }) => ({
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
const visitsBy = (column: string) => ({
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
      ],
      widgets: [
        {
          id: "note",
          type: "core/text",
          at: { x: 0, y: 0, w: 12, h: 2 },
          config: {
            text: ":::alert[In dollars]{type=info}\nEvery amount here is in dollars, as the clinics invoice. Change **Issued** to look at another stretch of time.\n:::",
          },
        },
        {
          id: "invoiced",
          type: "core/stat",
          title: "Invoiced",
          at: { x: 0, y: 2, w: 3, h: 3 },
          data: { value: invoiceValue("invoiced", "sum") },
          config: { format: DOLLARS, caption: "Issued in the range chosen" },
        },
        {
          id: "unpaid",
          type: "core/stat",
          title: "Unpaid",
          at: { x: 3, y: 2, w: 3, h: 3 },
          data: {
            value: invoiceValue("unpaid", "sum", [{ column: "status", op: "eq", value: "unpaid" }]),
          },
          config: { format: DOLLARS, caption: "Not yet paid" },
        },
        {
          id: "average",
          type: "core/stat",
          title: "Average invoice",
          at: { x: 6, y: 2, w: 3, h: 3 },
          data: { value: invoiceValue("average", "avg") },
          config: { format: DOLLARS },
        },
        {
          id: "goal",
          type: "labs/goal",
          title: "Invoiced this month",
          at: { x: 9, y: 2, w: 3, h: 3 },
          data: { value: invoiceValue("invoiced", "sum") },
          // $60,000, kept in cents like the invoices.
          config: { target: 6000000, format: DOLLARS, label: "Invoiced this month" },
        },
        {
          id: "by-week",
          type: "core/chart",
          title: "Invoiced by week",
          at: { x: 0, y: 5, w: 8, h: 8 },
          data: invoicesBy({ column: "issued_on", bucket: "week" }),
          config: { mark: "line", format: DOLLARS },
        },
        {
          id: "by-clinic",
          type: "core/chart",
          title: "By clinic",
          at: { x: 8, y: 5, w: 4, h: 8 },
          data: invoicesBy({ column: "clinic" }),
          config: { mark: "bar", format: DOLLARS },
        },
        {
          id: "list",
          type: "core/table",
          title: "Invoices",
          at: { x: 0, y: 13, w: 12, h: 10 },
          data: {
            rows: {
              source: { visual: { table: "invoices", sort: [{ by: "issued_on", descending: true }] } },
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
                visual: { table: "purchase_orders", sort: [{ by: "created_at", descending: true }] },
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
  ],
});

export const performanceApp = defineApp({
  path: "performance",
  title: "Clinic performance",
  description: "Money, visits and stock across the group.",
  interface: "screens/performance",
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

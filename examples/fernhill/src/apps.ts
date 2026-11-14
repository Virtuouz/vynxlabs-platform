import { defineApp, defineBinding, defineInterface, defineRole, defineTheme } from "@vynxlabs/sdk";
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
        { id: "clinic", label: "Clinic", column: "clinic", type: "value" },
        { id: "issued", label: "Issued", column: "issued_on", type: "date" },
      ],
      widgets: [
        {
          id: "invoiced",
          type: "figure",
          title: "Invoiced",
          table: "invoices",
          summary: { groupBy: [], aggregates: [{ fn: "sum", column: "total", as: "invoiced" }] },
          options: { format: DOLLARS },
          at: { x: 0, y: 0, w: 4, h: 3 },
        },
        {
          id: "unpaid",
          type: "figure",
          title: "Unpaid",
          table: "invoices",
          filter: { column: "status", value: "unpaid" },
          summary: { groupBy: [], aggregates: [{ fn: "sum", column: "total", as: "unpaid" }] },
          options: { format: DOLLARS },
          at: { x: 4, y: 0, w: 4, h: 3 },
        },
        {
          id: "average",
          type: "figure",
          title: "Average invoice",
          table: "invoices",
          summary: { groupBy: [], aggregates: [{ fn: "avg", column: "total", as: "average" }] },
          options: { format: DOLLARS },
          at: { x: 8, y: 0, w: 4, h: 3 },
        },
        {
          id: "by-week",
          type: "chart",
          title: "Invoiced by week",
          table: "invoices",
          summary: {
            groupBy: [{ column: "issued_on", bucket: "week" }],
            aggregates: [{ fn: "sum", column: "total", as: "invoiced" }],
          },
          options: { mark: "line", x: "issued_on", y: "invoiced", format: DOLLARS },
          at: { x: 0, y: 3, w: 8, h: 8 },
        },
        {
          id: "by-clinic",
          type: "chart",
          title: "By clinic",
          table: "invoices",
          summary: {
            groupBy: [{ column: "clinic" }],
            aggregates: [{ fn: "sum", column: "total", as: "invoiced" }],
          },
          options: { mark: "bar", x: "clinic", y: "invoiced", format: DOLLARS },
          at: { x: 8, y: 3, w: 4, h: 8 },
        },
        {
          id: "list",
          type: "table",
          title: "Invoices",
          table: "invoices",
          fields: [
            { column: "number" },
            { column: "clinic" },
            { column: "client_code", label: "Client" },
            { column: "total", label: "Total", format: DOLLARS },
            { column: "status" },
            { column: "issued_on", label: "Issued" },
          ],
          sort: [{ column: "issued_on", desc: true }],
          pageSize: 25,
          at: { x: 0, y: 11, w: 12, h: 10 },
        },
      ],
    },
    {
      id: "visits",
      title: "Visits",
      filters: [
        { id: "clinic", label: "Clinic", column: "clinic", type: "value" },
        { id: "when", label: "When", column: "starts_at", type: "date" },
      ],
      widgets: [
        {
          id: "count",
          type: "figure",
          title: "Visits",
          table: "appointments",
          summary: { groupBy: [], aggregates: [{ fn: "count", as: "visits" }] },
          at: { x: 0, y: 0, w: 4, h: 3 },
        },
        {
          id: "by-status",
          type: "chart",
          title: "How visits ended",
          table: "appointments",
          summary: { groupBy: [{ column: "status" }], aggregates: [{ fn: "count", as: "visits" }] },
          options: { mark: "pie", x: "status", y: "visits" },
          at: { x: 4, y: 0, w: 4, h: 9 },
        },
        {
          id: "by-reason",
          type: "chart",
          title: "Why they came",
          table: "appointments",
          summary: { groupBy: [{ column: "reason" }], aggregates: [{ fn: "count", as: "visits" }] },
          options: { mark: "bar", x: "reason", y: "visits" },
          at: { x: 8, y: 0, w: 4, h: 9 },
        },
        {
          id: "list",
          type: "table",
          title: "Visits",
          table: "appointments",
          fields: [
            { column: "number" },
            { column: "starts_at", label: "When" },
            { column: "clinic" },
            { column: "pet", label: "Pet", show: "name" },
            { column: "vet" },
            { column: "reason" },
            { column: "status", editable: true },
          ],
          sort: [{ column: "starts_at", desc: true }],
          pageSize: 25,
          at: { x: 0, y: 9, w: 8, h: 12 },
        },
        {
          id: "chosen",
          type: "card",
          title: "The visit chosen",
          table: "appointments",
          link: { from: "list", type: "same" },
          at: { x: 8, y: 9, w: 4, h: 12 },
        },
      ],
    },
    {
      id: "stock",
      title: "Stock",
      filters: [{ id: "clinic", label: "Clinic", column: "clinic", type: "value" }],
      widgets: [
        {
          id: "lines",
          type: "table",
          title: "Stock",
          table: "inventory",
          fields: [
            { column: "clinic" },
            { column: "item" },
            { column: "category" },
            { column: "on_hand", label: "On hand", editable: true },
            { column: "reorder_at", label: "Reorder at", editable: true },
            { column: "reorder_pending", label: "Ordering" },
          ],
          sort: [{ column: "on_hand" }],
          at: { x: 0, y: 0, w: 8, h: 14 },
        },
        {
          id: "orders",
          type: "table",
          title: "Orders to VetSupply",
          table: "purchase_orders",
          fields: [
            { column: "number" },
            { column: "clinic" },
            { column: "item" },
            { column: "total", label: "Total", format: DOLLARS },
            { column: "status" },
          ],
          sort: [{ column: "created_at", desc: true }],
          at: { x: 8, y: 0, w: 4, h: 14 },
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

const FRONT_DESK = { type: "end_user_group", name: "Front desk" } as const;
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
const AGENT = { type: "service_account", name: "phone-assistant" } as const;
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
  principal: { type: "group", name: "Practice managers" },
});

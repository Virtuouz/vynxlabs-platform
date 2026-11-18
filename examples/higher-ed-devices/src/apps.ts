import { defineApp, defineBinding, defineInterface, defineRole, defineTheme } from "@vynxlabs/sdk";
import { review } from "./flows.ts";
import {
  availability,
  cancelRequest,
  checkIn,
  checkOut,
  deskQueue,
  lookUpStudent,
  submitRequest,
} from "./scripts.ts";

// ----- The Tech Desk's screens, with no code -----

const OPEN = { column: "status", op: "in", value: ["pending", "ready", "waitlisted"] };

export const deskScreens = defineInterface({
  path: "screens/desk",
  title: "Device desk",
  description: "Requests to hand out, loans to take back, and the shelf.",
  pages: [
    {
      id: "queue",
      title: "Queue",
      filters: [{ id: "kind", label: "Kind", column: "kind", type: "value" }],
      widgets: [
        {
          id: "pending",
          type: "figure",
          title: "Waiting for a decision",
          table: "requests",
          filter: { column: "status", value: "pending" },
          summary: { groupBy: [], aggregates: [{ fn: "count", as: "requests" }] },
          at: { x: 0, y: 0, w: 3, h: 3 },
        },
        {
          id: "ready",
          type: "figure",
          title: "Ready to collect",
          table: "requests",
          filter: { column: "status", value: "ready" },
          summary: { groupBy: [], aggregates: [{ fn: "count", as: "requests" }] },
          at: { x: 3, y: 0, w: 3, h: 3 },
        },
        {
          id: "waitlisted",
          type: "figure",
          title: "Waitlisted",
          table: "requests",
          filter: { column: "status", value: "waitlisted" },
          summary: { groupBy: [], aggregates: [{ fn: "count", as: "requests" }] },
          at: { x: 6, y: 0, w: 3, h: 3 },
        },
        {
          id: "overdue",
          type: "figure",
          title: "Overdue loans",
          table: "loans",
          filter: {
            and: [
              { column: "status", value: "out" },
              { column: "overdue", value: true },
            ],
          },
          summary: { groupBy: [], aggregates: [{ fn: "count", as: "loans" }] },
          at: { x: 9, y: 0, w: 3, h: 3 },
        },
        {
          id: "open",
          type: "table",
          title: "Open requests",
          table: "requests",
          filter: OPEN,
          fields: [
            { column: "number" },
            { column: "student_name", label: "Student" },
            { column: "student_number", label: "Number" },
            { column: "kind" },
            { column: "status" },
            { column: "device_tag", label: "Device" },
            { column: "location" },
            { column: "needed_by", label: "Needed by" },
          ],
          sort: [{ column: "created_at" }],
          pageSize: 25,
          actions: [
            {
              label: "Check out",
              target: { kind: "script", path: "loans/check-out" },
              input: { request: "row.number" },
              confirm: "Hand {{row.device_tag}} to {{row.student_name}}?",
              result: { show: "output", refresh: ["open", "ready", "out"] },
              enabledWhen: "row.device_tag",
            },
          ],
          at: { x: 0, y: 3, w: 12, h: 9 },
        },
        {
          id: "out",
          type: "table",
          title: "On loan",
          table: "loans",
          filter: { column: "status", value: "out" },
          fields: [
            { column: "number" },
            { column: "device_tag", label: "Device" },
            { column: "kind" },
            { column: "student_name", label: "Student" },
            { column: "due_on", label: "Due" },
            { column: "overdue" },
          ],
          sort: [{ column: "due_on" }],
          pageSize: 25,
          actions: [
            {
              label: "Check in",
              target: { kind: "script", path: "loans/check-in" },
              input: { asset_tag: "row.device_tag" },
              result: { show: "output", refresh: ["out", "overdue", "open"] },
            },
          ],
          at: { x: 0, y: 12, w: 12, h: 9 },
        },
      ],
    },
    {
      id: "shelf",
      title: "Shelf",
      filters: [
        { id: "kind", label: "Kind", column: "kind", type: "value" },
        { id: "location", label: "Location", column: "location", type: "value" },
      ],
      widgets: [
        {
          id: "by-kind",
          type: "chart",
          title: "Devices by kind and state",
          table: "devices",
          summary: {
            groupBy: [{ column: "kind" }, { column: "status" }],
            aggregates: [{ fn: "count", as: "devices" }],
          },
          options: { mark: "bar", x: "kind", y: "devices", series: "status" },
          at: { x: 0, y: 0, w: 12, h: 8 },
        },
        {
          id: "devices",
          type: "table",
          title: "Devices",
          table: "devices",
          fields: [
            { column: "asset_tag", label: "Tag" },
            { column: "kind" },
            { column: "model" },
            { column: "location", editable: true },
            { column: "status", editable: true },
            { column: "condition", editable: true },
            { column: "reserved_for", label: "Set aside for" },
            { column: "notes", editable: true },
          ],
          sort: [{ column: "asset_tag" }],
          pageSize: 50,
          options: { allowAdd: true },
          at: { x: 0, y: 8, w: 12, h: 12 },
        },
      ],
    },
  ],
});

export const desk = defineApp({
  path: "desk",
  title: "Device desk",
  description: "The Tech Desk's queue, loans and shelf.",
  interface: "screens/desk",
});

// ----- What students see -----

export const studentScreens = defineInterface({
  path: "screens/borrow",
  title: "Borrow a device",
  description: "Ask for a laptop, hotspot or calculator, and see what you have out.",
  pages: [
    {
      id: "mine",
      title: "My devices",
      widgets: [
        {
          id: "intro",
          type: "text",
          options: {
            text: "Ask for a device and the Tech Desk will set one aside for you. Calculators and chargers are approved at once. Bring your student card when you collect it.",
          },
          at: { x: 0, y: 0, w: 8, h: 2 },
        },
        {
          id: "ask",
          type: "action",
          action: {
            label: "Ask for a device",
            target: { kind: "script", path: "requests/submit" },
            result: { show: "toast", refresh: ["requests"] },
          },
          at: { x: 8, y: 0, w: 4, h: 2 },
        },
        {
          id: "requests",
          type: "table",
          title: "My requests",
          table: "requests",
          fields: [
            { column: "number" },
            { column: "kind" },
            { column: "status" },
            { column: "device_tag", label: "Device" },
            { column: "location", label: "Collect from" },
            { column: "decision_note", label: "Note" },
          ],
          sort: [{ column: "created_at", desc: true }],
          pageSize: 10,
          actions: [
            {
              label: "Cancel",
              target: { kind: "script", path: "requests/cancel" },
              input: { request: "row.number" },
              confirm: "Withdraw {{row.number}}?",
              result: { refresh: ["requests"] },
            },
          ],
          at: { x: 0, y: 2, w: 12, h: 7 },
        },
        {
          id: "loans",
          type: "table",
          title: "On loan to me",
          table: "loans",
          filter: { column: "status", value: "out" },
          fields: [
            { column: "device_tag", label: "Device" },
            { column: "kind" },
            { column: "due_on", label: "Due back" },
            { column: "overdue" },
          ],
          sort: [{ column: "due_on" }],
          pageSize: 10,
          at: { x: 0, y: 9, w: 12, h: 5 },
        },
        {
          id: "free",
          type: "chart",
          title: "Free to borrow now",
          table: "devices",
          filter: { column: "status", value: "available" },
          summary: { groupBy: [{ column: "kind" }], aggregates: [{ fn: "count", as: "free" }] },
          options: { mark: "bar", x: "kind", y: "free" },
          at: { x: 0, y: 14, w: 12, h: 7 },
        },
      ],
    },
  ],
});

export const borrow = defineApp({
  path: "borrow",
  title: "Borrow a device",
  description: "For students: ask for a device and see your loans.",
  interface: "screens/borrow",
});

export const theme = defineTheme({
  tokens: { action: "#1d4f91", "action-ink": "#ffffff", "action-soft": "#e4ecf7" },
  dark: { action: "#8db4ea", "action-ink": "#0b1f3a", "action-soft": "#1a2c45" },
});

// ----- Who may do what -----

export const opensApp = defineRole({
  path: "roles/opens-app",
  name: "opens_app",
  description: "Opens an app.",
  permissions: ["app:read"],
});
export const readsData = defineRole({
  path: "roles/reads-data",
  name: "reads_data",
  description: "Reads rows where the tables' rules allow.",
  permissions: ["data:read"],
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
export const connects = defineRole({
  path: "roles/connects",
  name: "connects",
  description: "Sees the workspace: what an agent needs to connect over MCP.",
  permissions: ["workspace:read"],
});
export const decidesApprovals = defineRole({
  path: "roles/decides-approvals",
  name: "decides_approvals",
  description: "Sees approvals and decides those its holder is an approver of.",
  permissions: ["approval:read", "approval:write"],
});

const STUDENTS = { type: "end_users" } as const;
export const studentsOpen = defineBinding({
  path: "access/students-app",
  role: opensApp,
  principal: STUDENTS,
  resource: borrow,
});
export const studentsRead = defineBinding({
  path: "access/students-rows",
  role: readsData,
  principal: STUDENTS,
});
export const studentsAsk = defineBinding({
  path: "access/students-submit",
  role: runsScript,
  principal: STUDENTS,
  resource: submitRequest,
});
export const studentsCancel = defineBinding({
  path: "access/students-cancel",
  role: runsScript,
  principal: STUDENTS,
  resource: cancelRequest,
});

/** The Tech Desk decides requests. */
export const deskDecides = defineBinding({
  path: "access/desk-approvals",
  role: decidesApprovals,
  principal: { type: "group", key: "tech-desk" },
});

/**
 * The help-desk assistant: an AI agent on the IT help line, connected over MCP
 * with a service account's key. It answers students' questions, looks them up,
 * and files or withdraws requests for them. It does not hand out devices or
 * decide requests.
 */
const AGENT = { type: "service_account", key: "helpdesk-assistant" } as const;
export const agentConnects = defineBinding({
  path: "access/agent-connects",
  role: connects,
  principal: AGENT,
});
export const agentAvailability = defineBinding({
  path: "access/agent-availability",
  role: runsScript,
  principal: AGENT,
  resource: availability,
});
export const agentLookUp = defineBinding({
  path: "access/agent-look-up",
  role: runsScript,
  principal: AGENT,
  resource: lookUpStudent,
});
export const agentQueue = defineBinding({
  path: "access/agent-queue",
  role: runsScript,
  principal: AGENT,
  resource: deskQueue,
});
export const agentSubmits = defineBinding({
  path: "access/agent-submit",
  role: runsScript,
  principal: AGENT,
  resource: submitRequest,
});
export const agentCancels = defineBinding({
  path: "access/agent-cancel",
  role: runsScript,
  principal: AGENT,
  resource: cancelRequest,
});
/** It may see what waits for the desk, but the review step names the Tech Desk alone as approvers. */
export const agentApprovals = defineBinding({
  path: "access/agent-approvals",
  role: decidesApprovals,
  principal: AGENT,
});

export { checkIn, checkOut, review };

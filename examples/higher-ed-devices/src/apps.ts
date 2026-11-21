import { defineBinding, defineRole } from "@volvel/sdk";
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

// The two apps, their screens and the theme are not defined here. They have no code, so
// they are files under platform/, which the console edits as well as you do:
//   platform/desk.app.yaml, platform/screens/desk.interface.yaml
//   platform/borrow.app.yaml, platform/screens/borrow.interface.yaml
//   platform/theme.theme.yaml
// What is below names them by path.

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
  resource: "borrow",
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

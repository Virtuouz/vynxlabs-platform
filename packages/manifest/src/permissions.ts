/**
 * Every permission the platform checks, in one place.
 *
 * A permission is `kind:verb`. A role lists permissions and may use `*` for
 * either half. Routes name the permission they need, and a test fails when a
 * route names one that is not listed here, so this list is what an interface
 * can offer when someone builds a role.
 */

export type PermissionVerb = "read" | "write";

/** Where a permission can be granted. A wider binding reaches the narrower places too. */
export type PermissionScope = "instance" | "tenant" | "workspace";

export interface PermissionKind {
  kind: string;
  /** A short name for people: "Secrets". */
  label: string;
  /** What each verb allows, in a sentence. A verb that is missing is not checked anywhere. */
  verbs: Partial<Record<PermissionVerb, string>>;
  /** The narrowest place the permission is checked at. */
  scope: PermissionScope;
  /** Groups the list for display. */
  group: "Instance" | "Tenant" | "Workspace" | "Code and runs" | "Flows" | "Data" | "Apps";
  /** Whether an end user, or a member signed in to apps only, can hold it. */
  appFacing?: true;
}

export const PERMISSION_KINDS: readonly PermissionKind[] = [
  {
    kind: "instance",
    label: "Instance",
    group: "Instance",
    scope: "instance",
    verbs: {
      read: "See the instance's settings, database locations and metrics.",
      write: "Change the instance's settings and import tenants.",
    },
  },
  {
    kind: "tenant",
    label: "Tenants",
    group: "Instance",
    scope: "tenant",
    verbs: {
      read: "See a tenant's name and settings.",
      write: "Create, rename and delete tenants.",
    },
  },
  {
    kind: "access_grant",
    label: "Operator access",
    group: "Instance",
    scope: "tenant",
    verbs: {
      read: "See which operators have opened access to a tenant.",
      write: "Open and end an operator's access to a tenant.",
    },
  },
  {
    kind: "export",
    label: "Tenant export",
    group: "Tenant",
    scope: "tenant",
    verbs: { write: "Export the whole tenant as one file, secrets included in encrypted form." },
  },
  {
    kind: "member",
    label: "Members",
    group: "Tenant",
    scope: "tenant",
    verbs: { read: "See who the members are.", write: "Add and remove members." },
  },
  {
    kind: "group",
    label: "Groups",
    group: "Tenant",
    scope: "tenant",
    verbs: {
      read: "See groups and who is in them.",
      write: "Create groups and change who is in them.",
    },
  },
  {
    kind: "service_account",
    label: "Service accounts",
    group: "Tenant",
    scope: "tenant",
    verbs: {
      read: "See service accounts.",
      write: "Create service accounts and their API keys.",
    },
  },
  {
    kind: "role",
    label: "Roles",
    group: "Tenant",
    scope: "tenant",
    verbs: { read: "See roles and what they allow.", write: "Create, change and delete roles." },
  },
  {
    kind: "binding",
    label: "Access",
    group: "Tenant",
    scope: "tenant",
    verbs: { read: "See who holds which role.", write: "Give and take away roles." },
  },
  {
    kind: "audit",
    label: "Audit log",
    group: "Tenant",
    scope: "tenant",
    verbs: { read: "Read the audit log." },
  },
  {
    kind: "end_user",
    label: "End users",
    group: "Tenant",
    scope: "tenant",
    verbs: {
      read: "See the people who sign in to the tenant's apps.",
      write: "Invite, disable and delete end users.",
    },
  },
  {
    kind: "portal",
    label: "Branding and portal",
    group: "Tenant",
    scope: "tenant",
    verbs: {
      read: "See the portal's settings and branding.",
      write: "Change branding, the logo and whether people may sign up.",
    },
  },
  {
    kind: "domain",
    label: "Hostnames",
    group: "Tenant",
    scope: "tenant",
    verbs: { read: "See the tenant's hostnames.", write: "Register, verify and remove hostnames." },
  },
  {
    kind: "worker",
    label: "Workers",
    group: "Tenant",
    scope: "tenant",
    verbs: {
      read: "See the workers that are connected.",
      write: "Create worker credentials and turn managed workers on or off.",
    },
  },
  {
    kind: "workspace",
    label: "Workspaces",
    group: "Workspace",
    scope: "workspace",
    verbs: {
      read: "See a workspace.",
      write: "Create, clone, pause and delete workspaces.",
    },
  },
  {
    kind: "resource",
    label: "Resources",
    group: "Workspace",
    scope: "workspace",
    verbs: {
      read: "See every resource and its definition.",
      write: "Create and change resources managed in the console.",
    },
  },
  {
    kind: "secret",
    label: "Secrets",
    group: "Workspace",
    scope: "workspace",
    verbs: {
      read: "See the names of secrets, never their values.",
      write: "Set and delete secrets.",
    },
  },
  {
    kind: "variable",
    label: "Variables",
    group: "Workspace",
    scope: "workspace",
    verbs: { read: "See variables and their values.", write: "Set and clear variable values." },
  },
  {
    kind: "connection",
    label: "Connections",
    group: "Workspace",
    scope: "workspace",
    verbs: {
      read: "See connections and whether they are set up.",
      write: "Set up a connection with its credential, and remove it.",
    },
  },
  {
    kind: "bundle",
    label: "Bundles",
    group: "Code and runs",
    scope: "workspace",
    verbs: { read: "See uploaded bundles.", write: "Upload a bundle." },
  },
  {
    kind: "deployment",
    label: "Deployments",
    group: "Code and runs",
    scope: "workspace",
    verbs: {
      read: "See what was deployed and when.",
      write: "Activate a bundle, roll back, and promote to production.",
    },
  },
  {
    kind: "script",
    label: "Scripts",
    group: "Code and runs",
    scope: "workspace",
    appFacing: true,
    verbs: { read: "See scripts and what they take as input." },
  },
  {
    kind: "run",
    label: "Runs",
    group: "Code and runs",
    scope: "workspace",
    appFacing: true,
    verbs: {
      read: "See runs with their input, output and log.",
      write: "Start a script and cancel a run.",
    },
  },
  {
    kind: "trigger",
    label: "Triggers",
    group: "Code and runs",
    scope: "workspace",
    verbs: {
      read: "See schedules, webhooks and event triggers.",
      write: "See a webhook's address, which is a credential.",
    },
  },
  {
    kind: "flow",
    label: "Flows",
    group: "Flows",
    scope: "workspace",
    verbs: { read: "See flows and their graphs.", write: "Arrange a flow's graph." },
  },
  {
    kind: "flow_run",
    label: "Flow runs",
    group: "Flows",
    scope: "workspace",
    verbs: { read: "See flow runs and their steps.", write: "Start and cancel a flow." },
  },
  {
    kind: "approval",
    label: "Approvals",
    group: "Flows",
    scope: "workspace",
    verbs: { read: "See what is waiting for approval.", write: "Approve and reject." },
  },
  {
    kind: "event",
    label: "Events",
    group: "Flows",
    scope: "workspace",
    verbs: { read: "See the events that were published.", write: "Publish an event." },
  },
  {
    kind: "table",
    label: "Tables",
    group: "Data",
    scope: "workspace",
    appFacing: true,
    verbs: {
      read: "See tables and their columns.",
      write: "Delete retired columns and tables for good.",
    },
  },
  {
    kind: "data",
    label: "Rows",
    group: "Data",
    scope: "workspace",
    appFacing: true,
    verbs: {
      read: "Read rows, held to each table's row policy.",
      write: "Add, change and delete rows, held to each table's row policy.",
    },
  },
  {
    kind: "data_all",
    label: "Rows, past the row policy",
    group: "Data",
    scope: "workspace",
    appFacing: true,
    verbs: {
      read: "Read every row, whatever the table's row policy says.",
      write: "Change every row, whatever the table's row policy says.",
    },
  },
  {
    kind: "data_source",
    label: "Data sources",
    group: "Data",
    scope: "workspace",
    verbs: {
      read: "See external data sources and browse their tables.",
      write: "Set up a data source with its credential, and change its rows.",
    },
  },
  {
    kind: "file",
    label: "Files",
    group: "Data",
    scope: "workspace",
    appFacing: true,
    verbs: { read: "Download files.", write: "Upload files." },
  },
  {
    kind: "app",
    label: "Apps",
    group: "Apps",
    scope: "workspace",
    appFacing: true,
    verbs: { read: "Open apps." },
  },
  {
    kind: "theme",
    label: "Themes",
    group: "Apps",
    scope: "workspace",
    appFacing: true,
    verbs: { read: "Reserved. A workspace's theme is public today." },
  },
];

const BY_KIND = new Map(PERMISSION_KINDS.map((entry) => [entry.kind, entry]));

/** Whether `kind:verb` is a permission some route checks. Wildcards are not: they are for roles. */
export function isKnownPermission(permission: string): boolean {
  const [kind, verb] = permission.split(":");
  const entry = BY_KIND.get(kind ?? "");
  return entry !== undefined && verb !== undefined && verb in entry.verbs;
}

/** Whether a role may list `permission`: a known one, or one with `*` for a known kind or for all. */
export function isGrantablePermission(permission: string): boolean {
  const [kind, verb] = permission.split(":");
  if (kind === undefined || verb === undefined) return false;
  if (kind === "*") return verb === "*" || verb === "read" || verb === "write";
  const entry = BY_KIND.get(kind);
  if (!entry) return false;
  return verb === "*" || verb in entry.verbs;
}

/** The kinds an end user, or a member signed in to apps only, can hold. */
export const APP_FACING_KINDS: readonly string[] = PERMISSION_KINDS.filter(
  (entry) => entry.appFacing,
).map((entry) => entry.kind);

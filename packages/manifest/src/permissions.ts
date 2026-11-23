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
  /**
   * Given only by its own name. `*:*`, `*:write` and the like do not give it,
   * so no role holds it until someone writes it into one: not the tenant's
   * administrator, and not a role made before the permission existed.
   */
  explicit?: true;
}

export const PERMISSION_KINDS: readonly PermissionKind[] = [
  {
    kind: "instance",
    label: "Instance",
    group: "Instance",
    scope: "instance",
    verbs: {
      read: "See the instance's settings, database locations and metrics.",
      write: "Change the instance's settings.",
    },
  },
  {
    kind: "tenant",
    label: "Tenants",
    group: "Instance",
    scope: "tenant",
    verbs: {
      read: "See a tenant's name and settings.",
      write: "Create, rename, import and delete tenants.",
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
    kind: "access",
    label: "Access releases",
    group: "Tenant",
    scope: "tenant",
    verbs: {
      read: "See how the tenant's access was released, and what a release would change.",
      write:
        "Release the tenant's access from its repository, go back to an earlier release, and approve one that waits.",
    },
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
    kind: "end_user_group",
    label: "Groups of end users",
    group: "Tenant",
    scope: "tenant",
    verbs: {
      read: "See groups of end users and who is in them.",
      write: "Create groups of end users and change who is in them.",
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
      write: "Create and revoke worker credentials, and make and remove worker pools.",
    },
  },
  {
    kind: "sso",
    label: "Single sign-on",
    group: "Tenant",
    scope: "tenant",
    verbs: {
      read: "See the tenant's identity providers, their domains and who is linked to them.",
      write:
        "Connect and change identity providers, prove domains, map groups, and require single sign-on.",
    },
  },
  {
    kind: "git",
    label: "Repository",
    group: "Tenant",
    scope: "workspace",
    verbs: {
      read: "See the tenant's repository and how each workspace stands against its branch.",
      write: "Connect the repository, choose a workspace's branch, and push to it.",
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
    kind: "workspace_production",
    label: "Deleting production",
    group: "Workspace",
    scope: "workspace",
    explicit: true,
    verbs: {
      write:
        "Delete a production workspace, with everything in it. No role has this until it is added to one by name: a wildcard does not give it.",
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
    kind: "code",
    label: "Code written in the console",
    group: "Code and runs",
    scope: "workspace",
    verbs: {
      write:
        "Write scripts, connectors and trigger sources in the console. Workers run this code as it is.",
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
      write: "Activate a bundle and roll back. Promoting needs promotion:write.",
    },
  },
  {
    kind: "promotion",
    label: "Promotion to production",
    group: "Code and runs",
    scope: "workspace",
    verbs: {
      write:
        "Promote what a dev workspace runs to the workspace it is linked to, production included.",
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
      write: "Pause and resume a trigger, and see a webhook's address, which is a credential.",
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
    appFacing: true,
    verbs: {
      read: "See flow runs and their steps.",
      write: "Start, retry and test a flow, and cancel its runs.",
    },
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
    kind: "sql",
    label: "Queries in SQL",
    group: "Data",
    scope: "workspace",
    explicit: true,
    verbs: {
      read: "Write a query in SQL and run it over the workspace's tables. It only reads, each table needs its own permission to read rows, and each table's row policy still applies. A wildcard does not give this.",
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
    verbs: {
      read: "Download a file that a row you may read names, or that you uploaded. Listing every file also needs the permission to read rows past the row policy.",
      write:
        "Upload files. Deleting one also needs the permission to change rows past the row policy, and is refused while a row names the file.",
    },
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
    kind: "interface",
    label: "Apps made in the console",
    group: "Apps",
    scope: "workspace",
    verbs: {
      read: "See the interfaces of a workspace as their makers see them.",
      write:
        "Build and change interfaces in the console, and deploy them and the apps that serve them. Nothing else can be deployed with it.",
    },
  },
  {
    kind: "doc",
    label: "Documentation",
    group: "Apps",
    scope: "workspace",
    verbs: {
      read: "Read a workspace's pages of documentation in the console, drafts included.",
      write:
        "Write and change pages of documentation in the console, and deploy them. Nothing else can be deployed with it.",
    },
  },
  {
    kind: "dashboard",
    label: "Dashboards",
    group: "Data",
    scope: "workspace",
    verbs: {
      read: "See the dashboards other members have shared in a workspace.",
      write: "Keep dashboards of your own over the workspace's tables, and share them.",
    },
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

/** Whether `kind` is given only by its own name, never by a wildcard. */
export function isExplicitKind(kind: string): boolean {
  return BY_KIND.get(kind)?.explicit === true;
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

/**
 * Whether a role's permission list grants `kind:verb`. A permission marked explicit is granted
 * only by its own name: no `*` reaches it, so nobody holds it by having been given everything.
 * The one rule, for the permission check and for every screen that shows what a role gives.
 */
export function grants(permissions: readonly string[], permission: string): boolean {
  const [kind, verb] = permission.split(":");
  if (isExplicitKind(kind ?? "")) return permissions.includes(permission);
  return permissions.some((held) => {
    const [heldKind, heldVerb] = held.split(":");
    return (heldKind === "*" || heldKind === kind) && (heldVerb === "*" || heldVerb === verb);
  });
}

/** What an interface knows of a kind when it writes a wildcard out: the API's list serves it. */
export interface KindOfPermission {
  kind: string;
  scope: string;
  explicit?: boolean | undefined;
  verbs: readonly string[];
}

/** The permissions a wildcard stands for: never an explicit kind, nor one only the instance checks. */
function standsFor(kinds: readonly KindOfPermission[], held: string): string[] {
  const [k, v] = held.split(":") as [string, string];
  const out: string[] = [];
  for (const entry of kinds) {
    if (entry.explicit || entry.scope === "instance") continue;
    if (k !== "*" && entry.kind !== k) continue;
    for (const verb of entry.verbs) if (v === "*" || verb === v) out.push(`${entry.kind}:${verb}`);
  }
  return out;
}

const isWildcard = (held: string) => held.startsWith("*:") || held.endsWith(":*");

/**
 * Turns one box on or off. A wildcard that covers the box is first written out as the
 * permissions it stands for (and no others: a wildcard never gave an explicit permission), so
 * that taking one away leaves the rest and gives nothing new.
 */
export function setPermission(
  held: readonly string[],
  kinds: readonly KindOfPermission[],
  kind: string,
  verb: string,
  on: boolean,
): string[] {
  const target = `${kind}:${verb}`;
  if (on) return grants(held, target) ? [...held] : [...held, target];
  const next = new Set<string>();
  for (const one of held) {
    if (one === target) continue;
    if (isWildcard(one) && grants([one], target)) {
      for (const each of standsFor(kinds, one)) if (each !== target) next.add(each);
    } else {
      next.add(one);
    }
  }
  return [...next];
}

/**
 * "Everything" for one verb. On: `*:verb`, replacing the named permissions of that verb it
 * covers, and leaving explicit ones and every other verb as they are. Off: takes away only that
 * verb, from `*:*` and `kind:*` too, and leaves what is given by name for an explicit kind.
 */
export function setEveryone(
  held: readonly string[],
  kinds: readonly KindOfPermission[],
  verb: string,
  on: boolean,
): string[] {
  const other = verb === "read" ? "write" : "read";
  const explicit = new Set(kinds.filter((one) => one.explicit).map((one) => one.kind));
  const next = new Set<string>();
  for (const one of held) {
    const [k, v] = one.split(":") as [string, string];
    const covered = !explicit.has(k) && (v === verb || (v === "*" && !on));
    if (on) {
      if (!(v === verb && !explicit.has(k) && k !== "*")) next.add(one);
      continue;
    }
    if (!covered) {
      next.add(one);
    } else if (v === "*") {
      next.add(`${k}:${other}`);
    }
  }
  if (on && !grants([...next], `*:${verb}`) && !next.has("*:*")) next.add(`*:${verb}`);
  return [...next];
}

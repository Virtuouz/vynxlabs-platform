import {
  Activity,
  AppWindow,
  BellRing,
  Blocks,
  BookOpen,
  Bot,
  Boxes,
  Building2,
  CircleCheck,
  CirclePause,
  Cpu,
  Database,
  Download,
  FileCode2,
  FileSearch,
  Fingerprint,
  Gauge,
  GitBranch,
  GitCompareArrows,
  Globe,
  HeartPulse,
  History,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  LifeBuoy,
  type LucideIcon,
  Palette,
  Paperclip,
  Play,
  Plug,
  Radio,
  Rocket,
  ScrollText,
  Server,
  Settings,
  Shapes,
  ShieldCheck,
  SlidersHorizontal,
  Table2,
  Upload,
  UserRound,
  UsersRound,
  Variable,
  Workflow,
  Wrench,
  Zap,
} from "lucide-react";
import { match } from "./router.tsx";

/** The areas on the rail. The first five belong to a workspace. */
export type Area =
  | "overview"
  | "build"
  | "operate"
  | "data"
  | "configure"
  | "tenant"
  | "tenants"
  | "instance"
  | "account";

export const WORKSPACE_AREAS: readonly Area[] = [
  "overview",
  "build",
  "operate",
  "data",
  "configure",
];

export const AREA_LABEL: Record<Area, string> = {
  overview: "Overview",
  build: "Build",
  operate: "Operate",
  data: "Data",
  configure: "Configure",
  tenant: "Tenant",
  tenants: "Tenants",
  instance: "Instance",
  account: "Account",
};

export const AREA_ICON: Record<Area, LucideIcon> = {
  overview: Activity,
  build: Blocks,
  operate: SlidersHorizontal,
  data: Database,
  configure: Wrench,
  tenant: Building2,
  tenants: LayoutGrid,
  instance: Server,
  account: UserRound,
};

export type CountTone = "danger" | "attention" | "action" | "neutral";

export interface Section {
  /** The last part of the address, after the workspace or tenant. */
  slug: string;
  label: string;
  icon: LucideIcon;
  /** The topic of the help for this screen. Every screen has one, and `pnpm docs:check` finds its page. */
  help: string;
}

/**
 * What a section is called in a workspace of this type. The release screen deploys in a dev
 * workspace and shows versions in production, and says so in the navigation, the palette and
 * its own title (D54).
 */
export function sectionLabel(section: Section, workspaceType: string | undefined): string {
  return section.slug === "release" && workspaceType === "production" ? "Versions" : section.label;
}

/** A workspace's screens, by area. */
export const WORKSPACE_SECTIONS: Record<
  "overview" | "build" | "operate" | "data" | "configure",
  readonly Section[]
> = {
  overview: [{ slug: "overview", label: "Overview", icon: Activity, help: "workspace-overview" }],
  build: [
    { slug: "flows", label: "Flows", icon: Workflow, help: "build-flows" },
    { slug: "scripts", label: "Scripts", icon: FileCode2, help: "build-scripts" },
    { slug: "screens", label: "App Builder", icon: LayoutDashboard, help: "build-screens" },
    { slug: "apps", label: "Apps", icon: AppWindow, help: "build-apps" },
    { slug: "extensions", label: "Extensions", icon: Shapes, help: "build-extensions" },
    { slug: "docs", label: "Documentation", icon: BookOpen, help: "build-docs" },
    { slug: "resources", label: "All resources", icon: Boxes, help: "build-resources" },
  ],
  operate: [
    { slug: "runs", label: "Runs", icon: Play, help: "operate-runs" },
    { slug: "events", label: "Events", icon: Radio, help: "operate-events" },
    { slug: "triggers", label: "Triggers", icon: Zap, help: "operate-triggers" },
    { slug: "approvals", label: "Approvals", icon: CircleCheck, help: "operate-approvals" },
    { slug: "release", label: "Deploy", icon: Rocket, help: "operate-release" },
    { slug: "git", label: "Git sync", icon: GitCompareArrows, help: "operate-git" },
  ],
  data: [
    { slug: "tables", label: "Tables", icon: Table2, help: "data-tables" },
    { slug: "queries", label: "Queries", icon: FileSearch, help: "data-queries" },
    { slug: "sources", label: "Data sources", icon: Database, help: "data-sources" },
    { slug: "dashboards", label: "Dashboards", icon: Gauge, help: "data-dashboards" },
    // The help of Tables says what a file column is; a topic of its own is for the docs lane.
    { slug: "files", label: "Files", icon: Paperclip, help: "data-tables" },
  ],
  configure: [
    { slug: "connections", label: "Connections", icon: Plug, help: "configure-connections" },
    { slug: "variables", label: "Variables", icon: Variable, help: "configure-variables" },
    { slug: "secrets", label: "Secrets", icon: KeyRound, help: "configure-secrets" },
    { slug: "alerts", label: "Alerts", icon: BellRing, help: "configure-alerts" },
    { slug: "settings", label: "Workspace settings", icon: Settings, help: "configure-settings" },
  ],
};

/** Addresses that belong to another screen in the navigation: a flow's run is a run. */
const SECTION_ALIASES: Record<string, string> = {
  "flow-runs": "runs",
  changes: "release",
  deployments: "release",
};

/** A tenant's screens, grouped. */
export const TENANT_GROUPS: readonly (readonly [label: string, sections: readonly Section[]])[] = [
  [
    "Work",
    [
      { slug: "overview", label: "Overview", icon: Activity, help: "tenant-overview" },
      { slug: "workspaces", label: "Workspaces", icon: Boxes, help: "tenant-workspaces" },
      { slug: "approvals", label: "Approvals", icon: CircleCheck, help: "tenant-approvals" },
    ],
  ],
  [
    "People and access",
    [
      { slug: "members", label: "Members & access", icon: UserRound, help: "tenant-members" },
      { slug: "end-users", label: "End users", icon: Globe, help: "tenant-end-users" },
      {
        slug: "service-accounts",
        label: "Service accounts",
        icon: Bot,
        help: "tenant-service-accounts",
      },
      {
        slug: "operator-access",
        label: "Operator access",
        icon: LifeBuoy,
        help: "tenant-operator-access",
      },
    ],
  ],
  [
    "Sign-in",
    [
      {
        slug: "single-sign-on",
        label: "Single sign-on",
        icon: Fingerprint,
        help: "tenant-single-sign-on",
      },
    ],
  ],
  [
    "Delivery",
    [
      { slug: "branding", label: "Branding", icon: Palette, help: "tenant-branding" },
      { slug: "domains", label: "Domains", icon: Globe, help: "tenant-domains" },
      { slug: "repository", label: "Repository", icon: GitBranch, help: "tenant-repository" },
      { slug: "workers", label: "Workers", icon: Cpu, help: "tenant-workers" },
    ],
  ],
  [
    "Governance",
    [
      { slug: "audit", label: "Audit log", icon: ScrollText, help: "tenant-audit" },
      { slug: "retention", label: "Retention", icon: History, help: "tenant-retention" },
      { slug: "export", label: "Export", icon: Download, help: "tenant-export" },
    ],
  ],
];
export const TENANT_SECTIONS = TENANT_GROUPS.flatMap(([, sections]) => sections);

/** The instance's screens, for operators. The tenant list is the first. */
export const INSTANCE_SECTIONS: readonly (Section & { to: string })[] = [
  { slug: "", to: "/", label: "All tenants", icon: Building2, help: "instance-tenants" },
  {
    slug: "members",
    to: "/instance/members",
    label: "All members",
    icon: UsersRound,
    help: "instance-members",
  },
  {
    slug: "operators",
    to: "/instance/operators",
    label: "Operators",
    icon: ShieldCheck,
    help: "instance-operators",
  },
  {
    slug: "single-sign-on",
    to: "/instance/single-sign-on",
    label: "Single sign-on",
    icon: Fingerprint,
    help: "instance-single-sign-on",
  },
  {
    slug: "databases",
    to: "/instance/databases",
    label: "Database locations",
    icon: Server,
    help: "instance-databases",
  },
  {
    slug: "import",
    to: "/instance/import",
    label: "Import a tenant",
    icon: Upload,
    help: "instance-import",
  },
  {
    slug: "triggers",
    to: "/instance/triggers",
    label: "Triggers",
    icon: CirclePause,
    help: "instance-triggers",
  },
  {
    slug: "health",
    to: "/instance/health",
    label: "Health",
    icon: HeartPulse,
    help: "volvel-instance-health",
  },
  {
    slug: "audit",
    to: "/instance/audit",
    label: "Audit log",
    icon: ScrollText,
    help: "instance-audit",
  },
  {
    slug: "branding",
    to: "/instance/branding",
    label: "Console branding",
    icon: Palette,
    help: "instance-branding",
  },
  {
    slug: "kit",
    to: "/instance/kit",
    label: "Component kit",
    icon: LayoutGrid,
    help: "instance-kit",
  },
];

export interface Where {
  area: Area;
  tenantId?: string;
  workspaceId?: string;
  /** The navigation entry that is current: a section slug, or an instance address. */
  section?: string;
  /** An editor takes the whole width: the section panel steps aside. */
  editor: boolean;
  /** The screen lays out its own regions edge to edge: a workbench, not a page. */
  workbench: boolean;
  /** The topic of the help for where this is: an editor's own, or its section's. */
  help?: string;
}

/** Editors of one thing, which want every pixel. Each has help of its own. */
export const EDITORS: readonly { pattern: RegExp; help: string }[] = [
  { pattern: /^flows\/(new|edit\/)/, help: "build-flows-editor" },
  { pattern: /^scripts\/(new|edit\/)/, help: "build-scripts-editor" },
  { pattern: /^extensions\/[a-z_]+\/(new|edit\/)/, help: "build-extensions-editor" },
  { pattern: /^screens\/.+/, help: "build-screens-editor" },
  // A dashboard looked at has its section's help; the editor says its own while it is edited.
  { pattern: /^dashboards\/.+/, help: "data-dashboards" },
  { pattern: /^resources\/(new|edit\/)/, help: "build-resources-editor" },
  { pattern: /^docs\/(new$|edit\/)/, help: "build-docs-editor" },
];

/**
 * Screens that fill the work area themselves, with their own scrolling regions:
 * lists beside inspectors, canvases and grids. Matched against the address
 * after the workspace.
 */
const WORKBENCHES: RegExp[] = [
  /^(runs|triggers|events|approvals)(\/|$)/,
  /^(flows|scripts|apps)$/,
  /^flows\/(new|edit\/)/,
  // An app's builder: its panes run edge to edge under the toolbar, each scrolling on its own.
  /^screens\/.+/,
  // A table's rows are one scroller under a pinned header (A2-08).
  /^tables\/.+/,
  // A data source's tables beside the rows of the one chosen.
  /^sources\/.+/,
];
/** The same, for a tenant's screens. */
const TENANT_WORKBENCHES: RegExp[] = [
  /^approvals$/,
  /^(members|groups|roles|access|releases|end-users|end-user-groups)$/,
  /^audit$/,
];
/** Instance screens that are lists beside an inspector. */
const INSTANCE_WORKBENCHES = new Set([
  "/",
  "/instance/members",
  "/instance/operators",
  "/instance/audit",
]);

/**
 * A tenant's addresses that belong to another entry in the navigation: groups,
 * roles, access and access changes are tabs of Members & access, groups of end users
 * are a tab of End users, and the tenant itself opens on its overview.
 */
export const TENANT_ALIASES: Record<string, string> = {
  "": "overview",
  groups: "members",
  roles: "members",
  access: "members",
  releases: "members",
  "end-user-groups": "end-users",
};

/** Where a path is: which area, which screen, and whether it is an editor. */
export function whereIs(path: string, operator: boolean): Where {
  const inWorkspace = match("/t/:t/workspaces/:w/*", path);
  if (inWorkspace?.t && inWorkspace.w) {
    const rest = path.split("/").slice(5).join("/");
    const tab = rest.split("/")[0] ?? "";
    const section = SECTION_ALIASES[tab] ?? tab;
    const area =
      (Object.entries(WORKSPACE_SECTIONS).find(([, sections]) =>
        sections.some((one) => one.slug === section),
      )?.[0] as Area | undefined) ?? "overview";
    const editor = EDITORS.find((one) => one.pattern.test(rest));
    const help =
      editor?.help ??
      Object.values(WORKSPACE_SECTIONS)
        .flat()
        .find((one) => one.slug === section)?.help;
    return {
      area,
      tenantId: inWorkspace.t,
      workspaceId: inWorkspace.w,
      section,
      editor: editor !== undefined,
      workbench: WORKBENCHES.some((pattern) => pattern.test(rest)),
      ...(help ? { help } : {}),
    };
  }
  const inTenant = match("/t/:t/*", path);
  if (inTenant?.t) {
    const slug = path.split("/")[3] ?? "";
    const section = TENANT_ALIASES[slug] ?? slug;
    const help = TENANT_SECTIONS.find((one) => one.slug === section)?.help;
    return {
      area: "tenant",
      tenantId: inTenant.t,
      section,
      ...(help ? { help } : {}),
      editor: false,
      workbench: TENANT_WORKBENCHES.some((pattern) =>
        pattern.test(path.split("/").slice(3).join("/")),
      ),
    };
  }
  if (path.startsWith("/account/"))
    return { area: "account", section: path, editor: false, workbench: false, help: "account" };
  if (path.startsWith("/instance/") || (operator && path === "/")) {
    const help = INSTANCE_SECTIONS.find((one) => one.to === path)?.help;
    return {
      area: "instance",
      section: path,
      editor: false,
      workbench: INSTANCE_WORKBENCHES.has(path),
      ...(help ? { help } : {}),
    };
  }
  return {
    area: "tenants",
    section: path,
    editor: false,
    workbench: path === "/",
    help: "tenants",
  };
}

/** Where a workspace area opens. */
export const areaHome = (area: Area, tenantId: string, workspaceId: string) => {
  const first =
    area in WORKSPACE_SECTIONS
      ? WORKSPACE_SECTIONS[area as keyof typeof WORKSPACE_SECTIONS][0]?.slug
      : "overview";
  return `/t/${tenantId}/workspaces/${workspaceId}/${first}`;
};

const LAST_WORKSPACE = "vx-last-workspace:";

/** The workspace last open in a tenant, kept in this browser to come back to. */
export function lastWorkspace(tenantId: string): string | null {
  try {
    return localStorage.getItem(LAST_WORKSPACE + tenantId);
  } catch {
    return null;
  }
}

export function rememberWorkspace(tenantId: string, workspaceId: string) {
  try {
    localStorage.setItem(LAST_WORKSPACE + tenantId, workspaceId);
  } catch {
    // Private browsing may refuse storage; nothing depends on it.
  }
}

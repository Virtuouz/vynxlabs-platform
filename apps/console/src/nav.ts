import {
  Activity,
  AppWindow,
  Blocks,
  Bot,
  Boxes,
  Building2,
  CircleCheck,
  Cpu,
  Database,
  Download,
  FileCode2,
  Fingerprint,
  Gauge,
  GitBranch,
  GitCompareArrows,
  Globe,
  KeyRound,
  KeySquare,
  LayoutDashboard,
  LayoutGrid,
  LifeBuoy,
  type LucideIcon,
  Palette,
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
}

/** A workspace's screens, by area. */
export const WORKSPACE_SECTIONS: Record<
  "overview" | "build" | "operate" | "data" | "configure",
  readonly Section[]
> = {
  overview: [{ slug: "overview", label: "Overview", icon: Activity }],
  build: [
    { slug: "flows", label: "Flows", icon: Workflow },
    { slug: "scripts", label: "Scripts", icon: FileCode2 },
    { slug: "screens", label: "App Builder", icon: LayoutDashboard },
    { slug: "apps", label: "Published apps", icon: AppWindow },
    { slug: "extensions", label: "Extensions", icon: Shapes },
    { slug: "resources", label: "All resources", icon: Boxes },
  ],
  operate: [
    { slug: "runs", label: "Runs", icon: Play },
    { slug: "events", label: "Events", icon: Radio },
    { slug: "triggers", label: "Triggers", icon: Zap },
    { slug: "release", label: "Releases", icon: Rocket },
    { slug: "git", label: "Git sync", icon: GitCompareArrows },
  ],
  data: [
    { slug: "tables", label: "Tables", icon: Table2 },
    { slug: "sources", label: "Data sources", icon: Database },
    { slug: "dashboards", label: "Dashboards", icon: Gauge },
  ],
  configure: [
    { slug: "connections", label: "Connections", icon: Plug },
    { slug: "variables", label: "Variables", icon: Variable },
    { slug: "secrets", label: "Secrets", icon: KeyRound },
    { slug: "settings", label: "Workspace settings", icon: Settings },
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
      { slug: "workspaces", label: "Workspaces", icon: Boxes },
      { slug: "approvals", label: "Approvals", icon: CircleCheck },
    ],
  ],
  [
    "People and access",
    [
      { slug: "members", label: "Members", icon: UserRound },
      { slug: "groups", label: "Groups", icon: UsersRound },
      { slug: "end-users", label: "End users", icon: Globe },
      { slug: "end-user-groups", label: "End-user groups", icon: UsersRound },
      { slug: "service-accounts", label: "Service accounts", icon: Bot },
      { slug: "roles", label: "Roles", icon: ShieldCheck },
      { slug: "access", label: "Access grants", icon: KeySquare },
      { slug: "operator-access", label: "Operator access", icon: LifeBuoy },
    ],
  ],
  ["Sign-in", [{ slug: "single-sign-on", label: "Single sign-on", icon: Fingerprint }]],
  [
    "Delivery",
    [
      { slug: "branding", label: "Branding", icon: Palette },
      { slug: "domains", label: "Domains", icon: Globe },
      { slug: "repository", label: "Repository", icon: GitBranch },
      { slug: "workers", label: "Workers", icon: Cpu },
    ],
  ],
  [
    "Governance",
    [
      { slug: "audit", label: "Audit log", icon: ScrollText },
      { slug: "export", label: "Export", icon: Download },
    ],
  ],
];
export const TENANT_SECTIONS = TENANT_GROUPS.flatMap(([, sections]) => sections);

/** The instance's screens, for operators. The tenant list is the first. */
export const INSTANCE_SECTIONS: readonly (Section & { to: string })[] = [
  { slug: "", to: "/", label: "All tenants", icon: Building2 },
  { slug: "members", to: "/instance/members", label: "All members", icon: UsersRound },
  { slug: "operators", to: "/instance/operators", label: "Operators", icon: ShieldCheck },
  {
    slug: "single-sign-on",
    to: "/instance/single-sign-on",
    label: "Single sign-on",
    icon: Fingerprint,
  },
  { slug: "databases", to: "/instance/databases", label: "Database locations", icon: Server },
  { slug: "import", to: "/instance/import", label: "Import a tenant", icon: Upload },
  { slug: "audit", to: "/instance/audit", label: "Audit log", icon: ScrollText },
  { slug: "branding", to: "/instance/branding", label: "Console branding", icon: Palette },
  { slug: "kit", to: "/instance/kit", label: "Component kit", icon: LayoutGrid },
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
}

/** Editors of one thing, which want every pixel. */
const EDITORS = [
  /^flows\/(new|edit\/)/,
  /^scripts\/(new|edit\/)/,
  /^extensions\/[a-z_]+\/(new|edit\/)/,
  /^screens\/.+/,
  /^resources\/(new|edit\/)/,
];

/**
 * Screens that fill the work area themselves, with their own scrolling regions:
 * lists beside inspectors, canvases and grids. Matched against the address
 * after the workspace.
 */
const WORKBENCHES: RegExp[] = [
  /^(runs|triggers|events)(\/|$)/,
  /^(flows|scripts|apps)$/,
  /^flows\/(new|edit\/)/,
];
/** The same, for a tenant's screens. */
const TENANT_WORKBENCHES: RegExp[] = [/^approvals$/];

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
    return {
      area,
      tenantId: inWorkspace.t,
      workspaceId: inWorkspace.w,
      section,
      editor: EDITORS.some((pattern) => pattern.test(rest)),
      workbench: WORKBENCHES.some((pattern) => pattern.test(rest)),
    };
  }
  const inTenant = match("/t/:t/*", path);
  if (inTenant?.t) {
    return {
      area: "tenant",
      tenantId: inTenant.t,
      section: path.split("/")[3] ?? "",
      editor: false,
      workbench: TENANT_WORKBENCHES.some((pattern) =>
        pattern.test(path.split("/").slice(3).join("/")),
      ),
    };
  }
  if (path.startsWith("/account/"))
    return { area: "account", section: path, editor: false, workbench: false };
  if (path.startsWith("/instance/") || (operator && path === "/"))
    return { area: "instance", section: path, editor: false, workbench: false };
  return { area: "tenants", section: path, editor: false, workbench: false };
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

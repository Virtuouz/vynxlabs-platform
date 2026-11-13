import { Badge, Menu } from "@vynxlabs/ui";
import {
  AppWindow,
  ArrowLeft,
  Bot,
  Boxes,
  Building2,
  ChevronsUpDown,
  CircleCheck,
  Cpu,
  Database,
  Download,
  FileCode2,
  GitBranch,
  GitCompareArrows,
  Globe,
  KeyRound,
  KeySquare,
  LifeBuoy,
  LogOut,
  type LucideIcon,
  Monitor,
  Moon,
  Palette,
  Play,
  Plug,
  Radio,
  Rocket,
  ScrollText,
  Server,
  Settings,
  ShieldCheck,
  Sun,
  Table2,
  Upload,
  UserRound,
  UsersRound,
  Variable,
  Workflow,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { isOperator, type Me, useLoad } from "./api.ts";
import { Link, match, navigate } from "./router.tsx";
import { type ThemeChoice, useThemeChoice } from "./theme.ts";

type Section = readonly [slug: string, label: string, icon: LucideIcon];
type SectionGroup = readonly [label: string, sections: readonly Section[]];

/** A tenant's screens, grouped as the sidebar shows them. */
export const TENANT_GROUPS: readonly SectionGroup[] = [
  [
    "Work",
    [
      ["workspaces", "Workspaces", Boxes],
      ["approvals", "Approvals", CircleCheck],
    ],
  ],
  [
    "People",
    [
      ["members", "Members", UserRound],
      ["groups", "Groups", UsersRound],
      ["end-users", "End users", Globe],
      ["service-accounts", "Service accounts", Bot],
    ],
  ],
  [
    "Access",
    [
      ["roles", "Roles", ShieldCheck],
      ["access", "Access", KeySquare],
      ["operator-access", "Operator access", LifeBuoy],
    ],
  ],
  [
    "Settings",
    [
      ["repository", "Repository", GitBranch],
      ["branding", "Branding", Palette],
      ["domains", "Domains", Globe],
      ["workers", "Workers", Cpu],
      ["audit", "Audit log", ScrollText],
      ["export", "Export", Download],
    ],
  ],
];
export const TENANT_SECTIONS = TENANT_GROUPS.flatMap(([, sections]) => sections);

/** A workspace's screens, grouped as the sidebar shows them. */
export const WORKSPACE_GROUPS: readonly SectionGroup[] = [
  [
    "Build",
    [
      ["flows", "Flows", Workflow],
      ["scripts", "Scripts", FileCode2],
      ["apps", "Apps", AppWindow],
      ["triggers", "Triggers", Zap],
      ["changes", "Changes", GitCompareArrows],
    ],
  ],
  [
    "Observe",
    [
      ["runs", "Runs", Play],
      ["events", "Events", Radio],
      ["deployments", "Deployments", Rocket],
    ],
  ],
  [
    "Data",
    [
      ["tables", "Tables", Table2],
      ["sources", "Data sources", Database],
    ],
  ],
  [
    "Configure",
    [
      ["connections", "Connections", Plug],
      ["variables", "Variables", Variable],
      ["secrets", "Secrets", KeyRound],
      ["resources", "Resources", Boxes],
      ["settings", "Workspace settings", Settings],
    ],
  ],
];
/** The screen each address belongs to in the sidebar: a run of a flow is under Flows. */
const WORKSPACE_ALIASES: Record<string, string> = { "flow-runs": "flows" };
const WORKSPACE_SECTIONS = WORKSPACE_GROUPS.flatMap(([, sections]) => sections);

const INSTANCE_SECTIONS: readonly Section[] = [
  ["members", "All members", UsersRound],
  ["operators", "Operators", ShieldCheck],
  ["databases", "Database locations", Server],
  ["import", "Import a tenant", Upload],
  ["audit", "Instance audit log", ScrollText],
];

function NavLink({
  to,
  current,
  icon: Icon,
  children,
}: {
  to: string;
  current: boolean;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      current={current}
      className={`flex items-center gap-2.5 rounded-control px-2 py-1.5 no-underline ${
        current ? "bg-action-soft font-medium text-action" : "text-ink hover:bg-sunken"
      }`}
    >
      <Icon aria-hidden="true" size={16} strokeWidth={1.75} className="shrink-0 opacity-80" />
      <span className="truncate">{children}</span>
    </Link>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="m-0 px-2 pb-1 text-[11px] font-semibold tracking-wider text-ink-muted uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}

const THEMES: [ThemeChoice, string, LucideIcon][] = [
  ["system", "Match the system", Monitor],
  ["light", "Light", Sun],
  ["dark", "Dark", Moon],
];

interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  type: "production" | "dev";
  triggersPaused?: boolean;
}

const switcher =
  "flex w-full items-center justify-between gap-2 rounded-control border border-line bg-canvas px-2.5 py-1.5 text-left hover:bg-sunken";

export function Shell({
  me,
  path,
  tenantId,
  onSignOut,
  children,
}: {
  me: Me;
  path: string;
  tenantId: string | undefined;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const known = me.tenants.find((candidate) => candidate.id === tenantId);
  // An operator is not a member of most tenants, so the name comes from the tenant record.
  const fetched = useLoad<{ name: string }>(tenantId && !known ? `/tenants/${tenantId}` : null);
  const tenant = known ?? fetched.data;
  const inWorkspace = match("/t/:t/workspaces/:w/*", path);
  const workspaceId = inWorkspace?.w;
  const workspaces = useLoad<{ items: WorkspaceSummary[] }>(
    tenantId && workspaceId ? `/tenants/${tenantId}/workspaces` : null,
  );
  const workspace = workspaces.data?.items.find((candidate) => candidate.id === workspaceId);
  const [theme, setTheme] = useThemeChoice();
  const ThemeIcon = THEMES.find(([choice]) => choice === theme)?.[2] ?? Monitor;

  const tab = workspaceId ? (path.split("/")[5] ?? "") : "";
  const section = WORKSPACE_ALIASES[tab] ?? tab;
  const tenantSection = tenantId && !workspaceId ? path.split("/")[3] : undefined;
  const here = workspaceId
    ? WORKSPACE_SECTIONS.find(([slug]) => slug === section)?.[1]
    : tenantSection
      ? TENANT_SECTIONS.find(([slug]) => slug === tenantSection)?.[1]
      : path.startsWith("/instance/")
        ? INSTANCE_SECTIONS.find(([slug]) => path === `/instance/${slug}`)?.[1]
        : path === "/account/api-keys"
          ? "API keys"
          : undefined;

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[15.5rem_1fr]">
      <nav
        aria-label="Main"
        className="flex flex-col gap-4 border-line border-b bg-surface p-3 md:sticky md:top-0 md:h-screen md:overflow-y-auto md:border-r md:border-b-0"
      >
        <Link
          to="/"
          className="flex items-center gap-2 px-1 pt-1 font-semibold text-ink no-underline"
        >
          <span
            aria-hidden="true"
            className="flex size-6 items-center justify-center rounded-[6px] bg-action text-action-ink"
          >
            <Workflow size={14} strokeWidth={2.25} />
          </span>
          Console
        </Link>

        {tenantId ? (
          <Menu
            ariaLabel="Switch tenant"
            triggerClassName={switcher}
            label={
              <>
                <span className="flex min-w-0 items-center gap-2">
                  <Building2 aria-hidden="true" size={15} className="shrink-0 text-ink-muted" />
                  <span className="truncate font-medium">{tenant?.name ?? "This tenant"}</span>
                </span>
                <ChevronsUpDown aria-hidden="true" size={14} className="shrink-0 text-ink-muted" />
              </>
            }
            items={[
              ...me.tenants.map((one) => ({
                label: one.name,
                current: one.id === tenantId,
                onSelect: () => navigate(`/t/${one.id}/workspaces`),
              })),
              {
                label: "All tenants",
                separated: me.tenants.length > 0,
                onSelect: () => navigate("/"),
              },
            ]}
          />
        ) : (
          <Group label="Tenants">
            <NavLink to="/" current={path === "/"} icon={Building2}>
              All tenants
            </NavLink>
          </Group>
        )}

        {tenantId && workspaceId ? (
          <>
            <div className="flex flex-col gap-2">
              <Link
                to={`/t/${tenantId}/workspaces`}
                className="flex items-center gap-1.5 px-1 text-[13px] text-ink-muted no-underline hover:text-ink"
              >
                <ArrowLeft aria-hidden="true" size={13} />
                Tenant
              </Link>
              <Menu
                ariaLabel="Switch workspace"
                triggerClassName={switcher}
                label={
                  <>
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={`size-2 shrink-0 rounded-full ${
                          workspace?.type === "production" ? "bg-attention" : "bg-action"
                        }`}
                      />
                      <span className="truncate font-medium">{workspace?.name ?? "Workspace"}</span>
                    </span>
                    <ChevronsUpDown
                      aria-hidden="true"
                      size={14}
                      className="shrink-0 text-ink-muted"
                    />
                  </>
                }
                items={(workspaces.data?.items ?? []).map((one) => ({
                  label: `${one.name} (${one.type === "production" ? "production" : "dev"})`,
                  current: one.id === workspaceId,
                  onSelect: () =>
                    navigate(`/t/${tenantId}/workspaces/${one.id}/${section || "flows"}`),
                }))}
              />
            </div>
            {WORKSPACE_GROUPS.map(([label, sections]) => (
              <Group key={label} label={label}>
                {sections.map(([slug, name, icon]) => (
                  <NavLink
                    key={slug}
                    to={`/t/${tenantId}/workspaces/${workspaceId}/${slug}`}
                    current={section === slug}
                    icon={icon}
                  >
                    {name}
                  </NavLink>
                ))}
              </Group>
            ))}
          </>
        ) : tenantId ? (
          TENANT_GROUPS.map(([label, sections]) => (
            <Group key={label} label={label}>
              {sections.map(([slug, name, icon]) => (
                <NavLink
                  key={slug}
                  to={`/t/${tenantId}/${slug}`}
                  current={tenantSection === slug}
                  icon={icon}
                >
                  {name}
                </NavLink>
              ))}
            </Group>
          ))
        ) : null}

        {isOperator(me) && !workspaceId ? (
          <Group label="Instance">
            {INSTANCE_SECTIONS.map(([slug, name, icon]) => (
              <NavLink
                key={slug}
                to={`/instance/${slug}`}
                current={path === `/instance/${slug}`}
                icon={icon}
              >
                {name}
              </NavLink>
            ))}
          </Group>
        ) : null}
      </nav>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-10 flex h-12 items-center justify-between gap-3 border-line border-b bg-canvas/85 px-4 backdrop-blur md:px-8">
          <nav aria-label="Where you are" className="flex min-w-0 items-center gap-2 text-[13px]">
            {tenantId ? (
              <>
                <Link
                  to={`/t/${tenantId}/workspaces`}
                  className="truncate text-ink-muted no-underline hover:text-ink"
                >
                  {tenant?.name ?? "Tenant"}
                </Link>
                {workspace ? (
                  <>
                    <span className="text-ink-muted">/</span>
                    <span className="truncate text-ink-muted">{workspace.name}</span>
                    <Badge tone={workspace.type === "production" ? "attention" : "action"}>
                      {workspace.type === "production" ? "Production" : "Dev"}
                    </Badge>
                    {workspace.triggersPaused ? <Badge tone="attention">Paused</Badge> : null}
                  </>
                ) : null}
                {here ? <span className="text-ink-muted">/</span> : null}
              </>
            ) : null}
            {here ? <span className="truncate font-medium">{here}</span> : null}
          </nav>
          <div className="flex shrink-0 items-center gap-1">
            <Menu
              ariaLabel="Colour theme"
              align="end"
              triggerClassName="flex size-8 items-center justify-center rounded-control text-ink-muted hover:bg-sunken hover:text-ink"
              label={<ThemeIcon aria-hidden="true" size={16} />}
              items={THEMES.map(([choice, label, Icon]) => ({
                label,
                icon: <Icon aria-hidden="true" size={15} />,
                current: theme === choice,
                onSelect: () => setTheme(choice),
              }))}
            />
            <Menu
              ariaLabel="Your account"
              align="end"
              triggerClassName="flex h-8 max-w-56 items-center gap-2 rounded-control px-2 text-[13px] hover:bg-sunken"
              label={
                <>
                  <span
                    aria-hidden="true"
                    className="flex size-5 items-center justify-center rounded-full bg-action-soft text-[11px] font-semibold text-action uppercase"
                  >
                    {(me.principal.email ?? me.principal.name ?? "?").slice(0, 1)}
                  </span>
                  <span className="truncate">{me.principal.email ?? me.principal.name}</span>
                </>
              }
              items={[
                {
                  label: "API keys",
                  icon: <KeyRound aria-hidden="true" size={15} />,
                  onSelect: () => navigate("/account/api-keys"),
                },
                {
                  label: "Sign out",
                  icon: <LogOut aria-hidden="true" size={15} />,
                  separated: true,
                  onSelect: onSignOut,
                },
              ]}
            />
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

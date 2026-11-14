import { Menu, SideSheet } from "@vynxlabs/ui";
import {
  ChevronsUpDown,
  CircleX,
  KeyRound,
  LogOut,
  type LucideIcon,
  Menu as MenuIcon,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sun,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { isOperator, type Me, useLoad } from "./api.ts";
import { BrandMark, useBrand } from "./kit/brand.tsx";
import { CommandPalette, type Destination, useCommandKey } from "./kit/CommandPalette.tsx";
import { Junction, Wire } from "./kit/motifs.tsx";
import { EnvTag, Tag } from "./kit/status.tsx";
import {
  AREA_ICON,
  AREA_LABEL,
  areaHome,
  type CountTone,
  INSTANCE_SECTIONS,
  lastWorkspace,
  rememberWorkspace,
  TENANT_GROUPS,
  TENANT_SECTIONS,
  type Where,
  WORKSPACE_AREAS,
  WORKSPACE_SECTIONS,
  whereIs,
} from "./nav.ts";
import { Link, navigate } from "./router.tsx";
import { type ThemeChoice, useThemeChoice } from "./theme.ts";

// Kept for screens that list a tenant's sections.
export { TENANT_GROUPS, TENANT_SECTIONS };

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
  linkedWorkspaceId?: string | null;
}

/** What `GET …/summary` answers for a workspace. A count the person may not read is null. */
export interface WorkspaceCounts {
  drafts: number | null;
  failedRuns: { count: number | null; since: string };
  unboundConnections: number | null;
  approvalsWaiting: number | null;
  git: { state: string } | null;
  version: number | null;
  linked: {
    id: string;
    name: string;
    type: "production" | "dev";
    version: number | null;
    same: boolean;
  } | null;
}

export interface TenantCounts {
  workspaces: number | null;
  approvalsWaiting: number | null;
  domainsToFix: number | null;
  workersOnline: number | null;
  operatorAccessActive: number | null;
  members: number | null;
}

interface Count {
  text: string;
  tone: CountTone;
}

interface Entry {
  key: string;
  label: string;
  to: string;
  current: boolean;
  icon?: LucideIcon;
  count?: Count | undefined;
}

const PANEL_KEY = "vx-panel";
function storedPanel(): boolean {
  try {
    return localStorage.getItem(PANEL_KEY) !== "closed";
  } catch {
    return true;
  }
}

const some = (n: number | null | undefined, text: (n: number) => string, tone: CountTone) =>
  n ? { text: text(n), tone } : undefined;
const plain = (n: number | null | undefined) =>
  n === null || n === undefined ? undefined : { text: String(n), tone: "neutral" as const };

/** The entries of the section panel for where the person is. */
function panelFor(
  where: Where,
  me: Me,
  counts: { workspace?: WorkspaceCounts | undefined; tenant?: TenantCounts | undefined },
): { title: string; groups: { label?: string; entries: Entry[] }[] } {
  const { tenantId, workspaceId } = where;
  if (tenantId && workspaceId && where.area in WORKSPACE_SECTIONS) {
    const area = where.area as keyof typeof WORKSPACE_SECTIONS;
    const ws = counts.workspace;
    const countOf: Record<string, Count | undefined> = {
      runs: some(ws?.failedRuns.count, (n) => `${n} failed`, "danger"),
      release: some(ws?.drafts, (n) => `${n} draft${n === 1 ? "" : "s"}`, "action"),
      git:
        ws?.git?.state === "conflict"
          ? { text: "conflict", tone: "attention" }
          : ws?.git?.state === "ahead" || ws?.git?.state === "behind"
            ? { text: ws.git.state, tone: "neutral" }
            : undefined,
      connections: some(ws?.unboundConnections, (n) => `${n} missing`, "attention"),
    };
    return {
      title: AREA_LABEL[area],
      groups: [
        {
          entries: WORKSPACE_SECTIONS[area].map((section) => ({
            key: section.slug,
            label: section.label,
            icon: section.icon,
            to: `/t/${tenantId}/workspaces/${workspaceId}/${section.slug}`,
            current: where.section === section.slug,
            count: countOf[section.slug],
          })),
        },
      ],
    };
  }
  if (tenantId) {
    const t = counts.tenant;
    const countOf: Record<string, Count | undefined> = {
      workspaces: plain(t?.workspaces),
      approvals: some(t?.approvalsWaiting, (n) => String(n), "attention"),
      members: plain(t?.members),
      "operator-access": some(t?.operatorAccessActive, (n) => `${n} active`, "attention"),
      domains: some(t?.domainsToFix, (n) => `${n} to fix`, "attention"),
      workers:
        t?.workersOnline === null || t?.workersOnline === undefined
          ? undefined
          : { text: `${t.workersOnline} online`, tone: "neutral" },
    };
    const tenant = me.tenants.find((one) => one.id === tenantId);
    return {
      title: tenant?.name ?? "Tenant",
      groups: TENANT_GROUPS.map(([label, sections]) => ({
        label,
        entries: sections.map((section) => ({
          key: section.slug,
          label: section.label,
          icon: section.icon,
          to: `/t/${tenantId}/${section.slug}`,
          current: where.section === section.slug,
          count: countOf[section.slug],
        })),
      })),
    };
  }
  if (where.area === "instance") {
    return {
      title: "Instance",
      groups: [
        {
          entries: INSTANCE_SECTIONS.map((section) => ({
            key: section.to,
            label: section.label,
            icon: section.icon,
            to: section.to,
            current: where.section === section.to,
          })),
        },
      ],
    };
  }
  if (where.area === "account") {
    return {
      title: "Your account",
      groups: [
        {
          entries: [
            {
              key: "api-keys",
              label: "API keys",
              icon: KeyRound,
              to: "/account/api-keys",
              current: where.section === "/account/api-keys",
            },
          ],
        },
      ],
    };
  }
  return {
    title: "Tenants",
    groups: [
      {
        entries: [
          { key: "all", label: "All tenants", to: "/", current: where.section === "/" },
          ...me.tenants.map((tenant) => ({
            key: tenant.id,
            label: tenant.name,
            to: `/t/${tenant.id}/workspaces`,
            current: false,
          })),
        ],
      },
    ],
  };
}

const COUNT_TONE: Record<CountTone, string> = {
  danger: "text-danger",
  attention: "text-attention",
  action: "text-action",
  neutral: "text-ink-subtle",
};

function SectionList({
  groups,
  filter,
  onGo,
}: {
  groups: { label?: string; entries: Entry[] }[];
  filter: string;
  onGo?: () => void;
}) {
  const wanted = filter.trim().toLowerCase();
  const shown = groups
    .map((group) => ({
      ...group,
      entries: group.entries.filter((entry) => entry.label.toLowerCase().includes(wanted)),
    }))
    .filter((group) => group.entries.length > 0);
  return (
    <div className="relative flex flex-col gap-px">
      <span aria-hidden="true" className="absolute top-3.5 bottom-3.5 left-[9px] w-px bg-line" />
      {shown.length === 0 ? (
        <p className="m-0 px-6 py-2 text-meta text-ink-subtle">Nothing matches.</p>
      ) : null}
      {shown.map((group) => (
        <div key={group.label ?? "all"} className="flex flex-col gap-px">
          {group.label ? (
            <p className="relative m-0 truncate bg-structure pt-3 pr-2 pb-1 pl-6 text-tag text-ink-subtle uppercase">
              {group.label}
            </p>
          ) : null}
          {group.entries.map((entry) => (
            <span key={entry.key} className="contents" onClickCapture={onGo}>
              <Link
                to={entry.to}
                current={entry.current}
                className={`relative flex h-8 items-center justify-between gap-2 rounded-control pr-2 pl-6 no-underline ${
                  entry.current
                    ? "bg-selected font-medium text-ink"
                    : "text-ink-muted hover:bg-surface hover:text-ink"
                }`}
              >
                <span className="absolute top-1/2 left-1.5 -mt-[3.5px] flex">
                  <Junction kind={entry.current ? "here" : "plain"} />
                </span>
                <span className="truncate">{entry.label}</span>
                {entry.count ? (
                  <span className={`shrink-0 font-mono text-tag ${COUNT_TONE[entry.count.tone]}`}>
                    {entry.count.text}
                  </span>
                ) : null}
              </Link>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Draft, this workspace, and where it promotes to, as a short vertical path. */
function ReleasePath({ counts }: { counts: WorkspaceCounts }) {
  const rows: {
    key: string;
    kind: "here" | "production" | "pending" | "plain";
    content: ReactNode;
  }[] = [];
  if (counts.drafts !== null)
    rows.push({
      key: "draft",
      kind: "pending",
      content: (
        <>
          Draft{" "}
          <span className="font-mono text-action">
            {counts.drafts} change{counts.drafts === 1 ? "" : "s"}
          </span>
        </>
      ),
    });
  rows.push({
    key: "here",
    kind: "here",
    content: (
      <>
        This workspace{" "}
        <span className="font-mono text-ink-muted">
          {counts.version === null ? "nothing deployed" : `v${counts.version}`}
        </span>
      </>
    ),
  });
  if (counts.linked)
    rows.push({
      key: "linked",
      kind: counts.linked.type === "production" ? "production" : "plain",
      content: (
        <>
          {counts.linked.name}{" "}
          <span className="font-mono text-ink-muted">
            {counts.linked.version === null ? "—" : `v${counts.linked.version}`}
          </span>{" "}
          <span
            className={`text-meta ${counts.linked.same ? "text-ink-subtle" : "text-attention"}`}
          >
            · {counts.linked.same ? "same" : "differs"}
          </span>
        </>
      ),
    });
  return (
    <div className="flex flex-col gap-2.5 border-line border-t px-3 pt-3 pb-4">
      <p className="m-0 text-label text-ink-subtle uppercase">Release path</p>
      <ol className="relative m-0 flex list-none flex-col gap-2.5 p-0 pl-4">
        <span
          aria-hidden="true"
          className="absolute top-1.5 bottom-1.5 left-[3px] w-px bg-line-strong"
        />
        {rows.map((row) => (
          <li key={row.key} className="relative text-meta">
            <span className="absolute top-[5px] -left-4 flex">
              <Junction kind={row.kind} />
            </span>
            {row.content}
          </li>
        ))}
      </ol>
    </div>
  );
}

function RailItem({
  to,
  label,
  icon: Icon,
  current,
  dim = false,
  onGo,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  current: boolean;
  dim?: boolean;
  onGo?: () => void;
}) {
  return (
    <span className="contents" onClickCapture={onGo}>
      <Link
        to={to}
        current={current}
        className={`relative flex w-14 flex-col items-center gap-1 rounded-control pt-[7px] pb-1.5 no-underline ${
          current ? "bg-selected text-ink" : "text-ink-muted hover:text-ink"
        } ${dim ? "opacity-55" : ""}`}
      >
        {current ? (
          <>
            <span
              aria-hidden="true"
              className="absolute top-2.5 bottom-2.5 -left-1 w-0.5 bg-action"
            />
            <span
              aria-hidden="true"
              className="absolute top-1/2 -left-1.5 -mt-[3px] size-1.5 rounded-full bg-action"
            />
          </>
        ) : null}
        <Icon aria-hidden="true" size={18} strokeWidth={1.75} />
        <span className="text-micro">{label}</span>
      </Link>
    </span>
  );
}

function ThemeMenu({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useThemeChoice();
  const ThemeIcon = THEMES.find(([choice]) => choice === theme)?.[2] ?? Monitor;
  return (
    <Menu
      ariaLabel="Colour theme"
      align={compact ? "start" : "end"}
      triggerClassName="flex size-8 items-center justify-center rounded-control text-ink-muted hover:bg-surface hover:text-ink"
      label={<ThemeIcon aria-hidden="true" size={16} />}
      items={THEMES.map(([choice, label, Icon]) => ({
        label,
        icon: <Icon aria-hidden="true" size={15} />,
        current: theme === choice,
        onSelect: () => setTheme(choice),
      }))}
    />
  );
}

function AccountMenu({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const name = me.principal.email ?? me.principal.name ?? "?";
  return (
    <Menu
      ariaLabel="Your account"
      align="start"
      triggerClassName="flex size-7 items-center justify-center rounded-full bg-action-soft text-label font-semibold text-action uppercase"
      label={<span title={name}>{name.slice(0, 1)}</span>}
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
  );
}

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
  const brand = useBrand();
  const operator = isOperator(me);
  const where = whereIs(path, operator);
  const workspaceId = where.workspaceId;

  const known = me.tenants.find((candidate) => candidate.id === tenantId);
  // An operator is not a member of most tenants, so the name comes from the tenant record.
  const fetched = useLoad<{ name: string }>(tenantId && !known ? `/tenants/${tenantId}` : null);
  const tenant = known ?? fetched.data;
  const workspaces = useLoad<{ items: WorkspaceSummary[] }>(
    tenantId ? `/tenants/${tenantId}/workspaces` : null,
  );
  const workspace = workspaces.data?.items.find((candidate) => candidate.id === workspaceId);
  const wsCounts = useLoad<WorkspaceCounts>(
    tenantId && workspaceId ? `/tenants/${tenantId}/workspaces/${workspaceId}/summary` : null,
  );
  const tenantCounts = useLoad<TenantCounts>(tenantId ? `/tenants/${tenantId}/summary` : null);

  // Counts move as work is done: ask again on each new screen.
  const reloadWs = wsCounts.reload;
  const reloadTenant = tenantCounts.reload;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new path is the reason to ask again
  useEffect(() => {
    reloadWs();
    reloadTenant();
  }, [path, reloadWs, reloadTenant]);

  useEffect(() => {
    if (tenantId && workspaceId) rememberWorkspace(tenantId, workspaceId);
  }, [tenantId, workspaceId]);

  const [panelOpen, setPanelOpen] = useState(storedPanel);
  const togglePanel = (open: boolean) => {
    setPanelOpen(open);
    try {
      localStorage.setItem(PANEL_KEY, open ? "open" : "closed");
    } catch {
      // The choice then lasts for this page.
    }
  };
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const openPalette = useCallback(() => setPalette(true), []);
  useCommandKey(openPalette);
  const [filter, setFilter] = useState("");

  const panel = panelFor(where, me, {
    workspace: wsCounts.data,
    tenant: tenantCounts.data,
  });
  // The overview is one screen, and an editor wants the width: neither has a panel.
  const hasPanel = where.area !== "overview" && !where.editor;
  const showPanel = hasPanel && panelOpen;

  const here = (() => {
    if (workspaceId)
      return Object.values(WORKSPACE_SECTIONS)
        .flat()
        .find((section) => section.slug === where.section)?.label;
    if (tenantId) return TENANT_SECTIONS.find((section) => section.slug === where.section)?.label;
    if (where.area === "instance")
      return INSTANCE_SECTIONS.find((section) => section.to === where.section)?.label;
    if (where.area === "account") return "API keys";
    return undefined;
  })();

  const destinations = useMemo<Destination[]>(() => {
    const list: Destination[] = [];
    if (tenantId && workspaceId) {
      for (const section of Object.values(WORKSPACE_SECTIONS).flat())
        list.push({
          key: `ws-${section.slug}`,
          label: section.label,
          where: workspace?.name ?? "This workspace",
          to: `/t/${tenantId}/workspaces/${workspaceId}/${section.slug}`,
          icon: section.icon,
        });
    }
    if (tenantId) {
      for (const one of workspaces.data?.items ?? [])
        list.push({
          key: `w-${one.id}`,
          label: one.name,
          where: `Workspace · ${one.type === "production" ? "production" : "dev"}`,
          to: `/t/${tenantId}/workspaces/${one.id}/overview`,
          icon: AREA_ICON.overview,
        });
      for (const section of TENANT_SECTIONS)
        list.push({
          key: `t-${section.slug}`,
          label: section.label,
          where: tenant?.name ?? "Tenant",
          to: `/t/${tenantId}/${section.slug}`,
          icon: section.icon,
        });
    }
    for (const one of me.tenants)
      list.push({
        key: `tenant-${one.id}`,
        label: one.name,
        where: "Tenant",
        to: `/t/${one.id}/workspaces`,
        icon: AREA_ICON.tenant,
      });
    if (operator)
      for (const section of INSTANCE_SECTIONS)
        list.push({
          key: `i-${section.to}`,
          label: section.label,
          where: "Instance",
          to: section.to,
          icon: section.icon,
        });
    list.push({
      key: "account",
      label: "API keys",
      where: "Your account",
      to: "/account/api-keys",
      icon: KeyRound,
    });
    return list;
  }, [tenantId, workspaceId, workspace?.name, workspaces.data, tenant?.name, me.tenants, operator]);

  const lastWs = tenantId ? (workspaceId ?? lastWorkspace(tenantId)) : null;
  const rail = (onGo?: () => void) => (
    <>
      {tenantId
        ? WORKSPACE_AREAS.map((area) => (
            <RailItem
              key={area}
              to={lastWs ? areaHome(area, tenantId, lastWs) : `/t/${tenantId}/workspaces`}
              label={AREA_LABEL[area]}
              icon={AREA_ICON[area]}
              current={Boolean(workspaceId) && where.area === area}
              dim={!workspaceId}
              {...(onGo ? { onGo } : {})}
            />
          ))
        : null}
      {tenantId ? <span aria-hidden="true" className="my-2 h-px w-6 bg-line" /> : null}
      {tenantId ? (
        <RailItem
          to={`/t/${tenantId}/workspaces`}
          label={AREA_LABEL.tenant}
          icon={AREA_ICON.tenant}
          current={where.area === "tenant"}
          {...(onGo ? { onGo } : {})}
        />
      ) : null}
      {operator ? (
        <RailItem
          to="/"
          label={AREA_LABEL.instance}
          icon={AREA_ICON.instance}
          current={where.area === "instance"}
          {...(onGo ? { onGo } : {})}
        />
      ) : (
        <RailItem
          to="/"
          label={AREA_LABEL.tenants}
          icon={AREA_ICON.tenants}
          current={where.area === "tenants"}
          {...(onGo ? { onGo } : {})}
        />
      )}
    </>
  );

  const ws = wsCounts.data;
  const failed = ws?.failedRuns.count ?? 0;
  const drafts = ws?.drafts ?? 0;

  return (
    <div className="flex h-full min-h-0">
      <nav
        aria-label="Main"
        className="hidden w-16 shrink-0 flex-col items-center gap-1 border-line border-r bg-structure py-3 md:flex"
      >
        <Link to="/" className="mb-3.5 flex no-underline">
          <BrandMark />
        </Link>
        {rail()}
        <div className="flex-1" />
        <ThemeMenu compact />
        <div className="mt-2">
          <AccountMenu me={me} onSignOut={onSignOut} />
        </div>
      </nav>

      {showPanel ? (
        <nav
          aria-label="Sections"
          className="hidden w-56 shrink-0 flex-col border-line border-r bg-structure lg:flex"
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-line border-b pr-3 pl-4">
            <span className="truncate font-semibold">{panel.title}</span>
            <button
              type="button"
              aria-label="Hide navigation"
              onClick={() => togglePanel(false)}
              className="flex size-7 items-center justify-center rounded-control text-ink-subtle hover:bg-surface hover:text-ink"
            >
              <PanelLeftClose aria-hidden="true" size={15} />
            </button>
          </div>
          <div className="px-3 pt-3 pb-1.5">
            <label className="flex h-[30px] items-center gap-2 rounded-control border border-line px-2.5 text-ink-subtle focus-within:border-line-strong">
              <Search aria-hidden="true" size={13} />
              <input
                aria-label="Filter the sections"
                placeholder="Filter"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="min-w-0 flex-1 border-0 bg-transparent text-meta text-ink outline-none placeholder:text-ink-subtle"
              />
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-1.5">
            <SectionList groups={panel.groups} filter={filter} />
          </div>
          {workspaceId && ws ? <ReleasePath counts={ws} /> : null}
        </nav>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-line border-b bg-canvas pr-3 pl-2 md:pr-4 md:pl-3.5">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              aria-label="Open the menu"
              onClick={() => setDrawer(true)}
              className="flex size-8 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-surface hover:text-ink md:hidden"
            >
              <MenuIcon aria-hidden="true" size={17} />
            </button>
            {hasPanel ? (
              <button
                type="button"
                aria-label="Show navigation"
                onClick={() => {
                  if (window.matchMedia?.("(min-width: 1024px)").matches) togglePanel(true);
                  else setDrawer(true);
                }}
                className={`size-7 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-surface hover:text-ink ${
                  panelOpen ? "hidden md:flex lg:hidden" : "hidden md:flex"
                }`}
              >
                <PanelLeftOpen aria-hidden="true" size={15} />
              </button>
            ) : null}
            <nav
              aria-label="Where you are"
              className="flex min-w-0 items-center gap-2 overflow-hidden text-[13px] whitespace-nowrap"
            >
              {tenantId && workspaceId ? (
                <>
                  <Link
                    to={`/t/${tenantId}/workspaces`}
                    className="hidden truncate text-ink-muted no-underline hover:text-ink sm:inline"
                  >
                    {tenant?.name ?? "Tenant"}
                  </Link>
                  <span aria-hidden="true" className="hidden items-center sm:flex">
                    <Wire />
                    <Junction
                      kind={workspace?.type === "production" ? "production" : "here"}
                      size={5}
                    />
                    <Wire width={6} />
                  </span>
                  <Menu
                    ariaLabel="Switch workspace"
                    triggerClassName="flex min-w-0 items-center gap-1.5 rounded-control border border-line px-2 py-[3px] font-medium hover:bg-surface"
                    label={
                      <>
                        <span className="truncate">{workspace?.name ?? "Workspace"}</span>
                        <ChevronsUpDown
                          aria-hidden="true"
                          size={12}
                          className="shrink-0 text-ink-subtle"
                        />
                      </>
                    }
                    items={(workspaces.data?.items ?? []).map((one) => ({
                      label: `${one.name} (${one.type === "production" ? "production" : "dev"})`,
                      current: one.id === workspaceId,
                      onSelect: () =>
                        navigate(
                          `/t/${tenantId}/workspaces/${one.id}/${where.section || "overview"}`,
                        ),
                    }))}
                  />
                  {workspace ? <EnvTag type={workspace.type} /> : null}
                  {workspace?.triggersPaused ? <Tag tone="production">Paused</Tag> : null}
                  {ws?.linked ? (
                    <span className="hidden items-center gap-2 xl:flex">
                      <span aria-hidden="true" className="flex items-center gap-1">
                        <Wire dashed width={14} />
                        <Junction
                          kind={ws.linked.type === "production" ? "production" : "plain"}
                          size={5}
                        />
                      </span>
                      <span className="text-ink-subtle">
                        promotes to <span className="text-ink-muted">{ws.linked.name}</span>
                      </span>
                    </span>
                  ) : null}
                  {here ? <span className="sr-only">/{here}</span> : null}
                </>
              ) : tenantId ? (
                <>
                  <Menu
                    ariaLabel="Switch tenant"
                    triggerClassName="flex min-w-0 items-center gap-1.5 text-ink-muted hover:text-ink"
                    label={
                      <>
                        <span className="truncate">{tenant?.name ?? "Tenant"}</span>
                        <ChevronsUpDown
                          aria-hidden="true"
                          size={12}
                          className="shrink-0 text-ink-subtle"
                        />
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
                  {here ? (
                    <>
                      <span aria-hidden="true" className="flex items-center">
                        <Wire />
                        <Junction kind="here" size={5} />
                      </span>
                      <span className="truncate font-medium">
                        <span className="sr-only">/</span>
                        {here}
                      </span>
                    </>
                  ) : null}
                  <span className="hidden sm:inline-flex">
                    <Tag>Tenant</Tag>
                  </span>
                </>
              ) : (
                <>
                  <span className="truncate text-ink-muted">
                    {where.area === "account"
                      ? (me.principal.email ?? me.principal.name)
                      : brand.productName}
                  </span>
                  {here ? (
                    <>
                      <span aria-hidden="true" className="flex items-center">
                        <Wire />
                        <Junction
                          kind={where.area === "instance" ? "production" : "here"}
                          size={5}
                        />
                      </span>
                      <span className="truncate font-medium">
                        <span className="sr-only">/</span>
                        {here}
                      </span>
                    </>
                  ) : null}
                  <span className="hidden sm:inline-flex">
                    {where.area === "instance" ? (
                      <Tag tone="production">Instance · operator</Tag>
                    ) : where.area === "account" ? (
                      <Tag>Personal</Tag>
                    ) : null}
                  </span>
                </>
              )}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {tenantId && workspaceId && drafts > 0 ? (
              <Link
                to={`/t/${tenantId}/workspaces/${workspaceId}/release`}
                className="hidden h-7 items-center gap-1.5 rounded-control border border-line px-2.5 text-meta text-ink no-underline hover:bg-surface lg:flex"
              >
                <Junction kind="pending" size={5} />
                <span className="font-mono">{drafts}</span> draft{drafts === 1 ? "" : "s"}
                <span className="text-action">Review</span>
              </Link>
            ) : null}
            {tenantId && workspaceId && failed > 0 ? (
              <Link
                to={`/t/${tenantId}/workspaces/${workspaceId}/runs`}
                className="hidden h-7 items-center gap-1.5 rounded-control border border-danger/40 px-2.5 text-meta text-ink no-underline hover:bg-danger-soft sm:flex"
              >
                <CircleX aria-hidden="true" size={13} className="text-danger" />
                <span className="font-mono">{failed}</span> failed run{failed === 1 ? "" : "s"}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={openPalette}
              aria-label="Search or jump to"
              className="flex h-8 items-center gap-2 rounded-control text-meta text-ink-subtle hover:text-ink md:h-7 md:w-56 md:border md:border-line md:bg-structure md:pr-1.5 md:pl-2.5"
            >
              <Search aria-hidden="true" size={15} className="mx-1.5 md:mx-0" />
              <span className="hidden flex-1 text-left md:inline">Search or jump to…</span>
              <kbd className="hidden rounded-[4px] border border-line px-1 font-mono text-tag md:inline">
                ⌘K
              </kbd>
            </button>
          </div>
        </header>

        <main
          className={`flex min-h-0 flex-1 flex-col bg-canvas ${where.workbench ? "overflow-hidden" : "overflow-auto"}`}
        >
          {where.workbench ? (
            children
          ) : (
            <div
              className={`w-full px-4 md:px-8 ${where.editor ? "py-4" : "mx-auto max-w-[1440px] py-6"}`}
            >
              {children}
            </div>
          )}
        </main>
      </div>

      <SideSheet
        open={drawer}
        onClose={() => setDrawer(false)}
        side="left"
        size="narrow"
        title={
          <span className="flex items-center gap-2.5">
            <BrandMark size={24} />
            {brand.productName}
          </span>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-1 md:hidden">{rail(() => setDrawer(false))}</div>
          {hasPanel ? (
            <div className="flex flex-col gap-2">
              <p className="m-0 text-label text-ink-subtle uppercase">{panel.title}</p>
              <SectionList groups={panel.groups} filter="" onGo={() => setDrawer(false)} />
            </div>
          ) : null}
          {workspaceId && ws ? <ReleasePath counts={ws} /> : null}
          <div className="flex items-center gap-3 border-line border-t pt-3 md:hidden">
            <AccountMenu me={me} onSignOut={onSignOut} />
            <span className="min-w-0 flex-1 truncate text-meta text-ink-muted">
              {me.principal.email ?? me.principal.name}
            </span>
            <ThemeMenu compact />
          </div>
        </div>
      </SideSheet>

      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        destinations={destinations}
      />
    </div>
  );
}

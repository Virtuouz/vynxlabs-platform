import { Appear, Menu, SideSheet } from "@vynxlabs/ui";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CircleX,
  Keyboard,
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
  UsersRound,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, isOperator, type Me, useLoad } from "./api.ts";
import { BrandMark, useBrand } from "./kit/brand.tsx";
import {
  CommandPalette,
  type Destination,
  ShortcutSheet,
  useCommandKey,
} from "./kit/CommandPalette.tsx";
import { ErrorBoundary } from "./kit/ErrorBoundary.tsx";
import { openShortcuts, useShortcut } from "./kit/keys.ts";
import { LiveIndicator } from "./kit/LiveIndicator.tsx";
import { useWide, WIDE } from "./kit/layout.tsx";
import { Junction, Wire } from "./kit/motifs.tsx";
import { OperatorMark, OperatorStrip } from "./kit/OperatorStrip.tsx";
import { EnvTag, StatePill, Tag } from "./kit/status.tsx";
import { pageTitle, useNamedObject } from "./kit/title.ts";
import {
  AREA_ICON,
  AREA_LABEL,
  type Area,
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
import { usePreference } from "./prefs.ts";
import { openedAt, useRecordRecent } from "./recent.ts";
import { Link, navigate, navigationKind, useRestoredScroll } from "./router.tsx";
import { useTenantStream } from "./stream.ts";
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
  /** What a first run's checklist needs. Optional: an older server sends none. */
  scripts?: number | null;
  flows?: number | null;
  everRan?: boolean | null;
  workersOnline?: number | null;
  drafts: number | null;
  // Optional: an older server may not send it, and a missing count must not take the shell down.
  failedRuns?: { count: number | null; since: string };
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
  /** Promotion requests waiting on the one looking. */
  promotionRequests?: number | null;
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

/** How many sections an area of a workspace has. One section is a link; several are revealed. */
const sectionsOf = (area: Area) =>
  area in WORKSPACE_SECTIONS
    ? WORKSPACE_SECTIONS[area as keyof typeof WORKSPACE_SECTIONS].length
    : 0;

const some = (n: number | null | undefined, text: (n: number) => string, tone: CountTone) =>
  n ? { text: text(n), tone } : undefined;
const plain = (n: number | null | undefined) =>
  n === null || n === undefined ? undefined : { text: String(n), tone: "neutral" as const };

/** The entries of the section panel for where the person is. */
function panelFor(
  where: Where,
  me: Me,
  counts: { workspace?: WorkspaceCounts | undefined; tenant?: TenantCounts | undefined },
  /** An area of the rail that was pressed: its sections are shown, wherever the person is. */
  reveal?: { area: Area; workspaceId: string },
): { title: string; groups: { label?: string; entries: Entry[] }[] } {
  const { tenantId } = where;
  const workspaceId = reveal?.workspaceId ?? where.workspaceId;
  const shownArea = reveal?.area ?? where.area;
  if (tenantId && workspaceId && shownArea in WORKSPACE_SECTIONS) {
    const area = shownArea as keyof typeof WORKSPACE_SECTIONS;
    const ws = counts.workspace;
    const countOf: Record<string, Count | undefined> = {
      runs: some(ws?.failedRuns?.count, (n) => `${n} failed`, "danger"),
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
            current: where.workspaceId === workspaceId && where.section === section.slug,
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
            to: `/t/${tenant.id}`,
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

/**
 * The resource an address inside a workspace names, when it names one that
 * another workspace may have too: a script, a flow, a table, a connection.
 */
export function objectAt(rest: string): { path: string } | undefined {
  const found =
    /^scripts\/(?:edit\/)?(?!new$)(.+)$/.exec(rest) ??
    /^flows\/(?:edit\/)?(?!new$)(.+)$/.exec(rest) ??
    /^(?:connections|variables|events|tables)\/(.+)$/.exec(rest);
  return found?.[1] ? { path: found[1] } : undefined;
}

/**
 * Goes to the same place in another workspace: the same object, with the same
 * filters, when it is there too, or else the same section.
 */
export async function switchWorkspace(
  tenantId: string,
  from: string,
  to: string,
  section: string | undefined,
) {
  const rest = location.pathname.split(`/workspaces/${from}/`)[1] ?? "";
  const target = `/t/${tenantId}/workspaces/${to}`;
  const object = objectAt(rest);
  if (object) {
    const there = await api
      .get(`/tenants/${tenantId}/workspaces/${to}/resources/${object.path}`)
      .then(
        () => true,
        () => false,
      );
    if (there) {
      navigate(`${target}/${rest}${location.search}`);
      return;
    }
  }
  // Filters belong to a list, and a list of the same section takes them; a run or an
  // object of this workspace does not exist there.
  const listOnly = rest === section;
  navigate(`${target}/${section || "overview"}${listOnly ? location.search : ""}`);
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
    <div className="flex flex-col gap-2 border-line border-t px-3 pt-3 pb-4">
      <p className="m-0 text-label text-ink-subtle uppercase">Release path</p>
      <ol className="relative m-0 flex list-none flex-col gap-2 p-0 pl-4">
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

/**
 * The end of the breadcrumb: the section, and what is open in it. The last
 * crumb is the page itself; the section before it leads back to its list.
 */
function Crumbs({
  section,
  href,
  object,
}: {
  section: string;
  href: string | undefined;
  object: string | undefined;
}) {
  const sep = <ChevronRight aria-hidden="true" size={14} className="shrink-0 text-ink-subtle" />;
  return (
    <ol className="m-0 flex min-w-0 list-none items-center gap-1.5 p-0">
      {object && href ? (
        // On a phone there is room for what is open and a way back to its list.
        <li className="flex items-center md:hidden">
          <Link
            to={href}
            aria-label={`Back to ${section}`}
            className="flex size-7 items-center justify-center rounded-control text-ink-muted hover:bg-surface hover:text-ink"
          >
            <ChevronLeft aria-hidden="true" size={16} />
          </Link>
        </li>
      ) : null}
      <li className={`min-w-0 items-center gap-1.5 ${object ? "hidden md:flex" : "flex"}`}>
        {sep}
        {object && href ? (
          <Link
            to={href}
            className="truncate text-ink-muted no-underline underline-offset-2 hover:text-ink hover:underline"
          >
            {section}
          </Link>
        ) : (
          <span aria-current="page" className="truncate font-medium">
            {section}
          </span>
        )}
      </li>
      {object ? (
        <li className="flex min-w-0 items-center gap-1.5">
          <span className="hidden md:flex">{sep}</span>
          <span aria-current="page" className="truncate font-medium" title={object}>
            {object}
          </span>
        </li>
      ) : null}
    </ol>
  );
}

function RailItem({
  to,
  label,
  icon: Icon,
  current,
  dim = false,
  onGo,
  onReveal,
  revealed = false,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  current: boolean;
  dim?: boolean;
  onGo?: () => void;
  /**
   * An area with several sections shows them and goes nowhere: pressing Data
   * while reading a dashboard must not take the reader to Tables.
   */
  onReveal?: () => void;
  revealed?: boolean;
}) {
  const look = `relative flex w-14 flex-col items-center gap-1 rounded-control pt-[7px] pb-1.5 no-underline ${
    current
      ? "bg-selected text-ink"
      : revealed
        ? "bg-surface text-ink"
        : "text-ink-muted hover:text-ink"
  } ${dim ? "opacity-55" : ""}`;
  const inside = (
    <>
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
      <Icon aria-hidden="true" size={20} />
      <span className="text-label font-medium tracking-normal">{label}</span>
    </>
  );
  if (onReveal) {
    return (
      <button
        type="button"
        onClick={onReveal}
        aria-expanded={revealed}
        aria-current={current ? "true" : undefined}
        data-rail-area=""
        className={look}
      >
        {inside}
      </button>
    );
  }
  return (
    <span className="contents" onClickCapture={onGo}>
      <Link to={to} current={current} className={look}>
        {inside}
      </Link>
    </span>
  );
}

function ThemeMenu({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useThemeChoice();
  const ThemeIcon = THEMES.find(([choice]) => choice === theme)?.[2] ?? Monitor;
  return (
    <Menu
      ariaLabel="Color theme"
      align={compact ? "start" : "end"}
      triggerClassName="flex size-8 items-center justify-center rounded-control text-ink-muted hover:bg-surface hover:text-ink"
      label={<ThemeIcon aria-hidden="true" size={16} />}
      items={THEMES.map(([choice, label, Icon]) => ({
        label,
        icon: <Icon aria-hidden="true" size={16} />,
        current: theme === choice,
        onSelect: () => setTheme(choice),
      }))}
    />
  );
}

/** The search box on this screen, for `/`: the list's own, before any other. */
const SEARCH_BOXES = [
  "main [data-search]",
  'main input[type="search"]',
  'main input[name="search"]',
  'main input[name="q"]',
  'main input[name="filter"]',
];

/**
 * `g` then a letter goes to a section of the workspace on screen, and `/`
 * searches the list on screen, or opens the palette where there is no list.
 */
function useGoTo(
  tenantId: string | undefined,
  workspaceId: string | undefined,
  palette: () => void,
) {
  const go = (section: string) => () => {
    if (tenantId && workspaceId) navigate(`/t/${tenantId}/workspaces/${workspaceId}/${section}`);
  };
  useShortcut("go.overview", go("overview"), { enabled: Boolean(workspaceId) });
  useShortcut("go.runs", go("runs"), { enabled: Boolean(workspaceId) });
  useShortcut("go.flows", go("flows"), { enabled: Boolean(workspaceId) });
  useShortcut("go.scripts", go("scripts"), { enabled: Boolean(workspaceId) });
  useShortcut("go.triggers", go("triggers"), { enabled: Boolean(workspaceId) });
  // In a workspace, its own approvals; otherwise the ones surfaced to the tenant.
  useShortcut(
    "go.approvals",
    () =>
      tenantId &&
      navigate(
        workspaceId
          ? `/t/${tenantId}/workspaces/${workspaceId}/approvals`
          : `/t/${tenantId}/approvals`,
      ),
    {
      enabled: Boolean(tenantId),
    },
  );
  useShortcut("search", () => {
    for (const selector of SEARCH_BOXES) {
      const box = document.querySelector<HTMLInputElement>(selector);
      if (box && box.offsetParent !== null) {
        box.focus();
        box.select();
        return;
      }
    }
    palette();
  });
}

function AccountMenu({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const name = me.principal.email ?? me.principal.name ?? "?";
  return (
    <Menu
      ariaLabel="Your account"
      align="start"
      triggerClassName="flex size-7 items-center justify-center rounded-full bg-action-soft text-label font-semibold text-action uppercase"
      label={<span aria-hidden="true">{name.slice(0, 1)}</span>}
      items={[
        {
          label: `Signed in as ${name}`,
          onSelect: () => navigate("/account/api-keys"),
        },
        {
          label: "API keys",
          icon: <KeyRound aria-hidden="true" size={16} />,
          onSelect: () => navigate("/account/api-keys"),
        },
        {
          label: "Keyboard shortcuts",
          icon: <Keyboard aria-hidden="true" size={16} />,
          onSelect: openShortcuts,
        },
        {
          label: "Sign out",
          icon: <LogOut aria-hidden="true" size={16} />,
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
  // One stream of run events for the tenant on screen, for every screen of the tab.
  useTenantStream(tenantId);

  const known = me.tenants.find((candidate) => candidate.id === tenantId);
  // An operator is not a member of most tenants, so the name comes from the tenant record.
  const fetched = useLoad<{ name: string }>(tenantId && !known ? `/tenants/${tenantId}` : null);
  const tenant = known ?? fetched.data;
  const workspaces = useLoad<{ items: WorkspaceSummary[] }>(
    tenantId ? `/tenants/${tenantId}/workspaces` : null,
  );
  const workspace = workspaces.data?.items.find((candidate) => candidate.id === workspaceId);
  const opened = openedAt(path);
  useRecordRecent(tenantId ?? undefined, workspaceId ?? undefined, opened?.kind, opened?.ref);
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

  const [panelOpen, togglePanel] = usePreference<boolean>("panel", true);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const openPalette = useCallback(() => setPalette(true), []);
  useCommandKey(openPalette);
  useGoTo(tenantId, workspaceId ?? undefined, openPalette);
  const [filter, setFilter] = useState("");

  // The workspace the rail's areas belong to: the one open, or the one last open.
  const lastWs = tenantId ? (workspaceId ?? lastWorkspace(tenantId)) : null;
  // An area of the rail that was pressed. Its sections are shown and nothing else changes,
  // until one is chosen, the area is pressed again, or the person goes somewhere.
  const [revealed, setRevealed] = useState<Area>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: going anywhere puts it away
  useEffect(() => setRevealed(undefined), [path]);
  const reveal = revealed && lastWs ? { area: revealed, workspaceId: lastWs } : undefined;
  const panel = panelFor(
    where,
    me,
    { workspace: wsCounts.data, tenant: tenantCounts.data },
    reveal,
  );
  // The overview is one screen, and an editor wants the width: neither has a panel.
  const hasPanel = where.area !== "overview" && !where.editor;
  const showPanel = hasPanel && panelOpen;
  // Where the panel is docked the revealed sections take its place. Where it is not (an
  // editor, the overview, a narrower screen), they come out beside the rail, over the page.
  const docksPanel = useWide(WIDE.panel);
  const hasRail = useWide(WIDE.rail);
  const flyout = Boolean(reveal) && hasRail && !drawer && !(showPanel && docksPanel);
  const flown = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!flyout) return;
    // Its first section takes focus, so the keyboard goes on from the area that was pressed.
    const focus = requestAnimationFrame(() => flown.current?.querySelector("a")?.focus());
    const away = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (flown.current?.contains(target) || target?.closest("[data-rail-area]")) return;
      setRevealed(undefined);
    };
    document.addEventListener("pointerdown", away);
    return () => {
      cancelAnimationFrame(focus);
      document.removeEventListener("pointerdown", away);
    };
  }, [flyout]);
  // Esc puts the sections away, unless something over the page is open: that closes first.
  // One that is already on its way out (`data-closed`) is not in the way.
  useShortcut("close", () => {
    const over = '[role="dialog"]:not([data-closed]), [role="menu"]:not([data-closed])';
    if (!flyout || document.querySelector(over)) return false;
    setRevealed(undefined);
  });

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

  // The tab's title says where this is: what is open, the section, the workspace, the product.
  const named = useNamedObject();
  const fresh = /\/(script|flow)s\/new$/.exec(path);
  // The breadcrumb: the section, and what is open in it when something is.
  const sectionHref = workspaceId
    ? `/t/${tenantId}/workspaces/${workspaceId}/${where.section}`
    : tenantId
      ? `/t/${tenantId}/${where.section}`
      : undefined;
  // Whatever an editor has open is a crumb, so that its section is always a way back. A screen
  // that has not named what it shows yet is named by the end of its address in the meantime.
  const unnamed = where.editor
    ? decodeURIComponent(path.split("/").slice(6).join("/")).replace(/^(edit|new)\//, "") ||
      undefined
    : undefined;
  const object =
    named ??
    opened?.ref ??
    (fresh ? `New ${fresh[1]}` : undefined) ??
    (unnamed && /^[0-9a-f-]{36}$/.test(unnamed) ? "…" : unnamed);
  const title = pageTitle([
    object,
    here ?? AREA_LABEL[where.area],
    workspace?.name ?? tenant?.name,
    brand.productName,
  ]);
  useEffect(() => {
    document.title = title;
  }, [title]);

  // A new page takes focus to its heading, so a screen reader starts there. The
  // same page refining its address (a filter, a first save) keeps focus where it is.
  const main = useRef<HTMLElement>(null);
  useRestoredScroll(main, "main");
  const shownPath = useRef(path);
  useEffect(() => {
    // The first page keeps the browser's own focus; so does the same page refining its address.
    if (path === shownPath.current) return;
    shownPath.current = path;
    if (navigationKind() === "replace") return;
    const frame = requestAnimationFrame(() => {
      const heading = main.current?.querySelector<HTMLElement>("h1");
      const target = heading ?? main.current;
      if (!target) return;
      if (heading && !heading.hasAttribute("tabindex")) heading.tabIndex = -1;
      target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [path]);

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
      // A tab of End users since phase 18, and still found by its name.
      list.push({
        key: "t-end-user-groups",
        label: "End-user groups",
        where: tenant?.name ?? "Tenant",
        to: `/t/${tenantId}/end-user-groups`,
        icon: UsersRound,
      });
    }
    for (const one of me.tenants)
      list.push({
        key: `tenant-${one.id}`,
        label: one.name,
        where: "Tenant",
        to: `/t/${one.id}`,
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

  const rail = (onGo?: () => void, inDrawer = false) => (
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
              {...(lastWs && area in WORKSPACE_SECTIONS && sectionsOf(area) > 1
                ? {
                    revealed: revealed === area,
                    // Pressed again, or pressed where the person already is with its
                    // sections in view, it puts them away.
                    onReveal: () =>
                      setRevealed((before) =>
                        before === area ||
                        (!before && where.area === area && showPanel && docksPanel && !inDrawer)
                          ? undefined
                          : area,
                      ),
                  }
                : {})}
            />
          ))
        : null}
      {tenantId ? <span aria-hidden="true" className="my-2 h-px w-6 bg-line" /> : null}
      {tenantId ? (
        <RailItem
          to={`/t/${tenantId}`}
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
  const failed = ws?.failedRuns?.count ?? 0;
  const drafts = ws?.drafts ?? 0;

  return (
    <div className="relative flex h-full min-h-0">
      <a
        href="#main"
        className="sr-only layer-skip rounded-control border border-line bg-surface font-medium text-action shadow-overlay focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <nav
        aria-label="Main"
        className="hidden w-16 shrink-0 flex-col items-center gap-1 border-line border-r bg-structure py-3 md:flex"
      >
        <Link to="/" className="mb-4 flex no-underline">
          <BrandMark />
        </Link>
        {rail()}
        <div className="flex-1" />
        <ThemeMenu compact />
        <div className="mt-2">
          <AccountMenu me={me} onSignOut={onSignOut} />
        </div>
      </nav>

      <Appear
        open={flyout}
        ref={flown}
        className="absolute inset-y-0 left-16 layer-sheet hidden w-56 flex-col border-line border-r bg-structure shadow-overlay transition-[opacity,translate] motion-base data-[ending-style]:-translate-x-2 data-[starting-style]:-translate-x-2 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 md:flex"
      >
        <nav aria-label="Sections" className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center border-line border-b px-4">
            <span className="truncate font-semibold">{panel.title}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <SectionList groups={panel.groups} filter="" onGo={() => setRevealed(undefined)} />
          </div>
        </nav>
      </Appear>

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
              <PanelLeftClose aria-hidden="true" size={16} />
            </button>
          </div>
          <div className="px-3 pt-3 pb-1.5">
            <label className="flex h-[30px] items-center gap-2 rounded-control border border-line px-3 text-ink-subtle focus-within:border-line-strong">
              <Search aria-hidden="true" size={14} />
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
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-line border-b bg-canvas pr-3 pl-2 md:pr-4 md:pl-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              aria-label="Open the menu"
              onClick={() => setDrawer(true)}
              className="flex size-8 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-surface hover:text-ink md:hidden"
            >
              <MenuIcon aria-hidden="true" size={16} />
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
                <PanelLeftOpen aria-hidden="true" size={16} />
              </button>
            ) : null}
            <nav
              aria-label="Where you are"
              className="flex min-w-0 items-center gap-2 overflow-hidden text-body-sm whitespace-nowrap"
            >
              {tenantId && workspaceId ? (
                <>
                  <Link
                    to={`/t/${tenantId}`}
                    className="hidden truncate text-ink-muted no-underline underline-offset-2 hover:text-ink hover:underline lg:inline"
                  >
                    {tenant?.name ?? "Tenant"}
                  </Link>
                  <span aria-hidden="true" className="hidden items-center lg:flex">
                    <Wire />
                    <Junction
                      kind={workspace?.type === "production" ? "production" : "here"}
                      size={5}
                    />
                    <Wire width={6} />
                  </span>
                  {/* The whole name is the way to another workspace: nobody has to aim for the arrows. */}
                  <Menu
                    ariaLabel="Switch workspace"
                    triggerClassName="flex min-w-0 items-center gap-1 rounded-control border border-line py-[3px] pr-1.5 pl-2 font-medium text-ink hover:bg-surface"
                    label={
                      <>
                        <span className="truncate">{workspace?.name ?? "Workspace"}</span>
                        <ChevronsUpDown
                          aria-hidden="true"
                          size={14}
                          className="shrink-0 text-ink-subtle"
                        />
                      </>
                    }
                    items={(workspaces.data?.items ?? []).map((one) => ({
                      label: one.name,
                      detail: <EnvTag type={one.type} />,
                      current: one.id === workspaceId,
                      onSelect: () =>
                        void switchWorkspace(tenantId, workspaceId, one.id, where.section),
                    }))}
                  />
                  {workspace ? <EnvTag type={workspace.type} /> : null}
                  {workspace?.triggersPaused ? (
                    <span className="hidden lg:inline-flex">
                      <StatePill state="paused" />
                    </span>
                  ) : null}
                  {ws?.linked ? (
                    <span className="hidden items-center gap-2 lg:flex">
                      <span aria-hidden="true" className="flex items-center gap-1">
                        <Wire dashed width={14} />
                        <Junction
                          kind={ws.linked.type === "production" ? "production" : "plain"}
                          size={5}
                        />
                      </span>
                      <span className="text-ink-subtle">
                        promotes to{" "}
                        <Link
                          to={`/t/${tenantId}/workspaces/${ws.linked.id}/overview`}
                          className="text-ink-muted underline underline-offset-2"
                        >
                          {ws.linked.name}
                        </Link>
                      </span>
                    </span>
                  ) : null}
                  {here ? <Crumbs section={here} href={sectionHref} object={object} /> : null}
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
                          size={14}
                          className="shrink-0 text-ink-subtle"
                        />
                      </>
                    }
                    items={[
                      ...me.tenants.map((one) => ({
                        label: one.name,
                        current: one.id === tenantId,
                        onSelect: () => navigate(`/t/${one.id}`),
                      })),
                      {
                        label: "All tenants",
                        separated: me.tenants.length > 0,
                        onSelect: () => navigate("/"),
                      },
                    ]}
                  />
                  <span className="hidden sm:inline-flex">
                    <Tag>Tenant</Tag>
                  </span>
                  {here ? <Crumbs section={here} href={sectionHref} object={object} /> : null}
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
                      <Tag tone="neutral">Instance · operator</Tag>
                    ) : where.area === "account" ? (
                      <Tag>Personal</Tag>
                    ) : null}
                  </span>
                </>
              )}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {tenantId ? <OperatorMark /> : null}
            {tenantId ? <LiveIndicator /> : null}
            {tenantId && workspaceId && drafts > 0 ? (
              <Link
                to={`/t/${tenantId}/workspaces/${workspaceId}/release`}
                className="hidden h-7 items-center gap-1.5 rounded-control border border-line px-3 text-meta text-ink no-underline hover:bg-surface lg:flex"
              >
                <Junction kind="pending" size={5} />
                <span className="font-mono">{drafts}</span> draft{drafts === 1 ? "" : "s"}
                <span className="text-action">Review</span>
              </Link>
            ) : null}
            {tenantId && workspaceId && failed > 0 ? (
              <Link
                to={`/t/${tenantId}/workspaces/${workspaceId}/runs?status=failed`}
                className="hidden h-7 items-center gap-1.5 rounded-control border border-danger/40 px-3 text-meta text-ink no-underline hover:bg-danger-soft sm:flex"
              >
                <CircleX aria-hidden="true" size={14} className="text-danger" />
                <span className="font-mono">{failed}</span> failed run{failed === 1 ? "" : "s"}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={openPalette}
              aria-label="Search or jump to"
              className="flex h-8 items-center gap-2 rounded-control text-meta text-ink-subtle hover:text-ink md:h-7 md:w-56 md:border md:border-line md:bg-structure md:pr-1.5 md:pl-3"
            >
              <Search aria-hidden="true" size={16} className="mx-1.5 md:mx-0" />
              <span className="hidden flex-1 text-left md:inline">Search or jump to…</span>
              <kbd className="hidden rounded-inner border border-line px-1 font-mono text-tag md:inline">
                ⌘K
              </kbd>
            </button>
          </div>
        </header>
        {/* The third mark of production, under every screen of it: a rule in production's amber. */}
        {workspace?.type === "production" ? (
          <div data-production-rule="" aria-hidden="true" className="h-0.5 shrink-0 bg-attention" />
        ) : null}
        {tenantId ? <OperatorStrip /> : null}

        <main
          id="main"
          ref={main}
          tabIndex={-1}
          className={`relative flex min-h-0 outline-none flex-1 flex-col bg-canvas ${where.workbench ? "overflow-hidden" : "overflow-auto"}`}
        >
          {where.workbench ? (
            <ErrorBoundary resetOn={path} what="This page">
              {children}
            </ErrorBoundary>
          ) : (
            <div
              className={`w-full px-4 md:px-8 ${
                where.editor
                  ? "py-4"
                  : // An overview takes a wide screen's room for a third column; other pages keep a reading width.
                    `mx-auto py-6 ${where.area === "overview" ? "max-w-[1440px] 3xl:max-w-[1920px]" : "max-w-[1440px]"}`
              }`}
            >
              <ErrorBoundary resetOn={path} what="This page">
                {children}
              </ErrorBoundary>
            </div>
          )}
        </main>
      </div>

      <SideSheet
        open={drawer}
        onClose={() => {
          setDrawer(false);
          setRevealed(undefined);
        }}
        side="left"
        size="narrow"
        title={
          <span className="flex items-center gap-2">
            <BrandMark size={24} decorative />
            {brand.productName}
          </span>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-1 md:hidden">{rail(() => setDrawer(false), true)}</div>
          {hasPanel || reveal ? (
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

      <ErrorBoundary what="The command palette" compact>
        <CommandPalette
          open={palette}
          onClose={() => setPalette(false)}
          destinations={destinations}
          tenantId={tenantId ?? undefined}
          workspaceId={workspaceId ?? undefined}
          workspaceType={workspace?.type}
          workspaces={(workspaces.data?.items ?? []).map((one) => ({ id: one.id, name: one.name }))}
        />
      </ErrorBoundary>
      <ErrorBoundary what="The shortcut list" compact>
        <ShortcutSheet />
      </ErrorBoundary>
    </div>
  );
}

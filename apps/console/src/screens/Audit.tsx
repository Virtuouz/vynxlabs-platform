import { Button, JsonView, Notice } from "@volvel/ui";
import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { copyText } from "../ask.tsx";
import { actionWords, targetTypeWords } from "../audit-words.ts";
import { useAddressBox } from "../kit/addressBox.ts";
import { type CollectionColumn, CollectionView } from "../kit/CollectionView.tsx";
import { stamp } from "../kit/format.ts";
import { Inspector, KeyValues, SectionLabel, useWide, WIDE } from "../kit/layout.tsx";
import { Tag, type TagTone } from "../kit/status.tsx";
import { Time } from "../kit/Time.tsx";
import { Truncate } from "../kit/Truncate.tsx";
import { ColumnsMenu, ViewsMenu } from "../kit/views.tsx";
import { Link, useUrlState } from "../router.tsx";

interface Entry {
  id: string;
  occurredAt: string;
  actorType: string;
  actorId: string | null;
  actorLabel: string | null;
  accessGrantId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  targetLabel?: string | null;
  workspaceId?: string | null;
  /** Set on an entry of the instance's log that belongs to a tenant that has been deleted. */
  tenantId?: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

/** The areas of a tenant's log a person can narrow to. Each is the word an action starts with. */
const TENANT_AREAS: [string, string][] = [
  ["", "Everything"],
  ["member", "Members and sign-ins"],
  ["tenant_member", "Tenant membership"],
  ["group", "Groups"],
  ["service_account", "Service accounts"],
  ["api_key", "API keys"],
  ["role", "Roles"],
  ["binding", "Access"],
  ["access_grant", "Operator access"],
  ["end_user", "End users"],
  ["app_session", "Sign-ins to apps"],
  ["workspace", "Workspaces"],
  ["resource", "Resources"],
  ["secret", "Secrets"],
  ["connection", "Connections"],
  ["variable", "Variables"],
  ["data_source", "Data sources"],
  ["bundle", "Bundles"],
  ["deployment", "Deployments"],
  ["run", "Runs"],
  ["flow", "Flows"],
  ["flow_run", "Flow runs"],
  ["event", "Events"],
  ["table", "Tables"],
  ["file", "Files"],
  ["portal", "Branding and portal"],
  ["app_domain", "Hostnames"],
  ["worker_credential", "Worker credentials"],
  ["worker_pool", "Worker pools"],
  ["promotion", "Promotions"],
  ["dashboard", "Dashboards"],
  ["git_repository", "Git repositories"],
  ["access", "Access checks"],
  ["trigger", "Triggers"],
  ["schedule", "Schedules"],
  ["approval", "Approvals"],
  ["workspace_git", "Workspace repositories"],
  ["page_action", "Page actions"],
  ["alert", "Alerts"],
  ["bundle_asset", "Bundle assets"],
  ["end_user_group", "End user groups"],
  ["connection_group", "Connection groups"],
  ["group_member", "Group members"],
  ["sql", "SQL"],
  ["tenant", "Tenant"],
];

/** The areas of the instance's own log: what operators do, not what happens inside a tenant. */
const INSTANCE_AREAS: [string, string][] = [
  ["", "Everything"],
  ["member", "Members and sign-ins"],
  ["binding", "Instance access"],
  ["api_key", "API keys"],
  ["operator", "Operator access"],
  ["access_grant", "Operator access grants"],
  ["tenant", "Tenants"],
  ["tenant_import", "Tenant imports"],
  ["instance", "Instance settings"],
  ["identity_provider", "Identity providers"],
  ["identity_domain", "Identity domains"],
  ["identity_link", "Identity links"],
  ["sso", "Single sign-on"],
  ["scim", "Directory sync"],
  ["scim_token", "Directory sync tokens"],
  ["database_location", "Database locations"],
];

/** The words an area can be, for the log of a tenant or of the instance. */
export const auditAreas = (tenantLog: boolean) =>
  (tenantLog ? TENANT_AREAS : INSTANCE_AREAS).map(([value]) => value).filter(Boolean);

type Verb = "Create" | "Update" | "Delete" | "Execute" | "Read" | "Other";
const VERB_TONE: Record<Verb, TagTone> = {
  Create: "neutral",
  Update: "neutral",
  Delete: "danger",
  Execute: "neutral",
  Read: "neutral",
  Other: "neutral",
};
const VERBS: [Verb, RegExp][] = [
  ["Delete", /(deleted|removed|revoked|ended|purged|retired|unbound|cleared)$/],
  ["Create", /(created|added|invited|issued|registered|uploaded|imported|opened|bound|cloned)$/],
  [
    "Execute",
    /(started|cancelled|decided|approved|rejected|deployed|activated|promoted|published|exported|signed_in|signed_out|handed_off|checked|requested|finished)$/,
  ],
  ["Read", /(read|viewed|listed|downloaded|access)$/],
  [
    "Update",
    /(updated|changed|saved|set|renamed|enabled|disabled|paused|resumed|verified|replaced)$/,
  ],
];

/** What kind of thing an action did, read from how its name ends. */
export function verbOf(action: string): Verb {
  const last = action.split(".").at(-1) ?? "";
  return VERBS.find(([, pattern]) => pattern.test(last))?.[0] ?? "Other";
}

const who = (entry: Entry) =>
  entry.actorLabel ??
  (entry.actorId ? `${entry.actorType} ${entry.actorId.slice(-8)}` : entry.actorType);

const SINCE: { value: string; label: string; hours: number | null }[] = [
  { value: "all", label: "Any time", hours: null },
  { value: "24h", label: "Last 24 hours", hours: 24 },
  { value: "7d", label: "Last 7 days", hours: 24 * 7 },
  { value: "30d", label: "Last 30 days", hours: 24 * 30 },
  { value: "custom", label: "Between dates", hours: null },
];

/** A day typed in a date field, as the start or the end of that day where the reader is. */
const startOfDay = (day: string) => new Date(`${day}T00:00:00`);
const endOfDay = (day: string) => new Date(`${day}T23:59:59.999`);

/** What the log holds in the range shown, to narrow it by. */
interface Facets {
  actions: { value: string; count: number }[];
  actors: { type: string; id: string | null; label: string | null; count: number }[];
  targetTypes: { value: string; count: number }[];
}

const OPERATOR_ACCESS = "operator.access";

/**
 * What an entry was done to, in words. An operator's first request into a tenant is
 * recorded with the request itself as its target ("PUT /api/v1/tenants/…"), which
 * is for the log's reader to open, not to read in a column.
 */
export function targetName(
  entry: Pick<Entry, "action" | "targetLabel" | "targetId" | "targetType">,
) {
  if (entry.action === OPERATOR_ACCESS) return "the tenant's API";
  return entry.targetLabel ?? entry.targetId ?? entry.targetType;
}

/** Where an entry's target is in the console, when it has a page. */
function targetHref(entry: Entry, tenantId: string | undefined): string | undefined {
  if (!tenantId || !entry.targetId) return undefined;
  const ws = entry.workspaceId ? `/t/${tenantId}/workspaces/${entry.workspaceId}` : undefined;
  switch (entry.targetType) {
    case "workspace":
      return `/t/${tenantId}/workspaces/${entry.targetId}/overview`;
    case "member":
      return `/t/${tenantId}/members?member=${entry.targetId}`;
    case "secret":
      return ws ? `${ws}/secrets/${entry.targetId}` : undefined;
    case "run":
    case "flow_run":
      return ws ? `${ws}/runs/${entry.targetId}` : undefined;
    case "resource":
      return ws ? `${ws}/resources/edit/${entry.targetId}` : undefined;
    default:
      return undefined;
  }
}

const AUDIT_URL = {
  area: { type: "string" },
  since: { type: "string", default: "all" },
  actor: { type: "string" },
  action: { type: "string" },
  kind: { type: "string" },
  from: { type: "string" },
  to: { type: "string" },
  workspace: { type: "string" },
  about: { type: "string" },
  q: { type: "string" },
  cols: { type: "list" },
  entry: { type: "string", push: true },
} as const;

/**
 * The audit log, newest first. Every filter is the server's, so it searches
 * the whole log the tenant keeps, not only what is loaded: the area, the time,
 * who acted, the action, the kind of target, and text. What can be chosen
 * comes from the log itself. The filters and the entry open are in the
 * address, so a link to an entry opens it; the same list is a CSV file.
 */
export function AuditTable({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}) {
  const [url, setUrl] = useUrlState(AUDIT_URL);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<ApiError>();
  const [loaded, setLoaded] = useState(false);
  const [closed, setClosed] = useState(false);
  const [moreOpen, setMoreOpen] = useState<boolean>();
  const [linked, setLinked] = useState<Entry>();
  const wide = useWide(WIDE.inspector);
  const tenantId = /^\/tenants\/([^/]+)/.exec(path)?.[1];
  // Only a tenant's log has workspaces and saved views.
  const tenantLog = tenantId !== undefined;

  // The text searched reaches the address, and the server, once typing pauses.
  const [typed, setTyped] = useAddressBox(
    url.q,
    (text) => text ?? "",
    (text) => text.trim() || undefined,
    (next) => setUrl({ q: next }),
  );

  const filters = new URLSearchParams();
  if (url.area) filters.set("area", url.area);
  const hours = SINCE.find((one) => one.value === url.since)?.hours;
  if (hours) {
    // To the hour, so the address of the same range stays the same for an hour.
    const from = new Date(Date.now() - hours * 3_600_000);
    from.setMinutes(0, 0, 0);
    filters.set("from", from.toISOString());
  }
  if (url.since === "custom") {
    if (url.from) filters.set("from", startOfDay(url.from).toISOString());
    if (url.to) filters.set("to", endOfDay(url.to).toISOString());
  }
  if (url.workspace && tenantLog) filters.set("workspaceId", url.workspace);
  if (url.about) filters.set("target", url.about);
  if (url.actor) filters.set("actorId", url.actor);
  if (url.action) filters.set("action", url.action);
  if (url.kind) filters.set("targetType", url.kind);
  if (url.q) filters.set("q", url.q);
  const asked = filters.toString();
  const facets = useLoad<Facets>(`${path}-facets?${asked}`);
  const workspaces = useLoad<{ items: { id: string; name?: string }[] }>(
    tenantLog ? `/tenants/${tenantId}/workspaces` : null,
  );

  // Each first page asked for is the newest; an answer to an earlier one, or to one before the
  // filters changed, is not shown.
  const latest = useRef(0);
  const load = async (from: string | null) => {
    if (!from) latest.current += 1;
    const mine = latest.current;
    try {
      const query = new URLSearchParams(asked);
      query.set("limit", "50");
      if (from) query.set("cursor", from);
      const page = await api.get<{ items: Entry[]; nextCursor: string | null }>(`${path}?${query}`);
      if (mine !== latest.current) return;
      setEntries((current) => (from ? [...current, ...page.items] : page.items));
      setCursor(page.nextCursor);
      setError(undefined);
    } catch (caught) {
      if (mine !== latest.current) return;
      setError(caught as ApiError);
    }
    setLoaded(true);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: the first page is loaded again when the filters change
  useEffect(() => {
    load(null);
  }, [path, asked]);

  // An entry linked to that is not among those loaded is fetched by itself.
  useEffect(() => {
    if (!url.entry || entries.some((entry) => entry.id === url.entry)) return;
    let current = true;
    api.get<Entry>(`${path}/${url.entry}`).then(
      (entry) => current && setLinked(entry),
      () => current && setLinked(undefined),
    );
    return () => {
      current = false;
    };
  }, [url.entry, entries, path]);

  const chosen = closed
    ? undefined
    : (entries.find((entry) => entry.id === url.entry) ??
      (linked?.id === url.entry ? linked : undefined) ??
      (wide && !url.entry ? entries[0] : undefined));
  const choose = (entry: Entry) => {
    setUrl({ entry: entry.id });
    setClosed(false);
  };
  const custom = url.since === "custom";
  const backwards = custom && url.from && url.to && url.to < url.from;
  const filtered = Boolean(
    url.area ||
      url.actor ||
      url.action ||
      url.kind ||
      url.q ||
      url.about ||
      url.workspace ||
      hours ||
      (custom && (url.from || url.to)),
  );
  const aboutName =
    entries.find((entry) => entry.targetId === url.about)?.targetLabel ?? url.about ?? "";
  // The filters that are used less sit behind one control that says how many are set, so the first
  // row holds the same few whatever the labels are. All are in the address (GOV-P8).
  const moreSet = [url.actor, url.action, url.kind].filter(Boolean).length;
  const moreShown = moreOpen ?? moreSet > 0;
  const select = "h-8 rounded-control border border-line bg-surface px-2 text-ink";

  const columns: CollectionColumn<Entry>[] = [
    {
      header: "When",
      cell: (entry) => (
        <button
          type="button"
          className="font-mono text-code whitespace-nowrap text-ink-muted"
          aria-label={`Open the entry of ${stamp(entry.occurredAt)}`}
          onClick={(event) => {
            event.stopPropagation();
            choose(entry);
          }}
        >
          {stamp(entry.occurredAt)}
        </button>
      ),
    },
    {
      header: "Who",
      priority: 2,
      cell: (entry) => <span className="block max-w-48 truncate text-ink-muted">{who(entry)}</span>,
    },
    {
      header: "What was done",
      cell: (entry) => {
        const kind = verbOf(entry.action);
        return (
          <span className="flex flex-wrap items-center gap-1.5">
            {kind === "Other" ? null : <Tag tone={VERB_TONE[kind]}>{kind}</Tag>}
            <span className="font-medium">{actionWords(entry.action)}</span>
            <code className="rounded-inner bg-sunken px-1.5 py-0.5 font-mono text-code-sm text-ink-subtle">
              {entry.action}
            </code>
            {entry.accessGrantId ? <Tag tone="attention">Operator</Tag> : null}
            {entry.tenantId && !tenantLog ? (
              <span title={`Tenant ${entry.tenantId}, which has been deleted`}>
                <Tag>Deleted tenant</Tag>
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      header: "To",
      priority: 3,
      cell: (entry) => {
        const name = targetName(entry);
        const href = targetHref(entry, tenantId);
        const mono = !entry.targetLabel && entry.action !== OPERATOR_ACCESS;
        return href ? (
          <Link to={href} className="block max-w-56 text-action">
            <Truncate mode="middle">{name}</Truncate>
          </Link>
        ) : (
          <span className={`block max-w-56 ${mono ? "font-mono text-code" : ""}`}>
            <Truncate mode="middle">{name}</Truncate>
          </span>
        );
      },
    },
  ];

  const older = cursor ? (
    <Button size="small" onClick={() => load(cursor)}>
      Show older entries
    </Button>
  ) : undefined;
  return (
    <CollectionView<Entry>
      title={title}
      description={description}
      label="Audit entries"
      // How the list is shown sits with what is done with it, beside the title: in the filters'
      // row it took a row of its own once they filled it (P4-1).
      actions={
        <span className="flex items-center gap-2">
          <ColumnsMenu
            columns={columns.slice(1).map((column) => ({
              key: column.key ?? column.header,
              label: column.header,
            }))}
            shown={url.cols.length > 0 ? url.cols : undefined}
            onChange={(next) => setUrl({ cols: next ?? [] })}
          />
          {tenantId ? <ViewsMenu tenantId={tenantId} list="audit" omit={["entry"]} /> : null}
          <Button
            size="small"
            href={`/api/v1${path}-export?${asked}`}
            download
            tooltip="The file's times are in UTC, ending in Z. The list shows yours."
          >
            <Download aria-hidden="true" size={14} /> CSV
          </Button>
        </span>
      }
      toolbar={
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex w-full flex-col text-meta text-ink-muted sm:w-64">
              <span className="sr-only">Search</span>
              <input
                type="search"
                value={typed}
                placeholder="An action, name, email or host"
                onChange={(event) => setTyped(event.currentTarget.value)}
                className={select}
              />
            </label>
            <label className="flex flex-col text-meta text-ink-muted">
              <span className="sr-only">Area</span>
              <select
                value={url.area ?? ""}
                onChange={(event) => setUrl({ area: event.currentTarget.value || undefined })}
                className={select}
              >
                {(tenantLog ? TENANT_AREAS : INSTANCE_AREAS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-meta text-ink-muted">
              <span className="sr-only">Since</span>
              <select
                value={url.since}
                onChange={(event) => setUrl({ since: event.currentTarget.value })}
                className={select}
              >
                {SINCE.map((one) => (
                  <option key={one.value} value={one.value}>
                    {one.label}
                  </option>
                ))}
              </select>
            </label>
            {custom ? (
              <>
                <label className="flex flex-col text-meta text-ink-muted">
                  <span className="sr-only">From date</span>
                  <input
                    type="date"
                    value={url.from ?? ""}
                    max={url.to}
                    onChange={(event) => setUrl({ from: event.currentTarget.value || undefined })}
                    className={select}
                  />
                </label>
                <label className="flex flex-col text-meta text-ink-muted">
                  <span className="sr-only">To date</span>
                  <input
                    type="date"
                    value={url.to ?? ""}
                    min={url.from}
                    onChange={(event) => setUrl({ to: event.currentTarget.value || undefined })}
                    className={select}
                  />
                </label>
              </>
            ) : null}
            {tenantLog ? (
              <label className="flex flex-col text-meta text-ink-muted">
                <span className="sr-only">Workspace</span>
                <select
                  value={url.workspace ?? ""}
                  onChange={(event) =>
                    setUrl({ workspace: event.currentTarget.value || undefined })
                  }
                  className={`${select} max-w-48`}
                >
                  <option value="">Every workspace</option>
                  {(workspaces.data?.items ?? [])
                    .filter((one) => one.name)
                    .map((one) => (
                      <option key={one.id} value={one.id}>
                        {one.name}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
            <Button
              size="small"
              aria-expanded={moreShown}
              aria-controls="audit-more-filters"
              onClick={() => setMoreOpen(!moreShown)}
            >
              More filters{moreSet > 0 ? ` (${moreSet})` : ""}
            </Button>
          </div>
          {moreShown ? (
            <div id="audit-more-filters" className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col text-meta text-ink-muted">
                <span className="sr-only">Who</span>
                <select
                  value={url.actor ?? ""}
                  onChange={(event) => setUrl({ actor: event.currentTarget.value || undefined })}
                  className={`${select} max-w-40`}
                >
                  <option value="">Anyone</option>
                  {(facets.data?.actors ?? [])
                    .filter((one) => one.id)
                    .map((one) => (
                      <option key={one.id} value={one.id ?? ""}>
                        {one.label ?? `${one.type} ${one.id?.slice(-8)}`} ({one.count})
                      </option>
                    ))}
                </select>
              </label>
              <label className="flex flex-col text-meta text-ink-muted">
                <span className="sr-only">Action</span>
                <select
                  value={url.action ?? ""}
                  onChange={(event) => setUrl({ action: event.currentTarget.value || undefined })}
                  className={`${select} max-w-40`}
                >
                  <option value="">Any action</option>
                  {(facets.data?.actions ?? []).map((one) => (
                    <option key={one.value} value={one.value}>
                      {actionWords(one.value)} ({one.count})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col text-meta text-ink-muted">
                <span className="sr-only">Done to</span>
                <select
                  value={url.kind ?? ""}
                  onChange={(event) => setUrl({ kind: event.currentTarget.value || undefined })}
                  className={`${select} max-w-48`}
                >
                  <option value="">Anything</option>
                  {(facets.data?.targetTypes ?? []).map((one) => (
                    <option key={one.value} value={one.value}>
                      {targetTypeWords(one.value)} ({one.count})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          {backwards ? (
            <p className="m-0 text-meta text-danger">The end date is before the start date.</p>
          ) : null}
          {url.about ? (
            <div className="flex flex-wrap items-center gap-2 text-ink-muted">
              <span>
                Everything about <span className="font-medium text-ink">{aboutName}</span>
              </span>
              <Button size="small" onClick={() => setUrl({ about: undefined })}>
                Show everything
              </Button>
            </div>
          ) : null}
        </div>
      }
      columns={columns}
      rows={loaded ? entries : undefined}
      rowKey={(entry) => entry.id}
      selected={chosen?.id}
      onSelect={choose}
      error={error}
      onRetry={() => void load(null)}
      table={
        filtered
          ? {
              footer: older,
              columnsShown: url.cols.length > 0 ? url.cols : undefined,
              filtered: {
                onClear: () => {
                  setTyped("");
                  setUrl({
                    area: undefined,
                    since: "all",
                    from: undefined,
                    to: undefined,
                    workspace: undefined,
                    about: undefined,
                    actor: undefined,
                    action: undefined,
                    kind: undefined,
                    q: undefined,
                  });
                },
              },
            }
          : { footer: older, columnsShown: url.cols.length > 0 ? url.cols : undefined }
      }
      empty={{ title: "Nothing recorded yet" }}
      inspector={
        <Inspector
          open={chosen !== undefined}
          label="Entry details"
          title="Entry details"
          eyebrow={chosen ? stamp(chosen.occurredAt) : undefined}
          onClose={() => {
            setClosed(true);
            setUrl({ entry: undefined });
          }}
          footer={
            chosen ? (
              <div className="flex flex-wrap gap-2">
                {chosen.targetId ? (
                  <Button
                    size="small"
                    onClick={() => {
                      setClosed(false);
                      setUrl({ about: chosen.targetId ?? undefined, entry: undefined });
                    }}
                  >
                    Everything about this
                  </Button>
                ) : null}
                {tenantLog ? (
                  <Button
                    size="small"
                    onClick={() => {
                      const link = new URL(location.href);
                      link.searchParams.set("entry", chosen.id);
                      void copyText(link.toString(), "Link to the entry copied.");
                    }}
                  >
                    Copy a link to it
                  </Button>
                ) : null}
              </div>
            ) : undefined
          }
        >
          {chosen ? (
            <div className="flex flex-col gap-4">
              <KeyValues
                rows={[
                  { label: "When", value: <Time value={chosen.occurredAt} />, mono: true },
                  { label: "Who", value: who(chosen) },
                  { label: "Action", value: chosen.action, mono: true },
                  { label: "Kind", value: targetTypeWords(chosen.targetType) },
                  ...(chosen.targetLabel ? [{ label: "Name", value: chosen.targetLabel }] : []),
                  { label: "ID", value: chosen.targetId ?? "", mono: true },
                  { label: "From", value: chosen.ipAddress ?? "", mono: true },
                  { label: "Request", value: chosen.requestId ?? "", mono: true },
                ]}
              />
              {chosen.accessGrantId ? (
                <Notice tone="attention">Done by an operator under an access grant.</Notice>
              ) : null}
              <div className="flex flex-col gap-1.5">
                <SectionLabel>Details</SectionLabel>
                {Object.keys(chosen.details ?? {}).length === 0 ? (
                  <p className="m-0 text-ink-muted">Nothing more was recorded.</p>
                ) : (
                  <JsonView label="Details" value={chosen.details} maxHeight="22rem" />
                )}
              </div>
            </div>
          ) : null}
        </Inspector>
      }
    />
  );
}

import { Badge, type BadgeTone, Button, JsonView, Notice } from "@vynxlabs/ui";
import { useEffect, useState } from "react";
import { type ApiError, api } from "../api.ts";
import { type CollectionColumn, CollectionView } from "../kit/CollectionView.tsx";
import { FilterChips, Inspector, KeyValues, SectionLabel, useWide, WIDE } from "../kit/layout.tsx";

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
  details: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

/** The areas of the log a person can narrow to. Each is the word an action starts with. */
const AREAS: [string, string][] = [
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
  ["tenant", "Tenant"],
];

type Verb = "Create" | "Update" | "Delete" | "Execute" | "Read" | "Other";
const VERB_TONE: Record<Verb, BadgeTone> = {
  Create: "success",
  Update: "attention",
  Delete: "danger",
  Execute: "action",
  Read: "neutral",
  Other: "neutral",
};
const VERBS: [Verb, RegExp][] = [
  ["Delete", /(deleted|removed|revoked|ended|purged|retired|unbound|cleared|disabled)$/],
  ["Create", /(created|added|invited|issued|registered|uploaded|imported|opened|bound|cloned)$/],
  [
    "Execute",
    /(started|cancelled|decided|approved|rejected|deployed|activated|promoted|published|exported|signed_in|signed_out|handed_off|checked|requested|finished)$/,
  ],
  ["Read", /(read|viewed|listed|downloaded|access)$/],
  ["Update", /(updated|changed|saved|set|renamed|enabled|paused|resumed|verified|replaced)$/],
];

/** What kind of thing an action did, read from how its name ends. */
export function verbOf(action: string): Verb {
  const last = action.split(".").at(-1) ?? "";
  return VERBS.find(([, pattern]) => pattern.test(last))?.[0] ?? "Other";
}

const stamp = (iso: string) => {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};
const who = (entry: Entry) =>
  entry.actorLabel ??
  (entry.actorId ? `${entry.actorType} ${entry.actorId.slice(-8)}` : entry.actorType);

const SINCE: { value: string; label: string; hours: number | null }[] = [
  { value: "all", label: "Any time", hours: null },
  { value: "24h", label: "Last 24 hours", hours: 24 },
  { value: "7d", label: "Last 7 days", hours: 24 * 7 },
  { value: "30d", label: "Last 30 days", hours: 24 * 30 },
];

/**
 * The audit log, newest first, filters first: the area and time on the server,
 * the kind and a search here, with one entry open in the inspector.
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
  const [entries, setEntries] = useState<Entry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<ApiError>();
  const [loaded, setLoaded] = useState(false);
  const [area, setArea] = useState("");
  const [since, setSince] = useState("all");
  const [verb, setVerb] = useState<Verb | "all">("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string>();
  const [closed, setClosed] = useState(false);
  const wide = useWide(WIDE.inspector);

  const load = async (from: string | null) => {
    try {
      const query = new URLSearchParams({ limit: "50" });
      if (area) query.set("area", area);
      const hours = SINCE.find((one) => one.value === since)?.hours;
      if (hours) query.set("from", new Date(Date.now() - hours * 3_600_000).toISOString());
      if (from) query.set("cursor", from);
      const page = await api.get<{ items: Entry[]; nextCursor: string | null }>(`${path}?${query}`);
      setEntries((current) => (from ? [...current, ...page.items] : page.items));
      setCursor(page.nextCursor);
      setError(undefined);
    } catch (caught) {
      setError(caught as ApiError);
    }
    setLoaded(true);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: the first page is loaded again when the route or a server filter changes
  useEffect(() => {
    setOpen(undefined);
    load(null);
  }, [path, area, since]);

  const needle = search.trim().toLowerCase();
  const shown = entries.filter(
    (entry) =>
      (verb === "all" || verbOf(entry.action) === verb) &&
      (needle === "" ||
        [who(entry), entry.action, entry.targetId ?? "", entry.targetType].some((text) =>
          text.toLowerCase().includes(needle),
        )),
  );
  // On a wide screen the newest entry is open beside the list; on a narrow one, only what is chosen.
  const chosen = closed
    ? undefined
    : (shown.find((entry) => entry.id === open) ?? (wide ? shown[0] : undefined));
  const counts = (one: Verb) => entries.filter((entry) => verbOf(entry.action) === one).length;
  const choose = (entry: Entry) => {
    setOpen(entry.id);
    setClosed(false);
  };

  const columns: CollectionColumn<Entry>[] = [
    {
      header: "When",
      cell: (entry) => (
        <button
          type="button"
          className="font-mono text-telemetry whitespace-nowrap text-ink-muted"
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
            {kind === "Other" ? null : <Badge tone={VERB_TONE[kind]}>{kind}</Badge>}
            <code className="rounded-[4px] bg-sunken px-1.5 py-0.5 font-mono text-telemetry">
              {entry.action}
            </code>
            {entry.accessGrantId ? <Badge tone="attention">Operator</Badge> : null}
          </span>
        );
      },
    },
    {
      header: "To",
      priority: 3,
      cell: (entry) => (
        <span className="block max-w-56 truncate font-mono text-telemetry">
          {entry.targetId ?? entry.targetType}
        </span>
      ),
    },
  ];

  return (
    <CollectionView<Entry>
      title={title}
      description={description}
      label="Audit entries"
      toolbar={
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-meta text-ink-muted">
              Area
              <select
                value={area}
                onChange={(event) => setArea(event.currentTarget.value)}
                className="h-8 rounded-control border border-line bg-surface px-2 text-ink"
              >
                {AREAS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-meta text-ink-muted">
              Since
              <select
                value={since}
                onChange={(event) => setSince(event.currentTarget.value)}
                className="h-8 rounded-control border border-line bg-surface px-2 text-ink"
              >
                {SINCE.map((one) => (
                  <option key={one.value} value={one.value}>
                    {one.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-48 flex-1 flex-col gap-1 text-meta text-ink-muted sm:max-w-80">
              Search
              <input
                type="search"
                value={search}
                placeholder="Who, action or ID"
                onChange={(event) => setSearch(event.currentTarget.value)}
                className="h-8 rounded-control border border-line bg-surface px-2 text-ink"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FilterChips<Verb | "all">
              label="Kind"
              value={verb}
              onChange={setVerb}
              options={[
                { value: "all", label: "All", count: entries.length },
                ...(["Create", "Update", "Delete", "Execute", "Read"] as const).map((one) => ({
                  value: one,
                  label: one,
                  count: counts(one),
                })),
              ]}
            />
            {cursor ? (
              <Button size="small" onClick={() => load(cursor)}>
                Show older entries
              </Button>
            ) : null}
          </div>
        </div>
      }
      columns={columns}
      rows={loaded ? shown : undefined}
      rowKey={(entry) => entry.id}
      selected={chosen?.id}
      onSelect={choose}
      error={error?.message}
      empty={{
        title: entries.length === 0 ? "Nothing recorded yet" : "Nothing of that kind",
        ...(entries.length === 0 ? {} : { text: "Change the filters above to see more." }),
      }}
      inspector={
        <Inspector
          open={chosen !== undefined}
          label="Entry details"
          title="Entry details"
          eyebrow={chosen ? stamp(chosen.occurredAt) : undefined}
          onClose={() => setClosed(true)}
        >
          {chosen ? (
            <div className="flex flex-col gap-4">
              <KeyValues
                rows={[
                  { label: "When", value: stamp(chosen.occurredAt), mono: true },
                  { label: "Who", value: who(chosen) },
                  { label: "Action", value: chosen.action, mono: true },
                  { label: "Kind", value: chosen.targetType },
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
                <JsonView label="Details" value={chosen.details} maxHeight="22rem" />
              </div>
            </div>
          ) : null}
        </Inspector>
      }
    />
  );
}

import { Badge, type BadgeTone, Button, EmptyState, Facts, JsonView, Notice } from "@vynxlabs/ui";
import { useEffect, useState } from "react";
import { type ApiError, api } from "../api.ts";
import { Page } from "../ListScreen.tsx";

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

/** The audit log, newest first: narrowed by area and kind, with one entry open beside the list. */
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
  const [verb, setVerb] = useState<Verb | "all">("all");
  const [open, setOpen] = useState<string>();

  const load = async (from: string | null) => {
    try {
      const query = new URLSearchParams({ limit: "50" });
      if (area) query.set("area", area);
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: the first page is loaded again when the route or the area changes
  useEffect(() => {
    setOpen(undefined);
    load(null);
  }, [path, area]);

  const shown = entries.filter((entry) => verb === "all" || verbOf(entry.action) === verb);
  const chosen = shown.find((entry) => entry.id === open) ?? shown[0];
  const pill = (on: boolean) =>
    `h-7 rounded-control px-2.5 text-[13px] ${on ? "bg-action-soft font-medium text-action" : "text-ink-muted hover:bg-sunken hover:text-ink"}`;

  return (
    <Page title={title} description={description}>
      {error ? <Notice tone="danger">{error.message}</Notice> : null}
      <div className="rounded-panel border border-line bg-surface">
        <div className="flex flex-wrap items-end gap-4 border-line border-b p-3">
          <label className="flex flex-col gap-1 text-[12.5px] text-ink-muted">
            Area
            <select
              value={area}
              onChange={(event) => setArea(event.currentTarget.value)}
              className="h-7 rounded-control border border-line bg-surface px-2 text-[13px] text-ink"
            >
              {AREAS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="m-0 flex flex-col gap-1 border-0 p-0 text-[12.5px] text-ink-muted">
            <legend className="mb-1 p-0">Kind</legend>
            <div className="flex flex-wrap gap-0.5 rounded-control bg-sunken p-0.5">
              {(["all", "Create", "Update", "Delete", "Execute", "Read"] as const).map((one) => (
                <button
                  key={one}
                  type="button"
                  aria-pressed={verb === one}
                  className={pill(verb === one)}
                  onClick={() => setVerb(one)}
                >
                  {one === "all" ? "All" : one}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        {!loaded ? (
          <p className="m-0 p-4 text-ink-muted">Loading…</p>
        ) : shown.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title={entries.length === 0 ? "Nothing recorded yet" : "Nothing of that kind"}
            />
          </div>
        ) : (
          <div className="grid min-w-0 lg:grid-cols-[1fr_20rem]">
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="text-[12.5px] text-ink-muted">
                    {["When", "Who", "What was done", "To"].map((header) => (
                      <th key={header} scope="col" className="px-3 py-2 font-medium">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((entry) => {
                    const kind = verbOf(entry.action);
                    const current = entry.id === chosen?.id;
                    return (
                      <tr
                        key={entry.id}
                        aria-selected={current}
                        className={`cursor-pointer border-line border-t ${current ? "bg-action-soft" : "hover:bg-sunken"}`}
                        onClick={() => setOpen(entry.id)}
                      >
                        <td className="px-3 py-2 font-mono text-[12.5px] whitespace-nowrap text-ink-muted">
                          <button
                            type="button"
                            className="font-mono"
                            aria-label={`Open the entry of ${stamp(entry.occurredAt)}`}
                            onClick={() => setOpen(entry.id)}
                          >
                            {stamp(entry.occurredAt)}
                          </button>
                        </td>
                        <td className="max-w-48 truncate px-3 py-2 text-ink-muted">{who(entry)}</td>
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-1.5 whitespace-nowrap">
                            {kind === "Other" ? null : <Badge tone={VERB_TONE[kind]}>{kind}</Badge>}
                            <code className="rounded-[4px] bg-sunken px-1.5 py-0.5 font-mono text-[12.5px]">
                              {entry.action}
                            </code>
                            {entry.accessGrantId ? <Badge tone="attention">Operator</Badge> : null}
                          </span>
                        </td>
                        <td className="max-w-56 truncate px-3 py-2 font-mono text-[12.5px]">
                          {entry.targetId ?? entry.targetType}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {chosen ? (
              <aside
                aria-label="Entry details"
                className="flex min-w-0 flex-col gap-3 border-line border-t p-4 lg:border-t-0 lg:border-l"
              >
                <h2 className="m-0 text-[13px] font-semibold">Entry details</h2>
                <Facts
                  columns={2}
                  facts={[
                    { label: "When", value: stamp(chosen.occurredAt) },
                    { label: "Who", value: who(chosen) },
                    { label: "Action", value: chosen.action, code: true },
                    { label: "Kind", value: chosen.targetType },
                    { label: "ID", value: chosen.targetId ?? "", code: true },
                    { label: "From", value: chosen.ipAddress ?? "", code: true },
                    { label: "Request", value: chosen.requestId ?? "", code: true },
                  ]}
                />
                {chosen.accessGrantId ? (
                  <Notice tone="attention">Done by an operator under an access grant.</Notice>
                ) : null}
                <div className="flex flex-col gap-1.5">
                  <h3 className="m-0 text-[12.5px] font-medium text-ink-muted">Details</h3>
                  <JsonView label="Details" value={chosen.details} maxHeight="22rem" />
                </div>
              </aside>
            ) : null}
          </div>
        )}
      </div>
      {cursor ? (
        <div>
          <Button onClick={() => load(cursor)}>Show older entries</Button>
        </div>
      ) : null}
    </Page>
  );
}

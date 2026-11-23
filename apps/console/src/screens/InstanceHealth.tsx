import { Button, Notice } from "@volvel/ui";
import { useCallback, useEffect, useState } from "react";
import { useLoad } from "../api.ts";
import { ago } from "../kit/format.ts";
import { ErrorState, Loading } from "../kit/LoadState.tsx";
import { KeyValues, PageHeader, Panel, SectionLabel } from "../kit/layout.tsx";
import { StatePill, Tag } from "../kit/status.tsx";

interface Check {
  ok: boolean;
  error?: string;
  readOnly?: boolean;
  latencyMs?: number;
}
interface Readiness {
  status: "ready" | "not_ready";
  checks: { database: Check; objectStore: Check };
}
interface InstanceInfo {
  coreVersion: string;
  migrationLevel: number;
}
interface MasterKey {
  masterKey: string;
  secondaryKey: string | null;
  current: Record<string, number>;
  secondary: Record<string, number>;
  unopened: { place: string; id: string }[];
  secondaryRemovable: boolean;
}
export interface ReplicaSettings {
  managedWorkers: "host" | "process" | null;
  runSlots: number | null;
  runMemoryFloorMb: number | null;
  managedWorkersMax: number | null;
  databasePoolSize: number;
  dataPoolSize: number;
  dataTenantConnections: number | null;
  dataStatementTimeoutMs: number;
  sqlStatementTimeoutMs: number;
  scheduleBacklogLimit: number;
  triggersPausedByEnvironment: boolean;
  retention: { runsDays: number; eventsDays: number; refusalsDays: number; auditDays: number };
  mail: { from: string } | { capturedToFiles: true } | null;
  publicUrl: string;
  appsAddress: "separate" | "console" | "none";
  appsUrl: string | null;
  egressAllow: { networks: string[]; hosts: string[] };
  trustedProxies: number | string[];
  metricsToken: boolean;
  metricsWorkspaceLabels: boolean;
  telemetry: boolean;
}

/** `/readyz` answers 503 when something is down, and says which: that is an answer, not a failure to read. */
function useReadiness() {
  const [state, setState] = useState<{
    data?: Readiness;
    error?: string;
    at?: number;
    loading: boolean;
  }>({ loading: true });
  const reload = useCallback(async () => {
    setState((before) => ({ ...before, loading: true }));
    try {
      const response = await fetch("/api/v1/readyz");
      const data = (await response.json()) as Readiness;
      if (!data?.checks) throw new Error("not a readiness answer");
      setState({ data, at: Date.now(), loading: false });
    } catch {
      setState({ error: "The instance did not answer.", loading: false });
    }
  }, []);
  useEffect(() => {
    void reload();
    const timer = setInterval(() => void reload(), 15_000);
    return () => clearInterval(timer);
  }, [reload]);
  return { ...state, reload };
}

const PLACES: Record<string, string> = {};
const placeName = (place: string) => PLACES[place] ?? place.replaceAll("_", " ");

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
const seconds = (ms: number) => `${ms / 1000} s`;

function Part({ name, check, extra }: { name: string; check: Check; extra?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatePill state={check.ok ? "on" : "failed"}>{check.ok ? "Answers" : "Down"}</StatePill>
      <span className="font-medium">{name}</span>
      {check.ok && check.latencyMs !== undefined ? (
        <span className="text-meta text-ink-muted">{check.latencyMs} ms</span>
      ) : null}
      {check.readOnly ? <Tag tone="danger">Takes no writes</Tag> : null}
      {!check.ok ? (
        <span className="text-meta text-ink-muted">
          {check.error ?? "It did not answer"}
          {extra ? `. ${extra}` : ""}
        </span>
      ) : null}
    </div>
  );
}

function Health() {
  const ready = useReadiness();
  const info = useLoad<InstanceInfo>("/instance");
  const data = ready.data;
  return (
    <section className="flex flex-col gap-3" aria-label="Health">
      <SectionLabel
        action={
          <Button size="small" loading={ready.loading} onClick={() => void ready.reload()}>
            Check again
          </Button>
        }
      >
        Health
      </SectionLabel>
      {ready.error ? <Notice tone="danger">{ready.error}</Notice> : null}
      {data ? (
        <Panel className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatePill state={data.status === "ready" ? "on" : "failed"}>
              {data.status === "ready" ? "Ready" : "Not ready"}
            </StatePill>
            <span className="text-meta text-ink-muted">
              {data.status === "ready"
                ? "This replica takes requests."
                : "This replica answers 503 to /readyz, so a load balancer takes it out."}
              {ready.at ? ` Checked ${ago(new Date(ready.at).toISOString())}.` : ""}
            </span>
          </div>
          <Part name="Database" check={data.checks.database} />
          {data.checks.database.readOnly ? (
            <Notice tone="attention">
              The database answers but takes no writes, such as when its disk is full. Reads are
              served and every change is refused until it takes writes again.
            </Notice>
          ) : null}
          <Part name="Object store" check={data.checks.objectStore} />
          {info.data ? (
            <KeyValues
              rows={[
                { label: "Version", value: info.data.coreVersion, mono: true },
                { label: "Migration level", value: String(info.data.migrationLevel), mono: true },
              ]}
            />
          ) : info.error ? (
            <ErrorState error={info.error} what="the version" onRetry={info.reload} />
          ) : null}
        </Panel>
      ) : ready.loading ? (
        <Loading what="health" />
      ) : null}
    </section>
  );
}

function MasterKeyStatus() {
  const key = useLoad<MasterKey>("/instance/master-key");
  const left = key.data ? Object.entries(key.data.secondary).filter(([, count]) => count > 0) : [];
  return (
    <section className="flex flex-col gap-3" aria-label="Master key">
      <SectionLabel>Master key</SectionLabel>
      {key.error ? (
        <ErrorState error={key.error} what="the master key" onRetry={key.reload} />
      ) : null}
      {key.data ? (
        <Panel className="flex flex-col gap-3 p-4">
          <KeyValues
            rows={[
              { label: "MASTER_KEY", value: key.data.masterKey, mono: true },
              {
                label: "MASTER_KEY_SECONDARY",
                value: key.data.secondaryKey ?? <span className="text-ink-subtle">Not set</span>,
                mono: key.data.secondaryKey !== null,
              },
            ]}
          />
          <p className="m-0 text-meta text-ink-muted">
            A fingerprint is the start of a hash of the key: enough to tell two keys apart and
            nothing more. Asking changes nothing.
          </p>
          {key.data.secondaryKey === null ? (
            <Notice tone="info">
              No second key is set, so no rotation is under way.{" "}
              {key.data.unopened.length > 0
                ? `${key.data.unopened.length} sealed values cannot be opened with this key.`
                : ""}
            </Notice>
          ) : key.data.secondaryRemovable ? (
            <Notice tone="success">
              Nothing is sealed with the second key any more. MASTER_KEY_SECONDARY can be removed
              from the environment.
            </Notice>
          ) : (
            <Notice tone="attention">
              Still sealed with the second key:{" "}
              {left.length > 0
                ? left.map(([place, count]) => `${count} in ${placeName(place)}`).join(", ")
                : "nothing counted"}
              {key.data.unopened.length > 0
                ? `. ${key.data.unopened.length} values open with neither key.`
                : ""}
              . Run <code>rekey</code> where the instance runs, then keep the second key until this
              says it can go.
            </Notice>
          )}
          {key.data.unopened.length > 0 ? (
            <ul className="m-0 list-disc pl-5 text-meta">
              {key.data.unopened.slice(0, 20).map((one) => (
                <li key={`${one.place}-${one.id}`}>
                  {placeName(one.place)} <span className="font-mono text-code">{one.id}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
      ) : key.loading ? (
        <Loading what="the master key" />
      ) : null}
    </section>
  );
}

const yes = (on: boolean) => (on ? "Yes" : "No");
const worked = (value: number | null, unit = "") =>
  value === null ? (
    <span className="text-ink-subtle">Not set: worked out from this machine</span>
  ) : (
    `${value}${unit}`
  );

function Replica() {
  const settings = useLoad<ReplicaSettings>("/instance/settings");
  const s = settings.data;
  return (
    <section className="flex flex-col gap-3" aria-label="This replica">
      <SectionLabel>This replica's settings</SectionLabel>
      <p className="m-0 max-w-[60rem] text-meta text-ink-muted">
        What the process that answered this page read from its environment. Another replica may be
        set differently. No secret is shown, only whether it is set.
      </p>
      {settings.error ? (
        <ErrorState error={settings.error} what="the settings" onRetry={settings.reload} />
      ) : null}
      {s ? (
        <Panel className="flex flex-col gap-4 p-4">
          <KeyValues
            rows={[
              {
                label: "Workers",
                value:
                  s.managedWorkers === "host"
                    ? "Started in a worker host"
                    : s.managedWorkers === "process"
                      ? "Started beside the control plane, for code only operators write"
                      : "None started here: standalone workers ask for work",
              },
              { label: "Run slots", value: worked(s.runSlots) },
              { label: "Memory floor", value: worked(s.runMemoryFloorMb, " MB") },
              { label: "Most workers alive", value: worked(s.managedWorkersMax) },
              {
                label: "Database pools",
                value: `${s.databasePoolSize} for the platform, ${s.dataPoolSize} for rows${
                  s.dataTenantConnections === null
                    ? ""
                    : `, ${s.dataTenantConnections} for one tenant at once`
                }`,
              },
              {
                label: "Time limits",
                value: `${seconds(s.dataStatementTimeoutMs)} for a data operation, ${seconds(s.sqlStatementTimeoutMs)} for a query`,
              },
              {
                label: "Schedule backlog",
                value:
                  s.scheduleBacklogLimit === 0
                    ? "No limit"
                    : `A schedule skips its time past ${s.scheduleBacklogLimit} queued runs`,
              },
              {
                label: "Triggers",
                value: s.triggersPausedByEnvironment
                  ? "Paused by TRIGGERS_PAUSED where the instance runs"
                  : "Not paused by the environment",
              },
            ]}
          />
          <KeyValues
            rows={[
              {
                label: "Kept: runs",
                value: days(s.retention.runsDays),
              },
              { label: "Kept: events", value: days(s.retention.eventsDays) },
              { label: "Kept: refusals", value: days(s.retention.refusalsDays) },
              { label: "Kept: audit log", value: days(s.retention.auditDays) },
            ]}
          />
          <KeyValues
            rows={[
              { label: "Address", value: s.publicUrl, mono: true },
              {
                label: "Apps",
                value:
                  s.appsAddress === "separate"
                    ? `At their own address, ${s.appsUrl ?? ""}`
                    : s.appsAddress === "console"
                      ? "At the console's address, by the operator's choice"
                      : "Not served yet: set APPS_URL",
              },
              {
                label: "Mail",
                value:
                  s.mail === null
                    ? "Not set up: nobody is mailed"
                    : "capturedToFiles" in s.mail
                      ? "Written to files, for development"
                      : `Sent from ${s.mail.from}`,
              },
              {
                label: "Reachable networks",
                value:
                  s.egressAllow.networks.length + s.egressAllow.hosts.length === 0
                    ? "Only public addresses"
                    : [...s.egressAllow.networks, ...s.egressAllow.hosts].join(", "),
              },
              {
                label: "Proxies trusted",
                value: Array.isArray(s.trustedProxies)
                  ? s.trustedProxies.join(", ")
                  : s.trustedProxies === 0
                    ? "None"
                    : `${s.trustedProxies} in front`,
              },
            ]}
          />
        </Panel>
      ) : settings.loading ? (
        <Loading what="the settings" />
      ) : null}
    </section>
  );
}

function MetricsInfo() {
  const settings = useLoad<ReplicaSettings>("/instance/settings");
  const s = settings.data;
  return (
    <section className="flex flex-col gap-3" aria-label="Metrics">
      <SectionLabel>Metrics</SectionLabel>
      <Panel className="flex flex-col gap-3 p-4">
        <p className="m-0 text-body-sm">
          <code>/api/v1/metrics</code> gives every series in Prometheus text format, each starting{" "}
          <code>volvel_</code>: runs by state, queue depth, workers and slots, request counts and
          times, database pools and the background loop. It is read by an operator's API key, or by
          a scraper that sends <code>Authorization: Bearer &lt;METRICS_TOKEN&gt;</code>.
        </p>
        {s ? (
          <KeyValues
            rows={[
              {
                label: "Scraper token",
                value: s.metricsToken
                  ? "Set (METRICS_TOKEN)"
                  : "Not set: only an operator's key reads it",
              },
              { label: "Tenant and workspace labels", value: yes(s.metricsWorkspaceLabels) },
              { label: "Also sent by OTLP", value: yes(s.telemetry) },
            ]}
          />
        ) : settings.error ? (
          <ErrorState error={settings.error} what="the settings" onRetry={settings.reload} />
        ) : (
          <Loading what="the settings" />
        )}
      </Panel>
    </section>
  );
}

export function InstanceHealth() {
  return (
    <div className="flex max-w-[60rem] flex-col gap-6">
      <PageHeader
        eyebrow="Instance"
        title="Health"
        description="Whether this replica is ready, its keys, and what it is set to."
      />
      <Health />
      <MasterKeyStatus />
      <Replica />
      <MetricsInfo />
    </div>
  );
}

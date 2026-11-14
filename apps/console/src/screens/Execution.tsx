import {
  Badge,
  type BadgeTone,
  Button,
  Dialog,
  Form,
  type FormProperty,
  type LogLine,
  Notice,
} from "@vynxlabs/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, useLoad } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { InputDialog } from "../InputDialog.tsx";
import { CollectionView } from "../kit/CollectionView.tsx";
import { FilterChips, Inspector, KeyValues } from "../kit/layout.tsx";
import { UsedBy, useReferences } from "../kit/references.tsx";
import { Mono, type RunState, StatePill, Tag } from "../kit/status.tsx";
import { CreateDialog, ListScreen, Page, RemoveButton, when } from "../ListScreen.tsx";
import { Link, navigate } from "../router.tsx";
import { useStreamConnected, useStreamEvents } from "../stream.ts";
import { fromNow } from "./Overview.tsx";

const code = (text: string) => <code className="font-mono text-[13px]">{text}</code>;

type Status = "queued" | "running" | "succeeded" | "failed" | "cancelled";
/** The badge tone of a run's state, for the run page's mark. */
const _TONE: Record<RunState, BadgeTone> = {
  queued: "neutral",
  running: "action",
  waiting_approval: "attention",
  waiting_time: "attention",
  succeeded: "success",
  failed: "danger",
  canceled: "neutral",
  skipped: "neutral",
};

export interface Run {
  id: string;
  script: string;
  status: Status;
  state: RunState;
  attempt: number;
  maxAttempts: number;
  trigger: { type: string; [detail: string]: unknown };
  bundleId: string;
  bundleVersion: number;
  error: { message: string } | null;
  errorSummary?: string | null;
  tags?: string[];
  rerunOf?: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export function took(run: Pick<Run, "startedAt" | "finishedAt">) {
  if (!run.startedAt || !run.finishedAt) return "";
  const ms = Date.parse(run.finishedAt) - Date.parse(run.startedAt);
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export const TRIGGER: Record<string, string> = {
  manual: "Started by hand",
  schedule: "Schedule",
  webhook: "Webhook",
  event: "Event",
  form: "Form",
  flow: "A flow",
  alert: "Failure handler",
  rerun: "Re-run",
  retry: "Retry",
};

interface ScriptRow {
  path: string;
  description: string;
  timeoutSeconds: number;
  inputSchema: Record<string, unknown>;
  lastRun: {
    id: string;
    status: Status;
    state: RunState;
    createdAt: string;
    error: string | null;
  } | null;
  failedInARow: number;
  ownership: string;
  retries: number;
  uses: { connections: string[]; secrets: string[]; variables: string[]; tables: string[] };
}

/** The code this workspace runs, with how each script last went and what it reaches. */
export function Scripts({
  root,
  link,
  editable,
}: {
  root: string;
  link: string;
  /** Whether scripts can be written here: true in a dev workspace. */
  editable: boolean;
}) {
  const runsLink = `${link}/runs`;
  const list = useLoad<{ items: ScriptRow[] }>(`${root}/scripts`);
  const [filter, setFilter] = useState<"all" | "failing" | "never">("all");
  const [chosen, setChosen] = useState<string>();
  const items = list.data?.items ?? [];
  const rows = items.filter(
    (row) =>
      filter === "all" ||
      (filter === "failing" && row.lastRun?.status === "failed") ||
      (filter === "never" && !row.lastRun),
  );
  const open = items.find((row) => row.path === chosen);
  const reaches = (row: ScriptRow) =>
    [...row.uses.connections, ...row.uses.tables.map((table) => `table ${table}`)].join(", ");

  return (
    <CollectionView<ScriptRow>
      title="Scripts"
      description="Code this workspace runs. Each script declares what it reaches, so a run can reach only that."
      actions={
        editable ? (
          <Button variant="primary" onClick={() => navigate(`${link}/scripts/new`)}>
            New script
          </Button>
        ) : undefined
      }
      toolbar={
        <FilterChips
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: items.length },
            {
              value: "failing",
              label: "Failing",
              count: items.filter((row) => row.lastRun?.status === "failed").length,
            },
            {
              value: "never",
              label: "Never run",
              count: items.filter((row) => !row.lastRun).length,
            },
          ]}
        />
      }
      columns={[
        {
          header: "Script",
          cell: (row) => (
            <span className="flex min-w-0 flex-col">
              <Link
                to={`${link}/scripts/edit/${row.path}`}
                className="truncate font-mono text-telemetry text-ink no-underline"
              >
                {row.path}
              </Link>
              <span className="truncate text-meta text-ink-subtle">
                {row.description || "No description"}
              </span>
            </span>
          ),
        },
        {
          header: "Uses",
          priority: 3,
          cell: (row) => (
            <span className="text-ink-muted">{reaches(row) || "Nothing outside"}</span>
          ),
        },
        {
          header: "Last run",
          priority: 2,
          cell: (row) =>
            row.lastRun ? (
              <Link to={`${runsLink}/${row.lastRun.id}`} className="flex flex-col no-underline">
                <StatePill state={row.lastRun.state} detail={fromNow(row.lastRun.createdAt)} />
                {row.failedInARow > 1 ? (
                  <span className="text-meta text-danger">{row.failedInARow} in a row</span>
                ) : null}
              </Link>
            ) : (
              <span className="text-ink-subtle">Never run</span>
            ),
        },
        {
          header: "Source",
          cell: (row) =>
            row.path.startsWith("core/") ? (
              <Tag>Platform</Tag>
            ) : row.ownership === "ui" ? (
              <Tag tone="draft">Console</Tag>
            ) : (
              <Tag tone="repository">Repository</Tag>
            ),
        },
      ]}
      rows={list.data ? rows : undefined}
      rowKey={(row) => row.path}
      selected={chosen}
      onSelect={(row) => setChosen(row.path)}
      error={list.error?.message}
      empty={{
        title: items.length > 0 ? "No script matches" : "No scripts yet",
        text:
          items.length > 0 ? (
            "Show every script instead."
          ) : editable ? (
            <>
              Write one here, or deploy them from the tenant's repository with{" "}
              <code className="font-mono">platform deploy</code>.
            </>
          ) : (
            <>
              Scripts reach production when a dev workspace is promoted here, or with{" "}
              <code className="font-mono">platform deploy</code> from the tenant's repository.
            </>
          ),
        ...(items.length === 0 && editable
          ? {
              action: (
                <Button variant="primary" onClick={() => navigate(`${link}/scripts/new`)}>
                  New script
                </Button>
              ),
            }
          : {}),
      }}
      inspector={
        open ? (
          <Inspector
            open
            label="The chosen script"
            title={open.path}
            eyebrow="Script"
            onClose={() => setChosen(undefined)}
            footer={
              <>
                <Button
                  variant="primary"
                  onClick={() => navigate(`${link}/scripts/edit/${open.path}`)}
                >
                  Open editor
                </Button>
                <RunButton
                  root={root}
                  script={open.path}
                  schema={open.inputSchema}
                  runsLink={runsLink}
                />
              </>
            }
          >
            <div className="flex flex-col gap-4">
              {open.lastRun?.status === "failed" ? (
                <Notice tone="danger">
                  {open.failedInARow > 1
                    ? `Failed ${open.failedInARow} times in a row. `
                    : "Its last run failed. "}
                  {open.lastRun.error ?? ""}
                </Notice>
              ) : null}
              <p className="m-0 text-ink-muted">{open.description || "No description."}</p>
              <KeyValues
                rows={[
                  { label: "Timeout", value: `${open.timeoutSeconds}s`, mono: true },
                  { label: "Retries", value: String(open.retries), mono: true },
                  {
                    label: "Managed in",
                    value: open.ownership === "ui" ? "The console" : "The repository",
                  },
                ]}
              />
              {(["connections", "tables", "secrets", "variables"] as const).map((kind) =>
                open.uses[kind].length > 0 ? (
                  <div key={kind} className="flex flex-col gap-1">
                    <span className="text-label text-ink-subtle uppercase">{kind}</span>
                    {open.uses[kind].map((name) => (
                      <Mono key={name}>{name}</Mono>
                    ))}
                  </div>
                ) : null,
              )}
              {open.lastRun ? (
                <Link to={`${runsLink}/${open.lastRun.id}`} className="text-meta">
                  Open the last run
                </Link>
              ) : null}
            </div>
          </Inspector>
        ) : null
      }
    />
  );
}

function RunButton({
  root,
  script,
  schema,
  runsLink,
}: {
  root: string;
  script: string;
  schema: Record<string, unknown>;
  runsLink: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="small" onClick={() => setOpen(true)}>
        Run
      </Button>
      <InputDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Run ${script}`}
        action="Run"
        schema={schema}
        onSubmit={async (input) => {
          const run = await api.post<Run>(`${root}/runs`, { script, input });
          navigate(`${runsLink}/${run.id}`);
        }}
      />
    </>
  );
}

export type LiveRun = Run & {
  input: unknown;
  output: unknown;
  alert: Record<string, unknown> | null;
  pool: string | null;
  waitingFor: string | null;
  reruns?: { id: string; state: RunState; createdAt: string }[];
};

/**
 * A run and its log lines, asked for again whenever the run changes or logs: on
 * the run event stream, or every second and a half while the stream is down.
 */
export function useLiveRun(root: string, runId: string) {
  const [run, setRun] = useState<LiveRun>();
  const [lines, setLines] = useState<LogLine[]>([]);
  const [error, setError] = useState<string>();
  const streaming = useStreamConnected();
  const shown = useRef(runId);
  const last = useRef(0);
  const done = useRef(false);
  const busy = useRef(false);
  const again = useRef(false);

  const refresh = useCallback(async () => {
    // One read at a time; one asked for meanwhile is made right after.
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    try {
      do {
        again.current = false;
        const current = await api.get<LiveRun>(`${root}/runs/${runId}`);
        const logs = await api.get<{ items: LogLine[]; done: boolean }>(
          `${root}/runs/${runId}/logs?after=${last.current}`,
        );
        if (shown.current !== runId) return;
        setRun(current);
        if (logs.items.length > 0) {
          last.current = logs.items.at(-1)?.seq ?? last.current;
          setLines((existing) => [...existing, ...logs.items]);
        }
        done.current = logs.done;
      } while (again.current);
    } catch (caught) {
      if (shown.current === runId) setError((caught as Error).message);
    } finally {
      busy.current = false;
    }
  }, [root, runId]);

  useEffect(() => {
    shown.current = runId;
    last.current = 0;
    done.current = false;
    setRun(undefined);
    setLines([]);
    setError(undefined);
    void refresh();
  }, [runId, refresh]);

  useStreamEvents(
    (event) => (event.k === "run" || event.k === "log") && event.id === runId,
    () => void refresh(),
  );
  useEffect(() => {
    if (streaming) return;
    const timer = setInterval(() => {
      if (!done.current) void refresh();
    }, 1500);
    return () => clearInterval(timer);
  }, [streaming, refresh]);
  return { run, lines, error };
}

/** A date and time to the second, in the same shape on every line so that they compare by eye. */
export const stamp = (iso: string) => {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

interface BundleRow {
  id: string;
  version: number;
  digest: string;
  sdkVersion: string;
  manifestCount: number;
  active: boolean;
  createdAt: string;
}

export function Deployments({ root }: { root: string }) {
  return (
    <ListScreen<BundleRow>
      title="Deployments"
      description="Every bundle uploaded to this workspace. Activating an earlier one is how you roll back. Runs in progress finish on the bundle they started with."
      path={`${root}/bundles`}
      rowKey={(row) => row.id}
      columns={[
        {
          header: "Version",
          cell: (row) => (
            <span className="flex items-center gap-2">
              {row.version}
              {row.active ? <Badge tone="success">Running</Badge> : null}
            </span>
          ),
        },
        { header: "Digest", cell: (row) => code(row.digest.slice(0, 12)) },
        { header: "Resources", cell: (row) => row.manifestCount, align: "end" },
        { header: "Uploaded", cell: (row) => when(row.createdAt) },
      ]}
      empty={{
        title: "Nothing has been deployed",
        text: "Deploy what was saved here from Release, promote a dev workspace into this one, or deploy from the tenant's repository with platform deploy.",
      }}
      rowActions={(row, reload) =>
        row.active ? null : (
          <Button
            size="small"
            onClick={async () => {
              const sure = await ask.confirm({
                title: `Activate version ${row.version}?`,
                text: "This replaces what the workspace is running.",
                action: "Activate",
              });
              if (!sure) return;
              try {
                await api.post(`${root}/deployments`, { bundleId: row.id });
                reload();
              } catch (error) {
                notify.error(error);
              }
            }}
          >
            Activate
          </Button>
        )
      }
    />
  );
}

interface ConnectionRow {
  path: string;
  connector: string;
  description: string;
  defined: boolean;
  bound: boolean;
  config: { baseUrl?: string; host?: string; [more: string]: unknown } | null;
  configSchema: {
    properties?: Record<
      string,
      { type?: unknown; enum?: unknown[]; maxLength?: number; [more: string]: unknown }
    >;
    required?: string[];
  };
  hasCredential: boolean;
}

const CONNECTOR_NAMES: Record<string, string> = { http: "HTTP", smtp: "Mail (SMTP)" };
const SIMPLE = new Set(["string", "number", "integer", "boolean"]);

/** The part of a connector's schema a form can be drawn from, and what it leaves out. */
export function connectionForm(row: Pick<ConnectionRow, "configSchema" | "hasCredential">) {
  const properties: Record<string, FormProperty> = {};
  const left: string[] = [];
  for (const [name, property] of Object.entries(row.configSchema.properties ?? {})) {
    // A list of values to choose from says what it is without naming a type.
    const type =
      property.type ??
      (property.enum?.every((value) => typeof value === "string") ? "string" : undefined);
    if (!SIMPLE.has(String(type))) {
      left.push(name);
      continue;
    }
    // An address or a name is one line, however long the connector lets it be. The server holds the limit.
    const { maxLength, ...rest } = property;
    properties[name] = {
      ...rest,
      type,
      ...(maxLength !== undefined && maxLength > 1000 ? { maxLength } : {}),
    } as unknown as FormProperty;
  }
  const secret = "secret" in properties ? "connection_secret" : "secret";
  properties[secret] = {
    type: "string",
    title: "Secret",
    format: "password",
    description: row.hasCredential
      ? "Leave empty to keep the stored one."
      : "The password or key, when the system asks for one. It is stored encrypted and never shown.",
  };
  return {
    secret,
    left,
    schema: {
      type: "object" as const,
      properties,
      required: (row.configSchema.required ?? []).filter((name) => name in properties),
    },
  };
}

/** Sets up a connection of a kind other than HTTP, with a form drawn from its connector's schema. */
function SetUpConnection({
  root,
  row,
  onDone,
}: {
  root: string;
  row: ConnectionRow;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const form = connectionForm(row);
  return (
    <>
      <Button size="small" onClick={() => setOpen(true)}>
        {row.bound ? "Change" : "Set up"}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Set up ${row.path}`}
        description={`A ${CONNECTOR_NAMES[row.connector] ?? row.connector} connection. What is set here applies to this workspace only.`}
      >
        {form.left.length > 0 ? (
          <div className="mb-3">
            <Notice tone="attention">
              This connector also takes {form.left.join(", ")}, which cannot be set here. Set them
              through the API.
            </Notice>
          </div>
        ) : null}
        <Form
          key={String(open)}
          schema={form.schema}
          value={row.config ?? {}}
          submitLabel="Save"
          onSubmit={async (values) => {
            const { [form.secret]: secret, ...config } = values;
            await api.put(`${root}/connection-bindings/${row.path}`, {
              config,
              ...(secret ? { credential: secret } : {}),
            });
            setOpen(false);
            onDone();
          }}
        />
      </Dialog>
    </>
  );
}

export function Connections({ root }: { root: string }) {
  const connectionUses = useReferences(root, "connection");
  return (
    <ListScreen<ConnectionRow>
      title="Connections"
      description="Where each connection points in this workspace. Addresses and credentials are set here, never in the repository, so dev and production can differ."
      path={`${root}/connection-bindings`}
      rowKey={(row) => row.path}
      columns={[
        { header: "Connection", cell: (row) => code(row.path) },
        { header: "Used by", cell: (row) => <UsedBy uses={connectionUses(row.path)} /> },
        { header: "Kind", cell: (row) => CONNECTOR_NAMES[row.connector] ?? code(row.connector) },
        { header: "For", cell: (row) => <span className="text-ink-muted">{row.description}</span> },
        {
          header: "Points to",
          cell: (row) =>
            row.bound ? (
              (row.config?.baseUrl ?? row.config?.host ?? "")
            ) : (
              <Badge tone="attention">Not bound</Badge>
            ),
        },
        {
          header: "Credential",
          cell: (row) => (row.hasCredential ? "Set" : row.bound ? "None" : ""),
        },
      ]}
      empty={{
        title: "No connections yet",
        text: "A connection is an external system a script talks to. Bind one here before deploying the bundle that uses it.",
      }}
      create={{
        action: "Bind an HTTP connection",
        description:
          "Binding a path that is already bound replaces it. Leave the credential empty to keep the stored one. A connection of another kind is set up from its row.",
        fields: [
          {
            name: "path",
            label: "Connection",
            hint: "The HTTP connections this workspace's resources declare.",
            choose: {
              path: `${root}/connection-bindings`,
              option: (item: {
                path: string;
                connector: string;
                description: string;
                bound: boolean;
              }) => ({
                value: item.path,
                label: item.path,
                hint:
                  item.connector !== "http"
                    ? "Not an HTTP connection. Set it up from its row."
                    : item.bound
                      ? `${item.description} Bound: this replaces it.`
                      : item.description,
                ...(item.connector !== "http" ? { disabled: true } : {}),
              }),
            },
          },
          { name: "baseUrl", label: "Address", placeholder: "https://api.example.com" },
          {
            name: "auth",
            label: "How the credential is sent",
            options: [
              { value: "none", label: "No credential" },
              { value: "bearer", label: "Authorization: Bearer" },
              { value: "header", label: "In a header of your choice" },
            ],
          },
          {
            name: "header",
            label: "Header name",
            placeholder: "x-api-key",
            when: (values) => values.auth === "header",
          },
          { name: "credential", label: "Credential", type: "password", required: false },
        ],
        submit: ({ path = "", baseUrl, auth, header, credential }) =>
          api.put(`${root}/connection-bindings/${path}`, {
            config: {
              baseUrl,
              ...(auth === "bearer" ? { auth: { type: "bearer" } } : {}),
              ...(auth === "header"
                ? { auth: { type: "header", name: header || "x-api-key" } }
                : {}),
            },
            ...(credential ? { credential } : {}),
          }),
      }}
      rowActions={(row, reload) => (
        <span className="flex justify-end gap-2">
          {row.connector !== "http" ? (
            <SetUpConnection root={root} row={row} onDone={reload} />
          ) : null}
          {row.bound ? (
            <RemoveButton
              label="Unbind"
              confirm={`Unbind ${row.path}? Scripts that use it will fail until it is bound again.`}
              run={() => api.delete(`${root}/connection-bindings/${row.path}`)}
              onDone={reload}
            />
          ) : null}
        </span>
      )}
    />
  );
}

export function Variables({ root }: { root: string }) {
  const variableUses = useReferences(root, "variable");
  return (
    <ListScreen<{ path: string; description: string; default: string | null; value: string | null }>
      title="Variables"
      description="Settings a script reads at run time. Each workspace can set its own value. Without one, the default from the repository applies."
      path={`${root}/variable-values`}
      rowKey={(row) => row.path}
      columns={[
        { header: "Variable", cell: (row) => code(row.path) },
        { header: "Read by", cell: (row) => <UsedBy uses={variableUses(row.path)} /> },
        { header: "For", cell: (row) => <span className="text-ink-muted">{row.description}</span> },
        {
          header: "Value here",
          cell: (row) =>
            row.value !== null ? (
              code(row.value)
            ) : (
              <span className="text-ink-muted">Default: {row.default ?? "none"}</span>
            ),
        },
      ]}
      empty={{ title: "No variables yet" }}
      create={{
        action: "Set variable",
        fields: [
          {
            name: "path",
            label: "Variable",
            choose: {
              path: `${root}/variable-values`,
              option: (item: { path: string; description?: string }) => ({
                value: item.path,
                label: item.path,
                ...(item.description ? { hint: item.description } : {}),
              }),
            },
          },
          { name: "value", label: "Value" },
        ],
        submit: ({ path = "", value }) => api.put(`${root}/variable-values/${path}`, { value }),
      }}
      rowActions={(row, reload) =>
        row.value !== null ? (
          <RemoveButton
            label="Use default"
            confirm={`Clear the value of ${row.path} in this workspace?`}
            run={() => api.delete(`${root}/variable-values/${row.path}`)}
            onDone={reload}
          />
        ) : null
      }
    />
  );
}

interface WorkerPool {
  id: string | null;
  name: string | null;
  description: string;
  credentials: number;
  online: number;
  lastSeenAt: string | null;
  workspaces: { id: string; name: string }[];
  managed: boolean;
}

/** One place code runs: whether a worker is there now, and what runs on it. */
function PoolCard({
  pool,
  remove,
  onRemoved,
}: {
  pool: WorkerPool;
  remove: (() => Promise<unknown>) | undefined;
  onRemoved: () => void;
}) {
  const label = pool.name ?? "Default pool";
  return (
    <li className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="m-0 flex flex-wrap items-center gap-2 text-title">
            {pool.name ? <Mono>{pool.name}</Mono> : label}
            {pool.managed ? <Tag>Instance-run</Tag> : null}
            {pool.name && !pool.id ? <Tag tone="danger">Not made</Tag> : null}
          </h3>
          {pool.description ? (
            <p className="m-0 text-meta text-ink-muted">{pool.description}</p>
          ) : null}
        </div>
        {pool.online > 0 ? (
          <StatePill state="ok" detail={pool.lastSeenAt ? fromNow(pool.lastSeenAt) : undefined}>
            {pool.online} online
          </StatePill>
        ) : (
          <StatePill
            state={pool.workspaces.length > 0 && !pool.managed ? "warning" : "cancelled"}
            detail={pool.lastSeenAt ? `last seen ${fromNow(pool.lastSeenAt)}` : "never seen"}
          >
            No worker online
          </StatePill>
        )}
      </div>
      <KeyValues
        rows={[
          {
            label: "Runs code of",
            value:
              pool.workspaces.length > 0
                ? pool.workspaces.map((workspace) => workspace.name).join(", ")
                : "No workspace yet",
          },
          { label: "Credentials", value: <Mono>{pool.credentials}</Mono> },
        ]}
      />
      {remove ? (
        <div>
          <RemoveButton
            label="Remove pool"
            confirm={`Remove the pool "${label}"? Scripts that name it wait until it is made again.`}
            run={remove}
            onDone={onRemoved}
          />
        </div>
      ) : null}
    </li>
  );
}

export function Workers({ base }: { base: string }) {
  const pools = useLoad<{ items: WorkerPool[] }>(`${base}/worker-pools`);
  const tenant = useLoad<{ managedWorkers: boolean }>(base);
  const managed = useLoad<{ state: "off" | "isolated" | "shared" | "refused" }>(
    `${base}/managed-workers`,
  );
  const [adding, setAdding] = useState(false);
  const made = (pools.data?.items ?? []).filter((pool) => pool.name !== null);
  const poolOptions = [
    { value: "", label: "Default pool: scripts that name no pool" },
    ...made.map((pool) => ({ value: pool.name as string, label: pool.name as string })),
  ];
  return (
    <div className="flex flex-col gap-8">
      <Page
        title="Workers"
        description="Workers run this tenant's scripts. A pool is one place code runs, such as inside a client's network: a script names its pool, and only workers started with a credential for that pool run it."
        action={
          <Button variant="primary" onClick={() => setAdding(true)}>
            Add pool
          </Button>
        }
      >
        {pools.error ? (
          <Notice tone="danger">{pools.error.message}</Notice>
        ) : !pools.data ? (
          <p className="m-0 text-ink-muted">Loading…</p>
        ) : (
          <ul
            aria-label="Worker pools"
            className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 2xl:grid-cols-3"
          >
            {pools.data.items.map((pool) => (
              <PoolCard
                key={pool.id ?? pool.name ?? "default"}
                pool={pool}
                remove={pool.id ? () => api.delete(`${base}/worker-pools/${pool.id}`) : undefined}
                onRemoved={pools.reload}
              />
            ))}
          </ul>
        )}
        {managed.data?.state === "refused" ? (
          <Notice tone="attention">
            <strong>This tenant's code runs on standalone workers only.</strong> People outside the
            instance's operators write its code, and this instance cannot run the workers it starts
            as a user of their own, so it starts none. Make a credential below and start a worker
            with it: see "Standalone workers" in the self-hosting guide.
          </Notice>
        ) : managed.data?.state === "shared" && tenant.data?.managedWorkers ? (
          <p className="m-0 text-meta text-ink-muted">
            Workers the instance starts run as the control plane's own user.
          </p>
        ) : null}
        {tenant.data ? (
          <div className="flex flex-wrap items-center gap-3">
            <span>
              {tenant.data.managedWorkers
                ? "The instance starts workers for the default pool when there is work."
                : "The instance starts no workers for this tenant."}
            </span>
            <Button
              size="small"
              onClick={async () => {
                await api.patch(base, { managedWorkers: !tenant.data?.managedWorkers });
                tenant.reload();
              }}
            >
              {tenant.data.managedWorkers
                ? "Run only on our own workers"
                : "Let the instance run workers"}
            </Button>
          </div>
        ) : null}
        <CreateDialog
          config={{
            action: "Add pool",
            description:
              "Scripts name the pool with `worker`. Then make a credential for it and start a worker there.",
            fields: [
              {
                name: "name",
                label: "Name",
                placeholder: "warehouse",
                hint: "Lower case letters, digits and dashes.",
              },
              { name: "description", label: "Description", required: false },
            ],
            submit: ({ name, description }) =>
              api.post(`${base}/worker-pools`, {
                name,
                ...(description ? { description } : {}),
              }),
          }}
          open={adding}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            pools.reload();
          }}
        />
      </Page>
      <ListScreen<{
        id: string;
        name: string;
        prefix: string;
        workspaceId: string | null;
        pool: string | null;
        revokedAt: string | null;
        createdAt: string;
      }>
        as="section"
        title="Credentials for standalone workers"
        description="Start a worker with: platform-worker --url <this instance> --token <credential>"
        path={`${base}/worker-credentials`}
        rowKey={(row) => row.id}
        columns={[
          { header: "Name", cell: (row) => row.name },
          { header: "Credential", cell: (row) => code(`${row.prefix}…`) },
          {
            header: "Pool",
            cell: (row) => (row.pool ? <Mono>{row.pool}</Mono> : "Default pool"),
          },
          { header: "Created", cell: (row) => when(row.createdAt) },
          {
            header: "Status",
            cell: (row) =>
              row.revokedAt ? (
                <Badge tone="danger">Revoked</Badge>
              ) : (
                <Badge tone="action">Active</Badge>
              ),
          },
        ]}
        empty={{
          title: "No standalone workers",
          text: "You only need one to run scripts inside your own network.",
        }}
        create={{
          action: "Create credential",
          fields: [
            { name: "name", label: "Name", placeholder: "Warehouse network" },
            {
              name: "pool",
              label: "Pool",
              options: poolOptions,
              hint: "The worker runs only the scripts of this pool.",
            },
          ],
          submit: async ({ name, pool }) => {
            const result = await api.post(`${base}/worker-credentials`, {
              name,
              ...(pool ? { pool } : {}),
            });
            pools.reload();
            return result;
          },
          afterCreate: (result) => (
            <span>
              Copy this credential now. It is not shown again:{" "}
              <code className="font-mono break-all select-all">
                {(result as { token: string }).token}
              </code>
            </span>
          ),
        }}
        rowActions={(row, reload) =>
          row.revokedAt ? null : (
            <RemoveButton
              label="Revoke"
              confirm={`Revoke "${row.name}"? A worker using it stops.`}
              run={() => api.delete(`${base}/worker-credentials/${row.id}`)}
              onDone={() => {
                reload();
                pools.reload();
              }}
            />
          )
        }
      />
    </div>
  );
}

interface GroupMember {
  key: string;
  label: string;
  config: { baseUrl?: string };
  hasCredential: boolean;
}
interface ConnectionGroup {
  path: string;
  description: string;
  connector: string;
  members: GroupMember[];
}

/**
 * Connection groups: sets of connections of one kind, such as every customer's
 * account. Members are added here and take effect on the next run, with no deploy.
 */
export function ConnectionGroups({ root }: { root: string }) {
  const groups = useLoad<{ items: ConnectionGroup[] }>(`${root}/connection-groups`);
  const [adding, setAdding] = useState<string>();
  if (groups.error) return <Notice tone="danger">{groups.error.message}</Notice>;
  if (!groups.data) return null;

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h2 className="m-0 text-lg font-semibold">Connection groups</h2>
        <p className="mt-1 mb-0 max-w-[70ch] text-ink-muted">
          A group holds many connections of one kind, and a script picks one by its key when it
          runs. Add a member for each customer or account. It is used from the next run, with no
          deploy.
        </p>
      </header>
      {groups.data.items.length === 0 ? (
        <p className="m-0 rounded-panel border border-line border-dashed px-4 py-3 text-ink-muted">
          No groups here. A group is declared in the workspace's code with the connection kind it
          holds; once deployed, its members are added here.
        </p>
      ) : null}
      {groups.data.items.map((group) => (
        <div key={group.path} className="rounded-panel border border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-line border-b px-4 py-3">
            <div className="min-w-0">
              <code className="font-mono text-[13px] font-semibold">{group.path}</code>
              {group.description ? (
                <span className="ml-3 text-ink-muted">{group.description}</span>
              ) : null}
            </div>
            <Button size="small" variant="primary" onClick={() => setAdding(group.path)}>
              Add a member
            </Button>
          </div>
          {group.members.length === 0 ? (
            <p className="m-0 px-4 py-3 text-ink-muted">
              No members yet. A script that asks this group for a key will fail until one is added.
            </p>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="text-[12.5px] text-ink-muted">
                  {["Key", "Name", "Points to", "Credential", ""].map((header, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed headers, one of them empty
                    <th key={index} scope="col" className="px-4 py-2 font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.members.map((member) => (
                  <tr key={member.key} className="border-line border-t">
                    <td className="px-4 py-2">{code(member.key)}</td>
                    <td className="px-4 py-2 text-ink-muted">{member.label}</td>
                    <td className="px-4 py-2">{member.config.baseUrl ?? ""}</td>
                    <td className="px-4 py-2">{member.hasCredential ? "Set" : "None"}</td>
                    <td className="px-4 py-2 text-right">
                      <RemoveButton
                        confirm={`Scripts that ask ${group.path} for "${member.key}" will fail until it is added again.`}
                        run={() =>
                          api.delete(`${root}/connection-group-members/${member.key}/${group.path}`)
                        }
                        onDone={groups.reload}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
      <CreateDialog
        key={adding}
        open={adding !== undefined}
        onClose={() => setAdding(undefined)}
        onCreated={() => {
          setAdding(undefined);
          groups.reload();
        }}
        config={{
          action: "Add a member",
          description: `To ${adding ?? ""}. A key that is already there is replaced. Leave the credential empty to keep the stored one.`,
          fields: [
            {
              name: "key",
              label: "Key",
              placeholder: "acme-north",
              hint: "What a script asks for: a customer's ID, a region, a shop's name.",
            },
            { name: "label", label: "Name", required: false, placeholder: "Acme, northern shop" },
            { name: "baseUrl", label: "Address", placeholder: "https://api.example.com" },
            {
              name: "auth",
              label: "How the credential is sent",
              options: [
                { value: "none", label: "No credential" },
                { value: "bearer", label: "Authorization: Bearer" },
                { value: "header", label: "In a header of your choice" },
              ],
            },
            {
              name: "header",
              label: "Header name",
              placeholder: "x-api-key",
              when: (values) => values.auth === "header",
            },
            { name: "credential", label: "Credential", type: "password", required: false },
          ],
          submit: ({ key = "", label, baseUrl, auth, header, credential }) =>
            api.put(`${root}/connection-group-members/${encodeURIComponent(key)}/${adding}`, {
              ...(label ? { label } : {}),
              config: {
                baseUrl,
                ...(auth === "bearer" ? { auth: { type: "bearer" } } : {}),
                ...(auth === "header"
                  ? { auth: { type: "header", name: header || "x-api-key" } }
                  : {}),
              },
              ...(credential ? { credential } : {}),
            }),
        }}
      />
    </section>
  );
}

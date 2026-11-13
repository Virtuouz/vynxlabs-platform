import { Badge, type BadgeTone, Button, Notice } from "@vynxlabs/ui";
import { type ReactNode, useEffect, useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { ListScreen, Page, RemoveButton, when } from "../ListScreen.tsx";
import { Link, navigate } from "../router.tsx";

const code = (text: string) => <code className="font-mono text-[13px]">{text}</code>;

type Status = "queued" | "running" | "succeeded" | "failed" | "cancelled";
const STATUS: Record<Status, [BadgeTone, string]> = {
  queued: ["neutral", "Waiting"],
  running: ["action", "Running"],
  succeeded: ["success", "Succeeded"],
  failed: ["danger", "Failed"],
  cancelled: ["neutral", "Cancelled"],
};
const StatusBadge = ({ status }: { status: Status }) => (
  <Badge tone={STATUS[status][0]}>{STATUS[status][1]}</Badge>
);

interface Run {
  id: string;
  script: string;
  status: Status;
  attempt: number;
  maxAttempts: number;
  trigger: { type: string; [detail: string]: unknown };
  bundleVersion: number;
  error: { message: string } | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

function took(run: Run) {
  if (!run.startedAt || !run.finishedAt) return "";
  const ms = Date.parse(run.finishedAt) - Date.parse(run.startedAt);
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

const TRIGGER: Record<string, string> = {
  manual: "Started by hand",
  schedule: "Schedule",
  webhook: "Webhook",
  alert: "Failure handler",
};

export function Scripts({ root, runsLink }: { root: string; runsLink: string }) {
  return (
    <ListScreen<{
      path: string;
      description: string;
      lastRun: { id: string; status: Status; createdAt: string } | null;
    }>
      title="Scripts"
      description="The scripts in the bundle this workspace is running."
      path={`${root}/scripts`}
      rowKey={(row) => row.path}
      columns={[
        { header: "Script", cell: (row) => code(row.path) },
        {
          header: "What it does",
          cell: (row) => <span className="text-ink-muted">{row.description}</span>,
        },
        {
          header: "Last run",
          cell: (row) =>
            row.lastRun ? (
              <Link
                to={`${runsLink}/${row.lastRun.id}`}
                className="inline-flex items-center gap-2 no-underline"
              >
                <StatusBadge status={row.lastRun.status} />
                <span className="text-ink-muted">{when(row.lastRun.createdAt)}</span>
              </Link>
            ) : (
              <span className="text-ink-muted">Never</span>
            ),
        },
      ]}
      empty={{
        title: "No scripts yet",
        text: "Scripts arrive with a deploy. From the tenant's repository, run: platform deploy --tenant <slug> --workspace <slug>",
      }}
      rowActions={(row) => <RunButton root={root} script={row.path} runsLink={runsLink} />}
    />
  );
}

function RunButton({ root, script, runsLink }: { root: string; script: string; runsLink: string }) {
  return (
    <Button
      size="small"
      onClick={async () => {
        const text = window.prompt(`Input for ${script}, as JSON`, "{}");
        if (text === null) return;
        try {
          const run = await api.post<Run>(`${root}/runs`, { script, input: JSON.parse(text) });
          navigate(`${runsLink}/${run.id}`);
        } catch (error) {
          const failure = error as ApiError;
          const fields = (failure.fields ?? [])
            .map((field) => `\n${field.path} ${field.message}`)
            .join("");
          window.alert(
            error instanceof SyntaxError
              ? "That is not valid JSON."
              : `${failure.message}${fields}`,
          );
        }
      }}
    >
      Run
    </Button>
  );
}

export function Runs({ root, link }: { root: string; link: string }) {
  return (
    <ListScreen<Run>
      title="Runs"
      description="Every time a script ran in this workspace, newest first."
      path={`${root}/runs?limit=100`}
      rowKey={(row) => row.id}
      columns={[
        {
          header: "Started",
          cell: (row) => (
            <Link to={`${link}/${row.id}`} className="whitespace-nowrap text-action">
              {when(row.createdAt)}
            </Link>
          ),
        },
        { header: "Script", cell: (row) => code(row.script) },
        { header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
        { header: "Started by", cell: (row) => TRIGGER[row.trigger.type] ?? row.trigger.type },
        { header: "Took", cell: (row) => took(row), align: "end" },
      ]}
      empty={{
        title: "Nothing has run yet",
        text: "Start a script from the Scripts tab, or wait for a schedule or webhook.",
      }}
    />
  );
}

interface LogLine {
  seq: number;
  attempt: number;
  time: string;
  level: string;
  message: string;
  fields: Record<string, unknown>;
}

const LEVEL: Record<string, string> = {
  error: "text-danger",
  warn: "text-attention",
  debug: "text-ink-muted",
};

/** One run, refreshed while it is in progress, with its log lines as they arrive. */
export function RunDetail({
  root,
  runId,
  backLink,
}: {
  root: string;
  runId: string;
  backLink: string;
}) {
  const [run, setRun] = useState<
    Run & { input: unknown; output: unknown; alert: Record<string, unknown> | null }
  >();
  const [lines, setLines] = useState<LogLine[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let stopped = false;
    let last = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const current = await api.get<NonNullable<typeof run>>(`${root}/runs/${runId}`);
        const logs = await api.get<{ items: LogLine[]; done: boolean }>(
          `${root}/runs/${runId}/logs?after=${last}`,
        );
        if (stopped) return;
        setRun(current);
        if (logs.items.length > 0) {
          last = logs.items.at(-1)?.seq ?? last;
          setLines((existing) => [...existing, ...logs.items]);
        }
        if (!logs.done) timer = setTimeout(poll, 1500);
      } catch (caught) {
        if (!stopped) setError((caught as Error).message);
      }
    };
    setLines([]);
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [root, runId]);

  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!run) return <p className="text-ink-muted">Loading…</p>;
  const active = run.status === "queued" || run.status === "running";
  const fact = (label: string, value: ReactNode) => (
    <div>
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      <dd className="m-0">{value}</dd>
    </div>
  );
  return (
    <Page
      title={run.script}
      action={
        active ? (
          <Button
            variant="danger"
            onClick={async () => {
              if (!window.confirm("Cancel this run?")) return;
              await api
                .post(`${root}/runs/${runId}/cancel`)
                .catch((caught) => window.alert((caught as Error).message));
            }}
          >
            Cancel run
          </Button>
        ) : undefined
      }
    >
      <Link to={backLink} className="text-action">
        All runs
      </Link>
      <dl className="m-0 grid grid-cols-2 gap-4 rounded-panel border border-line bg-surface p-4 md:grid-cols-4">
        {fact("Status", <StatusBadge status={run.status} />)}
        {fact("Started by", TRIGGER[run.trigger.type] ?? run.trigger.type)}
        {fact("Attempt", `${Math.max(run.attempt, 1)} of ${run.maxAttempts}`)}
        {fact("Bundle version", run.bundleVersion)}
        {fact("Created", when(run.createdAt))}
        {fact("Took", took(run) || (active ? "In progress" : ""))}
      </dl>
      {run.error ? (
        <Notice tone="danger">
          <strong>The run failed.</strong> {run.error.message}
        </Notice>
      ) : null}
      {run.alert?.handlerRunId ? (
        <p className="m-0 text-ink-muted">
          A failure handler was started:{" "}
          <Link to={`${backLink}/${run.alert.handlerRunId}`} className="text-action">
            see its run
          </Link>
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Payload title="Input" value={run.input} />
        <Payload title="Output" value={run.status === "succeeded" ? run.output : undefined} />
      </div>
      <section>
        <h2 className="mt-0 mb-2 text-base font-semibold">Log</h2>
        {lines.length === 0 ? (
          <p className="m-0 text-ink-muted">
            {active ? "Waiting for the first line…" : "The script logged nothing."}
          </p>
        ) : (
          <ol className="m-0 list-none overflow-x-auto rounded-panel border border-line bg-surface p-3 font-mono text-[13px]">
            {lines.map((line) => (
              <li key={line.seq} className={`whitespace-pre-wrap ${LEVEL[line.level] ?? ""}`}>
                <span className="text-ink-muted">{new Date(line.time).toLocaleTimeString()}</span>{" "}
                {line.level.padEnd(5)} {line.message}
                {Object.keys(line.fields).length > 0 ? (
                  <span className="text-ink-muted"> {JSON.stringify(line.fields)}</span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </Page>
  );
}

function Payload({ title, value }: { title: string; value: unknown }) {
  return (
    <section>
      <h2 className="mt-0 mb-2 text-base font-semibold">{title}</h2>
      <pre className="m-0 max-h-64 overflow-auto rounded-panel border border-line bg-surface p-3 font-mono text-[13px]">
        {value === undefined ? "—" : JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}

export function Triggers({ root }: { root: string }) {
  return (
    <ListScreen<{
      path: string;
      type: string;
      script: string;
      enabled: boolean;
      cron: string | null;
      timezone: string | null;
      nextFireAt: string | null;
      lastFiredAt: string | null;
      url: string | null;
    }>
      title="Triggers"
      description="What starts scripts in this workspace without anyone asking: schedules and webhooks."
      path={`${root}/triggers`}
      rowKey={(row) => row.path}
      columns={[
        { header: "Trigger", cell: (row) => code(row.path) },
        { header: "Starts", cell: (row) => code(row.script) },
        {
          header: "When",
          cell: (row) =>
            row.type === "schedule" ? (
              <span>
                {code(row.cron ?? "")} <span className="text-ink-muted">{row.timezone}</span>
              </span>
            ) : row.url ? (
              <span className="font-mono text-[13px] break-all select-all">POST {row.url}</span>
            ) : (
              <span className="text-ink-muted">
                A webhook. Its address is shown to those who manage triggers.
              </span>
            ),
        },
        {
          header: "Next",
          cell: (row) =>
            !row.enabled ? (
              <Badge>Off</Badge>
            ) : row.nextFireAt ? (
              when(row.nextFireAt)
            ) : (
              "On request"
            ),
        },
      ]}
      empty={{
        title: "No triggers",
        text: "Define a schedule or a webhook in the tenant's repository and deploy it.",
      }}
    />
  );
}

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
        text: "From the tenant's repository, run: platform deploy --tenant <slug> --workspace <slug>",
      }}
      rowActions={(row, reload) =>
        row.active ? null : (
          <Button
            size="small"
            onClick={async () => {
              if (
                !window.confirm(
                  `Activate version ${row.version}? This replaces what the workspace is running.`,
                )
              )
                return;
              try {
                await api.post(`${root}/deployments`, { bundleId: row.id });
                reload();
              } catch (error) {
                const failure = error as ApiError;
                window.alert(
                  [failure.message, ...failure.fields.map((field) => field.message)].join("\n"),
                );
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

export function Connections({ root }: { root: string }) {
  return (
    <ListScreen<{
      path: string;
      description: string;
      defined: boolean;
      bound: boolean;
      config: { baseUrl?: string } | null;
      hasCredential: boolean;
    }>
      title="Connections"
      description="Where each connection points in this workspace. Addresses and credentials are set here, never in the repository, so dev and production can differ."
      path={`${root}/connection-bindings`}
      rowKey={(row) => row.path}
      columns={[
        { header: "Connection", cell: (row) => code(row.path) },
        { header: "For", cell: (row) => <span className="text-ink-muted">{row.description}</span> },
        {
          header: "Points to",
          cell: (row) =>
            row.bound ? (row.config?.baseUrl ?? "") : <Badge tone="attention">Not bound</Badge>,
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
        action: "Bind connection",
        description:
          "Binding a path that is already bound replaces it. Leave the credential empty to keep the stored one.",
        fields: [
          {
            name: "path",
            label: "Connection",
            placeholder: "shop",
            hint: "The path the repository gives it.",
          },
          { name: "baseUrl", label: "Address", placeholder: "https://api.example.com" },
          {
            name: "auth",
            label: "How the credential is sent",
            options: [
              { value: "none", label: "No credential" },
              { value: "bearer", label: "Authorization: Bearer" },
              { value: "header", label: "In an X-API-Key header" },
            ],
          },
          { name: "credential", label: "Credential", type: "password", required: false },
        ],
        submit: ({ path = "", baseUrl, auth, credential }) =>
          api.put(`${root}/connection-bindings/${path}`, {
            config: {
              baseUrl,
              ...(auth === "bearer" ? { auth: { type: "bearer" } } : {}),
              ...(auth === "header" ? { auth: { type: "header", name: "x-api-key" } } : {}),
            },
            ...(credential ? { credential } : {}),
          }),
      }}
      rowActions={(row, reload) =>
        row.bound ? (
          <RemoveButton
            label="Unbind"
            confirm={`Unbind ${row.path}? Scripts that use it will fail until it is bound again.`}
            run={() => api.delete(`${root}/connection-bindings/${row.path}`)}
            onDone={reload}
          />
        ) : null
      }
    />
  );
}

export function Variables({ root }: { root: string }) {
  return (
    <ListScreen<{ path: string; description: string; default: string | null; value: string | null }>
      title="Variables"
      description="Settings a script reads at run time. Each workspace can set its own value. Without one, the default from the repository applies."
      path={`${root}/variable-values`}
      rowKey={(row) => row.path}
      columns={[
        { header: "Variable", cell: (row) => code(row.path) },
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
          { name: "path", label: "Variable", placeholder: "orders/batch-size" },
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

export function Workers({ base }: { base: string }) {
  const live = useLoad<{
    items: { id: string; credentialName: string; managed: boolean; lastSeenAt: string }[];
  }>(`${base}/workers`);
  const tenant = useLoad<{ managedWorkers: boolean }>(base);
  return (
    <div className="flex flex-col gap-8">
      <Page
        title="Workers"
        description="Workers run this tenant's scripts. The instance starts one when there is work and stops it when there is none. A standalone worker is one you run yourself, for example inside your own network."
      >
        {live.data && live.data.items.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {live.data.items.map((worker) => (
              <li key={worker.id} className="flex items-center gap-2">
                <Badge tone="success">Running</Badge>
                {worker.managed
                  ? "Started by the instance"
                  : `Standalone, using "${worker.credentialName}"`}
                <span className="text-ink-muted">last heard from {when(worker.lastSeenAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-ink-muted">
            No worker is running right now.
            {tenant.data?.managedWorkers === false
              ? " This tenant runs on its own workers: start one with a credential from below."
              : " One starts when a script needs to run."}
          </p>
        )}
        {tenant.data ? (
          <div className="flex flex-wrap items-center gap-3">
            <span>
              {tenant.data.managedWorkers
                ? "The instance starts workers for this tenant."
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
        title="Credentials for standalone workers"
        description="Start a worker with: platform-worker --url <this instance> --token <credential>"
        path={`${base}/worker-credentials`}
        rowKey={(row) => row.id}
        columns={[
          { header: "Name", cell: (row) => row.name },
          { header: "Credential", cell: (row) => code(`${row.prefix}…`) },
          {
            header: "Runs",
            cell: (row) =>
              row.pool ? `Scripts of the pool "${row.pool}"` : "Scripts that name no pool",
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
              required: false,
              placeholder: "warehouse",
              hint: "Leave empty to run scripts that name no pool. With a pool, the worker runs only the scripts that name it.",
            },
          ],
          submit: ({ name, pool }) =>
            api.post(`${base}/worker-credentials`, { name, ...(pool ? { pool } : {}) }),
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
              onDone={reload}
            />
          )
        }
      />
    </div>
  );
}

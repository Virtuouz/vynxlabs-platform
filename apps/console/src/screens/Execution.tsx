import {
  Badge,
  type BadgeTone,
  Button,
  Facts,
  JsonView,
  type LogLine,
  LogViewer,
  Notice,
} from "@vynxlabs/ui";
import { Ban, Check, Clock, LoaderCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api, useLoad } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { InputDialog } from "../InputDialog.tsx";
import { CreateDialog, ListScreen, Page, RemoveButton, when } from "../ListScreen.tsx";
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
  return (
    <ListScreen<{
      path: string;
      description: string;
      inputSchema: Record<string, unknown>;
      lastRun: { id: string; status: Status; createdAt: string } | null;
    }>
      title="Scripts"
      description="The scripts this workspace is running. Open one to read it, or to change it in a dev workspace."
      action={
        editable ? (
          <Button variant="primary" onClick={() => navigate(`${link}/scripts/new`)}>
            New script
          </Button>
        ) : undefined
      }
      path={`${root}/scripts`}
      rowKey={(row) => row.path}
      columns={[
        {
          header: "Script",
          cell: (row) => (
            <Link
              to={`${link}/scripts/edit/${row.path}`}
              className="font-mono text-[13px] text-action"
            >
              {row.path}
            </Link>
          ),
        },
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
      rowActions={(row) => (
        <RunButton root={root} script={row.path} schema={row.inputSchema} runsLink={runsLink} />
      )}
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
    Run & {
      input: unknown;
      output: unknown;
      alert: Record<string, unknown> | null;
      pool: string | null;
      waitingFor: string | null;
    }
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
  const duration = took(run);
  const waited =
    run.startedAt && Date.parse(run.startedAt) - Date.parse(run.createdAt) >= 1000
      ? `${((Date.parse(run.startedAt) - Date.parse(run.createdAt)) / 1000).toFixed(1)} s`
      : "";
  const outcome =
    run.status === "succeeded"
      ? `Succeeded${duration ? ` in ${duration}` : ""}`
      : run.status === "failed"
        ? `Failed${duration ? ` after ${duration}` : ""}`
        : run.status === "cancelled"
          ? "Cancelled"
          : run.status === "running"
            ? "Running"
            : "Waiting for a worker";
  const Mark =
    run.status === "succeeded"
      ? Check
      : run.status === "failed"
        ? X
        : run.status === "cancelled"
          ? Ban
          : run.status === "running"
            ? LoaderCircle
            : Clock;
  const tone = STATUS[run.status][0];
  const markTone: Record<BadgeTone, string> = {
    success: "bg-success-soft text-success",
    danger: "bg-danger-soft text-danger",
    action: "bg-action-soft text-action",
    attention: "bg-attention-soft text-attention",
    neutral: "bg-sunken text-ink-muted",
  };
  const failed = run.status === "failed";

  return (
    <section className="flex flex-col gap-4">
      <Link to={backLink} className="text-[13px] text-action">
        All runs
      </Link>
      <div className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={`flex size-7 shrink-0 items-center justify-center rounded-control ${markTone[tone]}`}
            >
              <Mark
                aria-hidden="true"
                size={16}
                strokeWidth={2.25}
                className={run.status === "running" ? "animate-spin" : ""}
              />
            </span>
            <h1 className="m-0 truncate font-mono text-base font-semibold">{run.script}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={tone}>{outcome}</Badge>
            {active ? (
              <Button
                size="small"
                variant="danger"
                onClick={async () => {
                  const sure = await ask.confirm({
                    title: "Cancel this run?",
                    action: "Cancel run",
                    cancel: "Keep running",
                    danger: true,
                  });
                  if (!sure) return;
                  await api.post(`${root}/runs/${runId}/cancel`).catch(notify.error);
                }}
              >
                Cancel run
              </Button>
            ) : null}
          </div>
        </header>
        <div className="flex flex-wrap gap-1.5">
          <Badge>{run.id.slice(-12)}</Badge>
          <Badge>Version {run.bundleVersion}</Badge>
          {run.pool ? <Badge tone="action">Pool: {run.pool}</Badge> : null}
          {run.maxAttempts > 1 ? (
            <Badge>
              Attempt {Math.max(run.attempt, 1)} of {run.maxAttempts}
            </Badge>
          ) : null}
        </div>
        {run.waitingFor ? <Notice tone="attention">{run.waitingFor}</Notice> : null}
        <Facts
          facts={[
            { label: "Received", value: stamp(run.createdAt) },
            { label: "Started", value: run.startedAt ? stamp(run.startedAt) : "" },
            { label: "Finished", value: run.finishedAt ? stamp(run.finishedAt) : "" },
            { label: "By", value: TRIGGER[run.trigger.type] ?? run.trigger.type },
            { label: "Waited", value: waited },
            { label: "Ran", value: duration || (run.status === "running" ? "In progress" : "") },
            { label: "Run ID", value: run.id, code: true },
            {
              label: "Trigger",
              value: typeof run.trigger.trigger === "string" ? run.trigger.trigger : "",
              code: true,
            },
          ]}
        />
        {run.alert?.handlerRunId ? (
          <p className="m-0 text-ink-muted">
            A failure handler was started:{" "}
            <Link to={`${backLink}/${run.alert.handlerRunId}`} className="text-action">
              see its run
            </Link>
          </p>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="m-0 text-[13px] font-medium text-ink-muted">Input</h2>
            <JsonView label="Input" value={run.input} />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="m-0 text-[13px] font-medium text-ink-muted">Result</h2>
            <JsonView
              label="Result"
              tone={failed ? "danger" : "plain"}
              value={
                failed ? { error: run.error } : run.status === "succeeded" ? run.output : undefined
              }
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="m-0 w-fit border-action border-b-2 pb-1 text-[13px] font-medium">Logs</h2>
          <LogViewer
            lines={lines}
            live={active}
            fileName={`${run.script.replaceAll("/", "-")}-${run.id.slice(-12)}.log`}
            empty={active ? "Waiting for the first line…" : "The script logged nothing."}
          />
        </div>
      </div>
    </section>
  );
}

/** A date and time to the second, in the same shape on every line so that they compare by eye. */
const stamp = (iso: string) => {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

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
            hint: "The connections this workspace's resources declare.",
            choose: {
              path: `${root}/connection-bindings`,
              option: (item: { path: string; description: string; bound: boolean }) => ({
                value: item.path,
                label: item.path,
                hint: item.bound
                  ? `${item.description} Bound: this replaces it.`
                  : item.description,
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
  if (!groups.data || groups.data.items.length === 0) return null;

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

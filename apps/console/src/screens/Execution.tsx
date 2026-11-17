import { type BadgeTone, Button, type LogLine, logText, Notice, saveText } from "@vynxlabs/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, useLoad } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { InputDialog } from "../InputDialog.tsx";
import { CollectionView } from "../kit/CollectionView.tsx";
import { DataTable } from "../kit/DataTable.tsx";
import { ErrorState, Loading } from "../kit/LoadState.tsx";
import { FilterChips, Inspector, KeyValues } from "../kit/layout.tsx";
import { OneTimeSecret } from "../kit/OneTimeSecret.tsx";
import { consoleLink, ObjectLink } from "../kit/objects.tsx";
import { UsedBy, useReferences, usersOf } from "../kit/references.tsx";
import { mayPass, retryAfter } from "../kit/retry.ts";
import { Mono, type RunState, StatePill, Tag } from "../kit/status.tsx";
import { CopyButton, CreateDialog, ListScreen, Page, RemoveButton, when } from "../ListScreen.tsx";
import { Link, navigate, useQueryValue, useUrlParam } from "../router.tsx";
import { useStreamConnected, useStreamEvents } from "../stream.ts";
import { type TaskState, useTaskEnd } from "../tasks.ts";
import {
  CONNECTOR_NAMES,
  type ConnectionRow,
  ConnectionWizard,
  startConnect,
  testText,
} from "./ConnectionWizard.tsx";
import { OfferButton } from "./OfferToAgent.tsx";
import { fromNow } from "./Overview.tsx";

const code = (text: string) => <code className="font-mono text-code">{text}</code>;

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
  const [filter, setFilter] = useUrlParam<"all" | "failing" | "never">("filter", "all");
  const [chosen, setChosen] = useUrlParam("item", undefined, { push: true });
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
                className="truncate font-mono text-code text-ink no-underline"
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
      error={list.error}
      onRetry={list.reload}
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
                <OfferButton root={root} kind="script" path={open.path} size="small" />
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
                      <ObjectLink key={name} link={link} kind={kind.slice(0, -1)} path={name} />
                    ))}
                  </div>
                ) : null,
              )}
              <span className="flex flex-wrap gap-x-4 gap-y-1 text-meta">
                <Link to={`${link}/scripts/${open.path}`}>Its page: runs, triggers, used by</Link>
                {open.lastRun ? (
                  <Link to={`${runsLink}/${open.lastRun.id}`}>Open the last run</Link>
                ) : null}
              </span>
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
  /** Set when the script limits its runs per value of a key in their input. */
  concurrency?: { key: string; value: string; limit: number } | null;
  reruns?: { id: string; state: RunState; createdAt: string }[];
};

/** Log lines read at once: the most the route gives. */
const LOG_PAGE = 1000;
/**
 * The most log lines a page holds. The viewer draws only the lines in view, but
 * each line held costs memory, and what went wrong is usually near the end, so
 * past this the oldest are left out first. "Download the whole log" has them all.
 */
export const LOG_WINDOW = 50_000;

/**
 * A run and its log lines, asked for again whenever the run changes or logs: on
 * the run event stream, or every second and a half while the stream is down.
 *
 * The whole log is read, a page at a time, and the newest `LOG_WINDOW` lines
 * are kept; `earlier` counts those left out. A read that fails once the run is
 * shown keeps what is shown, says it is `reconnecting`, and is tried again,
 * waiting longer each time. `error` is only for a run that could not be shown at all.
 */
export function useLiveRun(root: string, runId: string) {
  const [run, setRun] = useState<LiveRun>();
  const [lines, setLines] = useState<LogLine[]>([]);
  const [earlier, setEarlier] = useState(0);
  const [error, setError] = useState<string>();
  const [reconnecting, setReconnecting] = useState(false);
  const streaming = useStreamConnected();
  const shown = useRef(runId);
  const last = useRef(0);
  const done = useRef(false);
  const busy = useRef(false);
  const again = useRef(false);
  const kept = useRef<LogLine[]>([]);
  const dropped = useRef(0);
  const loaded = useRef(false);
  const failures = useRef(0);
  const retry = useRef<ReturnType<typeof setTimeout>>(undefined);
  const refreshing = useRef<() => Promise<void>>(async () => {});

  const refresh = useCallback(async () => {
    // One read at a time; one asked for meanwhile is made right after.
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    clearTimeout(retry.current);
    try {
      do {
        again.current = false;
        const current = await api.get<LiveRun>(`${root}/runs/${runId}`);
        if (shown.current !== runId) return;
        setRun(current);
        loaded.current = true;
        // Everything logged since the last line read, a page at a time.
        let page: { items: LogLine[]; done: boolean };
        do {
          page = await api.get<{ items: LogLine[]; done: boolean }>(
            `${root}/runs/${runId}/logs?after=${last.current}&limit=${LOG_PAGE}`,
          );
          if (shown.current !== runId) return;
          if (page.items.length > 0) {
            last.current = page.items.at(-1)?.seq ?? last.current;
            let all = [...kept.current, ...page.items];
            const over = all.length - LOG_WINDOW;
            if (over > 0) {
              all = all.slice(over);
              dropped.current += over;
            }
            kept.current = all;
            setLines(all);
            setEarlier(dropped.current);
          }
          done.current = page.done;
        } while (!page.done && page.items.length === LOG_PAGE);
      } while (again.current);
      failures.current = 0;
      setError(undefined);
      setReconnecting(false);
    } catch (caught) {
      if (shown.current !== runId) return;
      if (loaded.current) setReconnecting(true);
      else setError((caught as Error).message);
      // A run already shown is always asked for again; one never shown, only if it may pass.
      if (loaded.current || mayPass(caught)) {
        failures.current += 1;
        retry.current = setTimeout(() => void refreshing.current(), retryAfter(failures.current));
      }
    } finally {
      busy.current = false;
    }
  }, [root, runId]);
  refreshing.current = refresh;

  useEffect(() => {
    shown.current = runId;
    last.current = 0;
    done.current = false;
    kept.current = [];
    dropped.current = 0;
    loaded.current = false;
    failures.current = 0;
    clearTimeout(retry.current);
    setRun(undefined);
    setLines([]);
    setEarlier(0);
    setError(undefined);
    setReconnecting(false);
    void refresh();
    return () => clearTimeout(retry.current);
  }, [runId, refresh]);

  useStreamEvents(
    (event) => (event.k === "run" || event.k === "log") && event.id === runId,
    () => void refresh(),
  );
  useEffect(() => {
    if (streaming) return;
    const timer = setInterval(() => {
      if (!done.current && failures.current === 0) void refresh();
    }, 1500);
    return () => clearInterval(timer);
  }, [streaming, refresh]);
  return { run, lines, earlier, error, reconnecting };
}

/** Reads a run's whole log, a page at a time, and offers it as a file. */
export async function downloadWholeLog(root: string, runId: string, fileName: string) {
  const all: LogLine[] = [];
  let after = 0;
  for (;;) {
    const page = await api.get<{ items: LogLine[]; done: boolean }>(
      `${root}/runs/${runId}/logs?after=${after}&limit=${LOG_PAGE}`,
    );
    all.push(...page.items);
    after = page.items.at(-1)?.seq ?? after;
    if (page.done || page.items.length < LOG_PAGE) break;
  }
  saveText(logText(all), fileName);
}

/**
 * The download for a log viewer: the lines it was given, or, when the oldest
 * were left out, the whole log read again from the start.
 */
export function wholeLogDownload(root: string, runId: string, fileName: string, earlier: number) {
  return earlier > 0
    ? () => void downloadWholeLog(root, runId, fileName).catch(notify.error)
    : undefined;
}

/** Says, above a log, that its oldest lines are not shown, with a way to have them all. */
export function LogWindowNote({
  earlier,
  onDownload,
}: {
  earlier: number;
  onDownload: (() => void) | undefined;
}) {
  if (earlier <= 0) return null;
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-2 text-meta text-ink-muted">
      <span>
        The first {earlier.toLocaleString()} line{earlier === 1 ? " is" : "s are"} not shown here.
      </span>
      {onDownload ? (
        <Button size="small" variant="quiet" onClick={onDownload}>
          Download the whole log
        </Button>
      ) : null}
    </p>
  );
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
              {row.active ? <StatePill state="active">In use</StatePill> : null}
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

/**
 * Has one of the workspace's workers try a connection, from where scripts run,
 * and says what it found. What it found is kept, as the list's health.
 */
function TestConnection({
  root,
  path,
  onDone,
}: {
  root: string;
  path: string;
  onDone: () => void;
}) {
  const [taskId, setTaskId] = useState<string>();
  const following = useTaskEnd(root, taskId, (task: TaskState) => {
    setTaskId(undefined);
    const said = testText(task);
    if (said.ok) notify.success(`${path}: ${said.text}`);
    else notify.error(new Error(`${path}: ${said.text}`));
    onDone();
  });
  return (
    <Button
      size="small"
      disabled={following.waiting}
      onClick={async () => {
        try {
          const task = await api.post<{ id: string }>(`${root}/connection-tests`, { path });
          setTaskId(task.id);
        } catch (error) {
          notify.error(error);
        }
      }}
    >
      {following.waiting ? (following.slow ? "Waiting for a worker…" : "Testing…") : "Test"}
    </Button>
  );
}

/** What the last Test found, or why the connection cannot be used. */
export function ConnectionHealth({ root, row }: { root: string; row: ConnectionRow }) {
  if (!row.bound) return null;
  // What a member must do is beside what is wrong, where a phone shows it.
  if (row.oauth && row.oauth.status !== "connected") {
    const again = row.oauth.status === "needs_reconnect";
    return (
      <span className="flex flex-wrap items-center gap-2" title={row.oauth.problem ?? undefined}>
        <StatePill state={again ? "failed" : "waiting"}>
          {again ? "Needs reconnecting" : "Not connected"}
        </StatePill>
        <Button
          size="small"
          variant="primary"
          onClick={() => startConnect(root, row.path).catch((error) => notify.error(error))}
        >
          {again ? "Reconnect" : "Connect"}
        </Button>
      </span>
    );
  }
  if (!row.health) return <StatePill state="queued">Not tested</StatePill>;
  const when = `Tested ${new Date(row.health.checkedAt).toLocaleString()}`;
  return (
    <span
      title={row.health.ok ? when : `${row.health.problem ?? ""}\n${when}`}
      className="block max-w-[18rem]"
    >
      {row.health.ok ? (
        <StatePill
          state="ok"
          detail={row.health.latencyMs !== null ? `${row.health.latencyMs} ms` : undefined}
        >
          Reached
        </StatePill>
      ) : (
        <StatePill state="failed">{`Failed: ${row.health.problem ?? "not reached"}`}</StatePill>
      )}
    </span>
  );
}

export function Connections({ root }: { root: string }) {
  const connectionUses = useReferences(root, "connection");
  const list = useLoad<{ items: ConnectionRow[] }>(`${root}/connection-bindings`);
  const [editing, setEditing] = useState<{ row?: ConnectionRow | undefined } | null>(null);
  // Back from an OAuth provider: the connection's sheet opens again with what it said.
  const [oauth, setOauth] = useQueryValue("oauth");
  const [oauthError, setOauthError] = useQueryValue("oauth_error");
  const [returnedPath, setReturnedPath] = useQueryValue("connection");
  const [returned, setReturned] = useState<{ connected: boolean; problem?: string | undefined }>();
  useEffect(() => {
    if (!list.data || (!oauth && !oauthError)) return;
    const row = list.data.items.find((item) => item.path === returnedPath);
    setReturned({ connected: oauth === "connected", problem: oauthError ?? undefined });
    if (row) setEditing({ row });
    else if (oauthError) notify.error(new Error(oauthError));
    setOauth(null);
    setOauthError(null);
    setReturnedPath(null);
  }, [list.data, oauth, oauthError, returnedPath, setOauth, setOauthError, setReturnedPath]);
  // The list below reads the same address, from the same cache: reading it here reads it there.
  const reload = () => list.reload();
  const newButton = (
    <Button variant="primary" onClick={() => setEditing({})}>
      New connection
    </Button>
  );
  return (
    <>
      <ListScreen<ConnectionRow>
        title="Connections"
        description="Where each connection points in this workspace. Addresses and credentials are set here, never in the repository, so dev and production can differ."
        path={`${root}/connection-bindings`}
        rowKey={(row) => row.path}
        action={newButton}
        columns={[
          {
            header: "Connection",
            cell: (row) => (
              <ObjectLink link={consoleLink(root)} kind="connection" path={row.path} />
            ),
          },
          // Second, so a phone shows it without scrolling the table.
          { header: "Health", cell: (row) => <ConnectionHealth root={root} row={row} /> },
          {
            header: "Used by",
            cell: (row) => (
              <UsedBy
                uses={connectionUses(row.path)}
                failed={connectionUses.failed}
                link={consoleLink(root)}
                all={`${consoleLink(root)}/connections/${row.path}?tab=used-by`}
              />
            ),
          },
          { header: "Kind", cell: (row) => CONNECTOR_NAMES[row.connector] ?? code(row.connector) },
          {
            header: "Points to",
            cell: (row) =>
              row.bound ? (
                <span
                  className="block max-w-[16rem] truncate"
                  title={row.config?.baseUrl ?? row.config?.host ?? ""}
                >
                  {row.config?.baseUrl ?? row.config?.host ?? ""}
                </span>
              ) : (
                <StatePill state="unbound" />
              ),
          },
        ]}
        empty={{
          title: "No connections yet",
          text: "A connection is an external system a script talks to: an API, a mail server, an account at an OAuth provider. Set one up here before deploying the bundle that uses it.",
        }}
        rowActions={(row, reloadList) => {
          const done = () => reloadList();
          return (
            <span className="flex flex-wrap justify-end gap-2">
              {row.bound && (!row.oauth || row.oauth.status === "connected") ? (
                <TestConnection root={root} path={row.path} onDone={done} />
              ) : null}
              <Button size="small" onClick={() => setEditing({ row })}>
                {row.bound ? "Change" : "Set up"}
              </Button>
              {row.bound ? (
                <RemoveButton
                  label="Unbind"
                  confirm={`Unbind ${row.path}? Scripts that use it will fail until it is bound again.`}
                  affected={usersOf(connectionUses(row.path))}
                  run={() => api.delete(`${root}/connection-bindings/${row.path}`)}
                  onDone={done}
                />
              ) : null}
            </span>
          );
        }}
      />
      {editing ? (
        <ConnectionWizard
          key={editing.row?.path ?? "new"}
          root={root}
          open
          row={editing.row}
          rows={list.data?.items ?? []}
          returned={returned}
          onClose={() => {
            setEditing(null);
            setReturned(undefined);
          }}
          onSaved={reload}
        />
      ) : null}
    </>
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
        {
          header: "Variable",
          cell: (row) => <ObjectLink link={consoleLink(root)} kind="variable" path={row.path} />,
        },
        {
          header: "Read by",
          cell: (row) => (
            <UsedBy
              uses={variableUses(row.path)}
              failed={variableUses.failed}
              link={consoleLink(root)}
              all={`${consoleLink(root)}/variables/${row.path}?tab=used-by`}
            />
          ),
        },
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
            state={pool.workspaces.length > 0 && !pool.managed ? "warning" : "off"}
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

interface QueueRow {
  workspaceId: string;
  workspace: string;
  pool: string | null;
  due: number;
  later: number;
  running: number;
  oldestSeconds: number | null;
}
interface WorkerRow {
  id: string;
  credentialName: string;
  managed: boolean;
  version: string | null;
  outdated: boolean;
  running: { runId: string; workspaceId: string; script: string; startedAt: string | null }[];
}

/** A wait in words: "40s", "3m", "2h 5m". */
export function waitWords(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

/**
 * What waits for a worker, by workspace and pool, and what each worker holds:
 * a backlog is seen here before anyone asks why their run has not started.
 */
export function QueuePanel({ base }: { base: string }) {
  const queue = useLoad<{
    items: QueueRow[];
    tasks: { workspaceId: string; kind: string; waiting: number }[];
  }>(`${base}/queue`);
  const workers = useLoad<{ items: WorkerRow[] }>(`${base}/workers`);
  const tenantLink = base.replace(/^\/tenants\//, "/t/");
  const rows = queue.data?.items ?? [];
  const backlog = rows.filter((row) => row.due > 0);
  const tasks = queue.data?.tasks?.reduce((sum, one) => sum + one.waiting, 0) ?? 0;
  return (
    <section aria-label="Queue" className="flex flex-col gap-3">
      <h2 className="m-0 text-title font-semibold">Queue</h2>
      {queue.error ? (
        <ErrorState error={queue.error} onRetry={queue.reload} />
      ) : !queue.data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <p className="m-0 text-ink-muted">Nothing is waiting, and nothing is running.</p>
      ) : (
        <>
          {backlog.length > 0 ? (
            <Notice tone="attention">
              {backlog.length === 1
                ? `Runs are waiting in ${backlog[0]?.workspace}`
                : `Runs are waiting in ${backlog.length} places`}
              {(() => {
                const oldest = Math.max(...backlog.map((row) => row.oldestSeconds ?? 0));
                return `, the oldest for ${waitWords(oldest)}.`;
              })()}
            </Notice>
          ) : null}
          <DataTable<(typeof rows)[number]>
            variant="static"
            label="Runs waiting, by workspace and pool"
            rows={rows}
            rowKey={(row) => `${row.workspaceId}:${row.pool ?? ""}`}
            empty={null}
            columns={[
              {
                header: "Workspace",
                cell: (row) => (
                  <Link to={`${tenantLink}/workspaces/${row.workspaceId}/runs?status=queued`}>
                    {row.workspace}
                  </Link>
                ),
              },
              {
                header: "Pool",
                cell: (row) => <span className="font-mono text-code">{row.pool ?? "default"}</span>,
              },
              { header: "Waiting", align: "end", cell: (row) => row.due },
              {
                header: "Oldest",
                cell: (row) => (row.oldestSeconds === null ? "—" : waitWords(row.oldestSeconds)),
              },
              { header: "Later", align: "end", priority: 2, cell: (row) => row.later },
              { header: "Running", align: "end", cell: (row) => row.running },
            ]}
          />
          {tasks > 0 ? (
            <p className="m-0 text-meta text-ink-muted">
              {tasks} task{tasks === 1 ? "" : "s"} for the platform waiting too: reading schemas,
              sending alerts, trying connections.
            </p>
          ) : null}
        </>
      )}
      {(workers.data?.items.length ?? 0) > 0 ? (
        <ul aria-label="Workers online" className="m-0 flex list-none flex-col gap-1.5 p-0">
          {workers.data?.items.map((worker) => (
            <li key={worker.id} className="flex flex-wrap items-center gap-2 text-body">
              <span className="font-medium">{worker.credentialName}</span>
              <span className="font-mono text-code text-ink-muted">
                {worker.version ?? "version unknown"}
              </span>
              {worker.outdated ? <StatePill state="outdated" detail="takes no tasks" /> : null}
              <span className="text-ink-muted">
                {worker.running.length === 0
                  ? "idle"
                  : `running ${worker.running.map((run) => run.script).join(", ")}`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function Workers({ base }: { base: string }) {
  const pools = useLoad<{ items: WorkerPool[] }>(`${base}/worker-pools`);
  // The address a worker is given, as the operator set it, or else the one this page is at.
  const instance = useLoad<{ publicUrl?: string | null }>("/instance");
  const instanceUrl = instance.data?.publicUrl ?? location.origin;
  const tenant = useLoad<{ managedWorkers: boolean }>(base);
  const managed = useLoad<{ state: "off" | "host" | "isolated" | "shared" | "refused" }>(
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
        <QueuePanel base={base} />
        {pools.error ? (
          <ErrorState error={pools.error} onRetry={pools.reload} />
        ) : !pools.data ? (
          <Loading />
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
            instance's operators write its code, and the workers this instance starts run beside its
            control plane, on its network, so it starts none for this tenant. Make a credential
            below and start a worker with it, or ask the operator to run a worker host: see "Workers
            the instance starts" in the self-hosting guide.
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
        description={`A worker outside the platform signs in with one of these: platform-worker --url ${instanceUrl} --token followed by the credential. The full command is shown when a credential is made.`}
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
              row.revokedAt ? <StatePill state="revoked" /> : <StatePill state="active" />,
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
          afterCreate: (result, dismiss) => {
            const token = (result as { token: string }).token;
            const command = `platform-worker --url ${instanceUrl} --token ${token}`;
            return (
              <OneTimeSecret value={token} noun="credential" onDone={dismiss}>
                <p className="m-0">Start a worker with it:</p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 rounded-control border border-line bg-surface px-2 py-1.5 font-mono text-code break-all select-all">
                    {command}
                  </code>
                  <CopyButton value={command} label="Copy the command" />
                </div>
              </OneTimeSecret>
            );
          },
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
  if (groups.error) return <ErrorState error={groups.error} onRetry={groups.reload} />;
  if (!groups.data) return <Loading />;

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h2 className="m-0 text-title font-semibold">Connection groups</h2>
        <p className="mt-1 mb-0 max-w-measure text-ink-muted">
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
              <code className="font-mono text-code font-semibold">{group.path}</code>
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
            <DataTable<(typeof group.members)[number]>
              variant="static"
              label={`Members of ${group.path}`}
              rows={group.members}
              rowKey={(member) => member.key}
              empty={null}
              columns={[
                { header: "Key", cell: (member) => code(member.key) },
                {
                  header: "Name",
                  priority: 2,
                  cell: (member) => <span className="text-ink-muted">{member.label}</span>,
                },
                {
                  header: "Points to",
                  truncate: true,
                  cell: (member) => member.config.baseUrl ?? "",
                },
                {
                  header: "Credential",
                  priority: 2,
                  cell: (member) => (member.hasCredential ? "Set" : "None"),
                },
                {
                  key: "remove",
                  header: "",
                  align: "end",
                  cell: (member) => (
                    <RemoveButton
                      confirm={`Scripts that ask ${group.path} for "${member.key}" will fail until it is added again.`}
                      run={() =>
                        api.delete(`${root}/connection-group-members/${member.key}/${group.path}`)
                      }
                      onDone={groups.reload}
                    />
                  ),
                },
              ]}
            />
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

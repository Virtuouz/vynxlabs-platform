import {
  type BadgeTone,
  Button,
  Closing,
  type LogLine,
  logText,
  Notice,
  Panel,
  saveText,
} from "@volvel/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, useLoad, useMay } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { InputDialog } from "../InputDialog.tsx";
import { Can } from "../kit/Can.tsx";
import { CollectionView } from "../kit/CollectionView.tsx";
import { DataTable } from "../kit/DataTable.tsx";
import { ago, between, count, duration } from "../kit/format.ts";
import { HealthCell } from "../kit/health.tsx";
import { ErrorState, Loading } from "../kit/LoadState.tsx";
import { FilterChips, Inspector, KeyValues } from "../kit/layout.tsx";
import { OneTimeSecret } from "../kit/OneTimeSecret.tsx";
import { consoleLink, ObjectLink } from "../kit/objects.tsx";
import { UsedBy, useReferences, usersOf } from "../kit/references.tsx";
import { mayPass, retryAfter } from "../kit/retry.ts";
import { STARTED_BY } from "../kit/starts.ts";
import { Code, Mono, type RunState, StatePill, Tag } from "../kit/status.tsx";
import { Time } from "../kit/Time.tsx";
import { Truncate } from "../kit/Truncate.tsx";
import { CopyButton, CreateDialog, ListScreen, Page, RemoveButton } from "../ListScreen.tsx";
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
import { type GroupMemberRow, GroupMemberSheet } from "./GroupMemberSheet.tsx";
import { OfferButton } from "./OfferToAgent.tsx";
import { askToDelete } from "./PromotionConfirm.tsx";
import { VariableSheet, type VariableValue } from "./VariableSheet.tsx";

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
  /** The trace the run is part of, as OpenTelemetry writes it. */
  traceId?: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export function took(run: Pick<Run, "startedAt" | "finishedAt">) {
  return between(run.startedAt, run.finishedAt);
}

export const TRIGGER = STARTED_BY;

/**
 * "Schedule reminders/hourly", with the trigger a link, and an event's run linked to its event.
 * The one place that says what started a run, for scripts and flows, on the run's page and in
 * the list's details. Runs of schedules before phase 29 name the schedule under `schedule`.
 * Nothing for a run that repeats another: the link to that run says it.
 */
export function startedBy(link: string, trigger: { type: string; [detail: string]: unknown }) {
  if (trigger.type === "retry" || trigger.type === "rerun") return null;
  // A step of a flow: its flow run, opened on the step.
  if (trigger.type === "flow" && typeof trigger.flowRunId === "string") {
    const node = typeof trigger.node === "string" ? trigger.node : "";
    return (
      <Link
        to={`${link}/runs/${trigger.flowRunId}${node ? `?step=${encodeURIComponent(node)}` : ""}`}
      >
        Step {node} of a flow run
      </Link>
    );
  }
  const word = TRIGGER[trigger.type] ?? trigger.type;
  const named = typeof trigger.trigger === "string" ? trigger.trigger : trigger.schedule;
  const event = typeof trigger.eventId === "string" ? trigger.eventId : undefined;
  if (typeof named === "string") {
    return (
      <span className="inline-flex flex-wrap items-baseline gap-x-2">
        <Link to={`${link}/triggers?trigger=${encodeURIComponent(named)}`}>
          {word} {named}
        </Link>
        {event ? (
          <Link to={`${link}/events?item=${encodeURIComponent(event)}`}>The event</Link>
        ) : null}
      </span>
    );
  }
  if (event) return <Link to={`${link}/events?item=${encodeURIComponent(event)}`}>{word}</Link>;
  return word;
}

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
  /** A change waits to be deployed. */
  draft?: boolean;
  /** A version of it runs here; false for a script that is only a draft yet. */
  deployed?: boolean;
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
  const [filter, setFilter] = useUrlParam<"all" | "failing" | "never" | "drafted">("filter", "all");
  const [chosen, setChosen] = useUrlParam("item", undefined, { push: true });
  const items = list.data?.items ?? [];
  const rows = items.filter(
    (row) =>
      filter === "all" ||
      (filter === "failing" && row.lastRun?.status === "failed") ||
      (filter === "never" && !row.lastRun) ||
      (filter === "drafted" && row.draft === true),
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
            {
              value: "drafted",
              label: "Drafted",
              count: items.filter((row) => row.draft === true).length,
            },
          ]}
        />
      }
      columns={[
        {
          header: "Script",
          cell: (row) => (
            <span className="flex min-w-0 flex-col">
              <span className="flex min-w-0 items-center gap-2">
                <Link
                  to={`${link}/scripts/${row.path}`}
                  className="min-w-0 font-mono text-code text-ink no-underline"
                >
                  <Truncate mode="middle">{row.path}</Truncate>
                </Link>
                {row.draft ? (
                  <StatePill state="draft">
                    {row.deployed === false ? "Draft, never deployed" : "Draft"}
                  </StatePill>
                ) : null}
              </span>
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
                <StatePill state={row.lastRun.state} detail={ago(row.lastRun.createdAt)} />
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
              <code className="font-mono">volvel deploy</code>.
            </>
          ) : (
            <>
              Scripts reach production when a dev workspace is promoted here, or with{" "}
              <code className="font-mono">volvel deploy</code> from the tenant's repository.
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
                  deployed={open.deployed !== false}
                  draft={open.draft === true}
                />
                <OfferButton
                  root={root}
                  kind="script"
                  path={open.path}
                  size="small"
                  deployed={open.deployed !== false}
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

export function RunButton({
  root,
  script,
  schema,
  runsLink,
  deployed = true,
  draft = false,
  size = "small",
}: {
  root: string;
  script: string;
  schema: Record<string, unknown>;
  runsLink: string;
  /** False for a script that is only a draft: nothing is there to run yet. */
  deployed?: boolean;
  /** A change waits to be deployed: a run starts the deployed version, not it. */
  draft?: boolean;
  size?: "small" | "regular";
}) {
  const [open, setOpen] = useState(false);
  if (!deployed)
    return (
      <span className="text-meta text-ink-muted">
        Not deployed yet. Deploy it to run it, or try the draft from its editor.
      </span>
    );
  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}>
        Run
      </Button>
      <InputDialog
        open={open}
        onClose={() => setOpen(false)}
        title={draft ? `Run ${script}, as deployed` : `Run ${script}`}
        action="Run"
        schema={schema}
        timing
        onSubmit={async (input, timing) => {
          const run = await api.post<Run>(`${root}/runs`, { script, input, ...timing });
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
        The first {count(earlier)} line{earlier === 1 ? " is" : "s are"} not shown here.
      </span>
      {onDownload ? (
        <Button size="small" variant="quiet" onClick={onDownload}>
          Download the whole log
        </Button>
      ) : null}
    </p>
  );
}

/**
 * What putting a version in place is called: "roll_back" when it is earlier than the one running,
 * "deploy" otherwise (a later one, one that never ran here, or nothing running). The one place
 * that words it, for the button, the question and the confirm.
 */
export function versionMove(version: number, running: number | null): "deploy" | "roll_back" {
  return running !== null && version < running ? "roll_back" : "deploy";
}

/**
 * "Deploy this version" or "Roll back to this version": the way back to a bundle that ran before,
 * or on to one that never ran here. It names the workspace, and asks as a danger in production.
 */
export function DeployVersion({
  root,
  workspace,
  bundleId,
  version,
  running,
  onDone,
}: {
  root: string;
  /** Whose version this is: the confirm names it. */
  workspace: { name: string; type: string };
  bundleId: string;
  version: number;
  /** The version running there now, or null when none is known. */
  running: number | null;
  onDone: () => void;
}) {
  const back = versionMove(version, running) === "roll_back";
  const verb = back ? "Roll back" : "Deploy";
  return (
    <Button
      size="small"
      onClick={async () => {
        const sure = await ask.confirm({
          title: back
            ? `Roll back ${workspace.name} to version ${version}?`
            : `Deploy version ${version} to ${workspace.name}?`,
          text: `${workspace.name} stops running what it runs now and starts running version ${version} at once. Runs in progress there finish on the version they started with.`,
          action: workspace.type === "production" ? `${verb} in production` : verb,
          danger: workspace.type === "production",
        });
        if (!sure) return;
        const activate = async (allowDelete?: string[]) => {
          try {
            await api.post(`${root}/deployments`, {
              bundleId,
              ...(allowDelete ? { allowDelete } : {}),
            });
            notify.success(`Version ${version} is what runs here now.`);
            onDone();
          } catch (error) {
            // A deletion taken for a rename done wrong is allowed by name, once someone has said to.
            if (error instanceof ApiError && error.code === "rename_suspected" && !allowDelete) {
              const paths = error.fields.map((field) => field.path);
              if (paths.length > 0 && (await askToDelete(paths, workspace.name))) {
                await activate(paths);
                return;
              }
            }
            notify.error(error);
          }
        };
        await activate();
      }}
    >
      {back ? "Roll back to this version" : "Deploy this version"}
    </Button>
  );
}

/**
 * Has one of the workspace's workers try a connection, from where scripts run,
 * and says what it found. What it found is kept, as the list's health.
 */
export function TestConnection({
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
export function ConnectionHealth({
  root,
  row,
  mayConnect = true,
}: {
  root: string;
  row: ConnectionRow;
  /** Connecting is a change of the connection: someone who may only read sees the state, not the button. */
  mayConnect?: boolean;
}) {
  if (!row.bound) return null;
  // What a member must do is beside what is wrong, where a phone shows it.
  if (row.oauth && row.oauth.status !== "connected") {
    const again = row.oauth.status === "needs_reconnect";
    return (
      <span className="flex flex-wrap items-center gap-2" title={row.oauth.problem ?? undefined}>
        <StatePill state={again ? "failed" : "waiting"}>
          {again ? "Needs reconnecting" : "Not connected"}
        </StatePill>
        {mayConnect ? (
          <Button
            size="small"
            variant="primary"
            onClick={() => startConnect(root, row.path).catch((error) => notify.error(error))}
          >
            {again ? "Reconnect" : "Connect"}
          </Button>
        ) : null}
      </span>
    );
  }
  return <HealthCell health={row.health} />;
}

export function Connections({ root, production = false }: { root: string; production?: boolean }) {
  const connectionUses = useReferences(root, "connection");
  const may = useMay(root, "connection:write", "resource:write", "run:read");
  const mayWrite = may("connection:write");
  // A new connection is declared in a draft (resource:write); in production one only waits to be set up.
  const mayNew = mayWrite && (production || may("resource:write"));
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
  // A refused promotion links here to set up what it names.
  // A connection's page sends here with `item`, as other lists are asked to show one.
  const [setupParam, setSetup] = useQueryValue("setup");
  const [itemParam, setItem] = useQueryValue("item");
  const setup = setupParam ?? itemParam;
  useEffect(() => {
    if (!setup || !list.data) return;
    const row = list.data.items.find((item) => item.path === setup);
    if (row) setEditing({ row });
    else notify.error(new Error(`There is no connection ${setup} here to set up.`));
    setSetup(null);
    setItem(null);
  }, [setup, list.data, setSetup, setItem]);
  const newButton = (
    <Button
      variant="primary"
      onClick={() => {
        // In production a connection is set up only if one waits: otherwise the form would be empty.
        if (production && list.data?.items.every((item) => item.bound)) {
          notify.info(
            "Nothing waits to be set up here. A connection is declared in a dev workspace and arrives here with a promotion.",
          );
          return;
        }
        setEditing({});
      }}
    >
      {production ? "Set up a connection" : "New connection"}
    </Button>
  );
  return (
    <>
      <ListScreen<ConnectionRow>
        title="Connections"
        description="Where each connection points in this workspace. Addresses and credentials are set here, never in the repository, so dev and production can differ."
        path={`${root}/connection-bindings`}
        rowKey={(row) => row.path}
        action={mayNew ? newButton : null}
        {...(mayWrite ? {} : { needs: "connection:write" })}
        columns={[
          {
            header: "Connection",
            cell: (row) => (
              <span className="inline-flex flex-wrap items-center gap-2">
                {row.arrives ? (
                  // Not deployed here yet: it has no page.
                  <Code>{row.path}</Code>
                ) : (
                  <ObjectLink link={consoleLink(root)} kind="connection" path={row.path} />
                )}
                {row.arrives ? <Tag tone="neutral">Arrives with the next promotion</Tag> : null}
                {row.draft === "new" ? (
                  <StatePill state="draft">Draft, never deployed</StatePill>
                ) : row.draft ? (
                  <Tag tone="draft">{row.draft === "removed" ? "Removing" : "Draft"}</Tag>
                ) : null}
              </span>
            ),
          },
          // Second, so a phone shows it without scrolling the table.
          {
            header: "Health",
            cell: (row) => <ConnectionHealth root={root} row={row} mayConnect={mayWrite} />,
          },
          {
            header: "Used by",
            cell: (row) => (
              <UsedBy
                uses={connectionUses(row.path)}
                failed={connectionUses.failed}
                loaded={connectionUses.loaded}
                link={consoleLink(root)}
                all={`${consoleLink(root)}/connections/${row.path}?tab=used-by`}
              />
            ),
          },
          {
            header: "Kind",
            cell: (row) => (
              <span className="whitespace-nowrap">
                {CONNECTOR_NAMES[row.connector] ?? <Code>{row.connector}</Code>}
              </span>
            ),
          },
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
              {row.bound && (!row.oauth || row.oauth.status === "connected") && may("run:read") ? (
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
                  usesUnread={connectionUses.failed || !connectionUses.loaded}
                  run={() => api.delete(`${root}/connection-bindings/${row.path}`)}
                  onDone={done}
                />
              ) : null}
            </span>
          );
        }}
      />
      <Closing subject={editing}>
        {(editing, shown) => (
          <ConnectionWizard
            key={editing.row?.path ?? "new"}
            root={root}
            open={shown}
            row={editing.row}
            rows={list.data?.items ?? []}
            production={production}
            returned={returned}
            onClose={() => {
              setEditing(null);
              setReturned(undefined);
            }}
            onSaved={reload}
          />
        )}
      </Closing>
    </>
  );
}

export function Variables({ root }: { root: string }) {
  const variableUses = useReferences(root, "variable");
  const mayWrite = useMay(root, "variable:write")("variable:write");
  const [editing, setEditing] = useState<{ row: VariableValue; reload: () => void } | null>(null);
  return (
    <>
      <ListScreen<{
        path: string;
        description: string;
        default: string | null;
        value: string | null;
        arrives?: boolean;
        draft?: "new" | "changed" | "removed" | null;
      }>
        title="Variables"
        {...(mayWrite ? {} : { needs: "variable:write" })}
        setupField="path"
        description="Settings a script reads at run time. Each workspace can set its own value. Without one, the default from the repository applies."
        path={`${root}/variable-values`}
        rowKey={(row) => row.path}
        columns={[
          {
            header: "Variable",
            cell: (row) => (
              <span className="inline-flex flex-wrap items-center gap-2">
                {row.draft === "new" ? (
                  // It has no page yet: its editor is where it is.
                  <Link
                    to={`${consoleLink(root)}/resources/edit/variable/${row.path}`}
                    className="font-mono text-code text-action"
                  >
                    {row.path}
                  </Link>
                ) : row.arrives ? (
                  <Code>{row.path}</Code>
                ) : (
                  <ObjectLink link={consoleLink(root)} kind="variable" path={row.path} />
                )}
                {row.draft === "new" ? (
                  <StatePill state="draft">Draft, never deployed</StatePill>
                ) : row.draft ? (
                  <Tag tone="draft">{row.draft === "removed" ? "Removing" : "Draft"}</Tag>
                ) : row.arrives ? (
                  <Tag tone="neutral">Arrives with the next promotion</Tag>
                ) : null}
              </span>
            ),
          },
          {
            header: "Read by",
            cell: (row) => (
              <UsedBy
                uses={variableUses(row.path)}
                failed={variableUses.failed}
                loaded={variableUses.loaded}
                link={consoleLink(root)}
                all={`${consoleLink(root)}/variables/${row.path}?tab=used-by`}
              />
            ),
          },
          {
            header: "For",
            cell: (row) => <span className="text-ink-muted">{row.description}</span>,
          },
          {
            header: "Value here",
            cell: (row) =>
              row.value === "" ? (
                <span className="text-ink-muted">Empty</span>
              ) : row.value !== null ? (
                <Code>{row.value}</Code>
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
            // An empty value is a value: a script that reads it gets "", not the default.
            {
              name: "value",
              label: "Value",
              required: false,
              hint: "Leave it empty to give the variable an empty value.",
            },
          ],
          submit: ({ path = "", value = "" }) =>
            api.put(`${root}/variable-values/${path}`, { value }),
          done: (_, { path = "", value = "" }) =>
            value === ""
              ? `Set ${path} to an empty value in this workspace.`
              : `Set ${path} in this workspace.`,
        }}
        rowActions={(row, reload) => (
          <span className="flex flex-wrap justify-end gap-2">
            {row.draft === "new" || row.draft === "removed" ? null : (
              <Button size="small" onClick={() => setEditing({ row, reload })}>
                {row.value !== null ? "Change" : "Set"}
              </Button>
            )}
            {row.value !== null ? (
              <RemoveButton
                label="Use default"
                confirm={`Clear the value of ${row.path} in this workspace?`}
                run={() => api.delete(`${root}/variable-values/${row.path}`)}
                onDone={reload}
              />
            ) : null}
          </span>
        )}
      />
      <Closing subject={editing}>
        {(one, shown) => (
          <VariableSheet
            root={root}
            open={shown}
            variable={one.row}
            onClose={() => setEditing(null)}
            onSaved={one.reload}
          />
        )}
      </Closing>
    </>
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

/** Whether a worker is in a pool now, as its state. */
function PoolState({ pool }: { pool: WorkerPool }) {
  return pool.online > 0 ? (
    <StatePill state="ok" detail={pool.lastSeenAt ? ago(pool.lastSeenAt) : undefined}>
      {pool.online} online
    </StatePill>
  ) : (
    <StatePill
      state={pool.workspaces.length > 0 && !pool.managed ? "warning" : "off"}
      detail={pool.lastSeenAt ? `last seen ${ago(pool.lastSeenAt)}` : "never seen"}
    >
      No worker online
    </StatePill>
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
                return `, the oldest for ${duration(oldest * 1000)}.`;
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
                cell: (row) =>
                  row.oldestSeconds === null ? "—" : duration(row.oldestSeconds * 1000),
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
  const tenant = useLoad<{ managedWorkers: boolean; managedWorkersLocked?: boolean }>(base);
  const managed = useLoad<{
    state: "off" | "unavailable" | "host" | "isolated" | "shared" | "refused";
  }>(`${base}/managed-workers`);
  const [adding, setAdding] = useState(false);
  const workspaces = useLoad<{ items: { id: string; name: string }[] }>(`${base}/workspaces`);
  const workspaceName = (id: string) =>
    workspaces.data?.items.find((workspace) => workspace.id === id)?.name ?? "A workspace";
  const made = (pools.data?.items ?? []).filter((pool) => pool.name !== null);
  const poolOptions = [
    { value: "", label: "Default pool: scripts that name no pool" },
    ...made.map((pool) => ({ value: pool.name as string, label: pool.name as string })),
  ];
  return (
    <Can base={base} permission="worker:write" what="this tenant's workers">
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
            <DataTable<WorkerPool>
              label="Worker pools"
              rows={pools.data.items}
              rowKey={(pool) => pool.id ?? pool.name ?? "default"}
              columns={[
                {
                  header: "State",
                  width: "w-56",
                  cell: (pool) => <PoolState pool={pool} />,
                },
                {
                  header: "Pool",
                  cell: (pool) => (
                    <span className="flex min-w-0 flex-col">
                      <span className="flex flex-wrap items-center gap-2">
                        {pool.name ? <Mono>{pool.name}</Mono> : "Default pool"}
                        {pool.managed ? <Tag>Instance-run</Tag> : null}
                        {pool.name && !pool.id ? <Tag tone="danger">Not made</Tag> : null}
                      </span>
                      {pool.description ? (
                        <span className="truncate text-meta text-ink-muted">
                          {pool.description}
                        </span>
                      ) : null}
                    </span>
                  ),
                },
                {
                  header: "Runs code of",
                  priority: 2,
                  cell: (pool) =>
                    pool.workspaces.length > 0 ? (
                      pool.workspaces.map((workspace) => workspace.name).join(", ")
                    ) : (
                      <span className="text-ink-subtle">No workspace yet</span>
                    ),
                },
                {
                  header: "Credentials",
                  priority: 3,
                  align: "end",
                  cell: (pool) => <Mono>{pool.credentials}</Mono>,
                },
              ]}
              actions={(pool) =>
                pool.id
                  ? [
                      {
                        label: "Remove the pool",
                        danger: true,
                        onSelect: async () => {
                          const label = pool.name ?? "Default pool";
                          const sure = await ask.confirm({
                            title: `Remove the pool "${label}"?`,
                            text: "Scripts that name it wait until it is made again.",
                            action: "Remove",
                            danger: true,
                          });
                          if (!sure) return;
                          try {
                            await api.delete(`${base}/worker-pools/${pool.id}`);
                            notify.success(`The pool "${label}" is removed.`);
                            pools.reload();
                          } catch (error) {
                            notify.error(error);
                          }
                        },
                      },
                    ]
                  : []
              }
              empty={{ title: "No pool yet", text: "Scripts that name no pool use the default." }}
            />
          )}
          {managed.data?.state === "refused" ? (
            <Notice tone="attention">
              <strong>This tenant's code runs on standalone workers only.</strong> People outside
              the instance's operators write its code, and the workers this instance starts run
              beside its control plane, on its network, so it starts none for this tenant. Make a
              credential below and start a worker with it, or ask the operator to run a worker host:
              see "Workers the instance starts" in the self-hosting guide.
            </Notice>
          ) : managed.data?.state === "shared" && tenant.data?.managedWorkers ? (
            <p className="m-0 text-meta text-ink-muted">
              Workers the instance starts run as the control plane's own user.
            </p>
          ) : null}
          {tenant.data ? (
            <div className="flex flex-wrap items-center gap-3">
              <span>
                {!tenant.data.managedWorkers
                  ? "The instance starts no workers for this tenant."
                  : managed.data?.state === "unavailable"
                    ? "This tenant lets the instance start workers, but the instance starts no workers for any tenant. Ask its operator, or run your own."
                    : managed.data?.state === "refused"
                      ? "The instance would start workers for this tenant, and does not: see above."
                      : managed.data
                        ? "The instance starts workers for the default pool when there is work."
                        : "Checking what the instance starts…"}
              </span>
              {!tenant.data.managedWorkers && tenant.data.managedWorkersLocked ? (
                <span className="text-ink-muted">
                  An operator turned this off. Only an operator can turn it on again.
                </span>
              ) : (
                <Button
                  size="small"
                  onClick={async () => {
                    const on = !tenant.data?.managedWorkers;
                    if (!on) {
                      // Every run of the default pool waits for a worker that is not the instance's.
                      const served = pools.data?.items.find(
                        (pool) => pool.name === null,
                      )?.credentials;
                      const sure = await ask.confirm({
                        title: "Stop the instance starting workers?",
                        text: `Runs of the default pool wait for a worker you start yourself. ${
                          served === undefined
                            ? "Check the credentials below first."
                            : served > 0
                              ? `${served === 1 ? "One credential serves" : `${served} credentials serve`} the default pool, so a worker started with it takes them.`
                              : "No credential serves the default pool, so every run of it waits until one does."
                        }`,
                        action: "Stop",
                        danger: true,
                      });
                      if (!sure) return;
                    }
                    await api
                      .patch(base, { managedWorkers: on })
                      .then(
                        () =>
                          notify.success(
                            on
                              ? "This tenant now lets the instance start workers for it."
                              : "The instance no longer starts workers for this tenant.",
                          ),
                        notify.error,
                      );
                    tenant.reload();
                    managed.reload();
                  }}
                >
                  {tenant.data.managedWorkers
                    ? "Run only on our own workers"
                    : "Let the instance run workers"}
                </Button>
              )}
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
          description={`A worker outside the platform signs in with one of these: volvel-worker --url ${instanceUrl} --token-stdin, with the credential on its standard input. The full command is shown when a credential is made.`}
          path={`${base}/worker-credentials`}
          rowKey={(row) => row.id}
          columns={[
            { header: "Name", cell: (row) => row.name },
            { header: "Credential", cell: (row) => <Code>{`${row.prefix}…`}</Code> },
            {
              header: "Pool",
              cell: (row) => (row.pool ? <Mono>{row.pool}</Mono> : "Default pool"),
            },
            {
              header: "Runs code of",
              cell: (row) =>
                row.workspaceId ? workspaceName(row.workspaceId) : "Every workspace of the tenant",
            },
            { header: "Created", cell: (row) => <Time value={row.createdAt} mode="ago" /> },
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
              {
                name: "workspaceId",
                label: "Runs code of",
                options: [
                  { value: "", label: "Every workspace of the tenant" },
                  ...(workspaces.data?.items ?? []).map((workspace) => ({
                    value: workspace.id,
                    label: workspace.name,
                  })),
                ],
                hint: "A worker for one workspace never runs another's scripts, so a client's network holds only that client's code.",
              },
            ],
            submit: async ({ name, pool, workspaceId }) => {
              const result = await api.post(`${base}/worker-credentials`, {
                name,
                ...(pool ? { pool } : {}),
                ...(workspaceId ? { workspaceId } : {}),
              });
              pools.reload();
              return result;
            },
            afterCreate: (result, dismiss) => {
              const token = (result as { token: string }).token;
              // The credential goes in on standard input: a command line is readable by every process on the host.
              const command = `printf '%s\\n' '${token}' | volvel-worker --url ${instanceUrl} --token-stdin`;
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
    </Can>
  );
}

type GroupMember = GroupMemberRow;
interface ConnectionGroup {
  path: string;
  description: string;
  connector: string;
  configSchema: Record<string, unknown>;
  members: GroupMember[];
  /** A change made in the console that waits to be deployed. */
  draft?: "new" | "changed" | "removed" | null;
  /** False: nothing declares the group any more, and its members were left behind. */
  declared?: boolean;
}

/**
 * Connection groups: sets of connections of one kind, such as every customer's
 * account. Members are added here and take effect on the next run, with no deploy.
 */
export function ConnectionGroups({ root }: { root: string }) {
  const groups = useLoad<{ items: ConnectionGroup[] }>(`${root}/connection-groups`);
  const [editing, setEditing] = useState<{ group: ConnectionGroup; member?: GroupMember }>();
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
        <Panel as="div" key={group.path} className="">
          <div className="flex flex-wrap items-center justify-between gap-3 border-line border-b px-4 py-3">
            <div className="min-w-0">
              <code className="font-mono text-code font-semibold">{group.path}</code>
              {group.draft === "new" ? (
                <span className="ml-3">
                  <StatePill state="draft">Draft, never deployed</StatePill>
                </span>
              ) : group.draft ? (
                <span className="ml-3">
                  <Tag tone="draft">{group.draft === "removed" ? "Removing" : "Draft"}</Tag>
                </span>
              ) : null}
              {group.declared === false ? (
                <span className="ml-3">
                  <Tag tone="neutral">Not declared</Tag>
                </span>
              ) : null}
              {group.description ? (
                <span className="ml-3 text-ink-muted">{group.description}</span>
              ) : null}
            </div>
            {group.declared === false ? null : group.draft === "new" ? (
              // Its members are kept by the deployed group, so there is nowhere to put one yet.
              <Button
                size="small"
                href={`${consoleLink(root)}/resources/edit/connection_group/${group.path}`}
              >
                Open the draft
              </Button>
            ) : (
              <Button size="small" variant="primary" onClick={() => setEditing({ group })}>
                Add a member
              </Button>
            )}
          </div>
          {group.declared === false ? (
            <p className="m-0 border-line border-b px-4 py-3 text-ink-muted">
              No deployed resource or draft declares this group any more, and its members were left.
              Remove them, or declare the group again as the kind they are.
            </p>
          ) : null}
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
                { header: "Key", cell: (member) => <Code>{member.key}</Code> },
                {
                  header: "Name",
                  priority: 2,
                  cell: (member) => <span className="text-ink-muted">{member.label}</span>,
                },
                {
                  header: "Points to",
                  truncate: true,
                  cell: (member) =>
                    String(member.config.baseUrl ?? member.config.host ?? member.config.url ?? ""),
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
                    <span className="flex flex-wrap justify-end gap-2">
                      {group.declared === false ? null : (
                        <Button size="small" onClick={() => setEditing({ group, member })}>
                          Change
                        </Button>
                      )}
                      <RemoveButton
                        confirm={`Scripts that ask ${group.path} for "${member.key}" will fail until it is added again.`}
                        run={() =>
                          api.delete(`${root}/connection-group-members/${member.key}/${group.path}`)
                        }
                        onDone={groups.reload}
                      />
                    </span>
                  ),
                },
              ]}
            />
          )}
        </Panel>
      ))}
      <Closing subject={editing}>
        {(which, open) => (
          <GroupMemberSheet
            key={`${which.group.path}/${which.member?.key ?? ""}`}
            root={root}
            group={which.group.path}
            schema={which.group.configSchema}
            member={which.member}
            open={open}
            onClose={() => setEditing(undefined)}
            onSaved={() => {
              setEditing(undefined);
              groups.reload();
            }}
          />
        )}
      </Closing>
    </section>
  );
}

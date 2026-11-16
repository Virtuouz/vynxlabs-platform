import {
  Button,
  JsonView,
  LogViewer,
  type MenuItem,
  Notice,
  ResultView,
  SelectField,
  Tabs,
  TextField,
} from "@vynxlabs/ui";
import { ArrowUpRight, CircleX, FileCode2, Lightbulb, Workflow, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, useLoad } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { StateAnnouncer } from "../kit/Announce.tsx";
import { CopyableId, CopyIcon, curlFor } from "../kit/copy.tsx";
import {
  type DataColumn,
  DataTable,
  DensityMenu,
  type SortState,
  useDensity,
} from "../kit/DataTable.tsx";
import { Elapsed, WaitedAndRan } from "../kit/Elapsed.tsx";
import { clockTime } from "../kit/LiveIndicator.tsx";
import { FilterChips, Inspector, KeyValues, MasterDetail, NextStep } from "../kit/layout.tsx";
import { Junction } from "../kit/motifs.tsx";
import { Reconnecting } from "../kit/Reconnecting.tsx";
import { Mono, type RunState, StatePill, Tag } from "../kit/status.tsx";
import { useTitleObject } from "../kit/title.ts";
import { Link, navigate, useUrlState } from "../router.tsx";
import { useStreamConnected } from "../stream.ts";
import { LogWindowNote, stamp, TRIGGER, useLiveRun, wholeLogDownload } from "./Execution.tsx";
import { fromNow } from "./Overview.tsx";

/** What the list can be narrowed to: a state, or either kind of waiting. */
type Filter = "queued" | "running" | "waiting" | "succeeded" | "failed" | "canceled";

interface Activity {
  kind: "script" | "flow";
  id: string;
  target: string;
  state: RunState;
  trigger: string;
  attempt: number;
  maxAttempts: number;
  error: string | null;
  errorSummary: string | null;
  outputSummary?: string | null;
  tags: string[];
  bundleVersion: number;
  createdAt: string;
  scheduledFor?: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface Insight {
  attempts: { attempt: number; startedAt: string; endedAt: string; failed: boolean }[];
  worker: { id: string; name: string; pool: string | null } | null;
  timeoutSeconds: number | null;
  uses: { connection: string; bound: boolean }[];
  diagnosis: { cause: string; next: string; section?: string } | null;
}

const WINDOWS = [
  { value: "1", label: "Last hour" },
  { value: "24", label: "Last 24 hours" },
  { value: "168", label: "Last 7 days" },
  { value: "all", label: "Everything kept" },
];

const FILTERS: { value: "all" | Filter; label: string; states: RunState[] }[] = [
  { value: "all", label: "All", states: [] },
  { value: "failed", label: "Failed", states: ["failed"] },
  { value: "running", label: "Running", states: ["running"] },
  { value: "waiting", label: "Waiting", states: ["waiting_approval", "waiting_time"] },
  { value: "queued", label: "Queued", states: ["queued"] },
  { value: "succeeded", label: "Succeeded", states: ["succeeded"] },
  { value: "canceled", label: "Canceled", states: ["canceled"] },
];
/** States in which a run may still change. */
const LIVE: RunState[] = ["queued", "running", "waiting_approval", "waiting_time"];

/** How long ago, or the date when it is older than a day. */
function started(iso: string) {
  const age = Date.now() - Date.parse(iso);
  return age < 86_400_000 ? fromNow(iso) : stamp(iso).slice(0, 16);
}

interface Page {
  items: Activity[];
  nextCursor: string | null;
  stateCounts: Record<string, number>;
  keptDays?: number;
}

/**
 * The start of each period's window, kept while the console is open, so coming
 * back to the list asks for the same thing and finds it already loaded.
 */
const windowStarts = new Map<string, { from: string; at: number }>();
function windowStart(hours: string, refresh: number): string | null {
  if (hours === "all") return null;
  const kept = windowStarts.get(hours);
  // A window is moved forward by a refresh, or once it is five minutes old.
  if (
    kept &&
    kept.at === refresh &&
    Date.parse(kept.from) > Date.now() - Number(hours) * 3_600_000 - 300_000
  )
    return kept.from;
  const from = new Date(Date.now() - Number(hours) * 3_600_000).toISOString();
  windowStarts.set(hours, { from, at: refresh });
  return from;
}
/** Pages loaded past the first, by what was asked, so Back finds them again. */
const laterPages = new Map<string, { items: Activity[]; next: string | null }>();

const RUNS_URL = {
  status: { type: "string" },
  kind: { type: "string" },
  when: { type: "string", default: "24" },
  q: { type: "string" },
  tag: { type: "list" },
  target: { type: "string" },
  sort: { type: "string" },
  dir: { type: "string" },
  run: { type: "string", push: true },
} as const;

/** The run's kind as a small icon before its path. */
function KindIcon({ kind }: { kind: "script" | "flow" }) {
  const Icon = kind === "flow" ? Workflow : FileCode2;
  return (
    <Icon
      aria-label={kind === "flow" ? "Flow" : "Script"}
      role="img"
      size={14}
      className="shrink-0 text-ink-subtle"
    />
  );
}

/**
 * Every run of the workspace, script and flow, in one list, with the chosen
 * one beside it: what happened, why it failed and what to do, its attempts
 * and its log. Its filters, its search, its order and the run chosen are in the
 * address, so a reload, a shared link or the back button keeps them.
 */
export function RunsWorkbench({
  root,
  link,
}: {
  root: string;
  /** The workspace's console address. */
  link: string;
}) {
  const [url, setUrl] = useUrlState(RUNS_URL);
  // An address from before the states, `?status=cancelled`, still works.
  const wanted = url.status === "cancelled" ? "canceled" : url.status;
  const status: "all" | Filter = FILTERS.some((one) => one.value === wanted)
    ? (wanted as Filter)
    : "all";
  const kind = url.kind === "script" || url.kind === "flow" ? url.kind : "all";
  const hours = WINDOWS.some((one) => one.value === url.when) ? url.when : "24";
  const search = url.q;
  const tags = url.tag;
  const sort: SortState =
    url.sort === "started" || url.sort === "duration"
      ? { key: url.sort, dir: url.dir === "asc" ? "asc" : "desc" }
      : undefined;
  const selected = url.run;
  const [typed, setTyped] = useState(search ?? "");
  const [tick, setTick] = useState(0);
  const [density, setDensity] = useDensity("runs", "standard");

  // What is typed reaches the address, and the list, once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => {
      if ((search ?? "") !== typed.trim()) setUrl({ q: typed.trim() || undefined });
    }, 300);
    return () => clearTimeout(timer);
  }, [typed, search, setUrl]);

  const from = windowStart(hours, tick);
  const query = new URLSearchParams({ limit: "100" });
  if (status !== "all") query.set("state", status);
  if (kind !== "all") query.set("kind", kind);
  if (from) query.set("from", from);
  if (search) query.set("q", search);
  for (const one of tags) query.append("tag", one);
  if (url.target) query.set("target", url.target);
  if (sort) {
    query.set("sort", sort.key);
    query.set("dir", sort.dir);
  }
  const base = `${root}/activity?${query}`;
  const list = useLoad<Page>(base);
  const [later, setLater] = useState(() => laterPages.get(base));
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string>();
  // Pages beyond the first start again whenever what is asked for changes.
  useEffect(() => {
    setLater(laterPages.get(base));
    setMoreError(undefined);
  }, [base]);
  const items = useMemo(
    () => [...(list.data?.items ?? []), ...(later?.items ?? [])],
    [list.data, later],
  );
  const next = later ? later.next : (list.data?.nextCursor ?? null);
  const loadMore = async () => {
    if (!next) return;
    setLoadingMore(true);
    setMoreError(undefined);
    try {
      const page = await api.get<Page>(`${base}&cursor=${encodeURIComponent(next)}`);
      const kept = { items: [...(later?.items ?? []), ...page.items], next: page.nextCursor };
      laterPages.set(base, kept);
      setLater(kept);
    } catch (error) {
      setMoreError((error as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };
  const refresh = () => {
    laterPages.delete(base);
    setLater(undefined);
    setTick((n) => n + 1);
  };
  const live = items.some((one) => LIVE.includes(one.state));

  // While anything is in progress, changes arrive as events. Without them, the list asks
  // again every few seconds.
  const streaming = useStreamConnected();
  useEffect(() => {
    if (!live || streaming) return;
    const timer = setInterval(() => list.reload(), 5000);
    return () => clearInterval(timer);
  }, [live, streaming, list.reload]);

  const [chosen, setChosen] = useState<Activity>();
  // Each time a run is chosen, even the one already open, focus goes to the inspector.
  const [openings, setOpenings] = useState(0);
  // The run in the address: the one clicked, one on the page, or, from a link or a
  // reload, one looked up by its ID, so a flow run opens as a flow run.
  const listed = chosen?.id === selected ? chosen : items.find((one) => one.id === selected);
  const looked = useLoad<Page>(
    selected && !listed && list.data
      ? `${root}/activity?${new URLSearchParams({ q: selected, limit: "1" })}`
      : null,
  );
  const picked = listed ?? looked.data?.items.find((one) => one.id === selected);
  const missing = Boolean(selected && !listed && looked.data && !picked);
  useTitleObject(selected ? (picked ? `Run of ${picked.target}` : "Run") : undefined);
  const counts = list.data?.stateCounts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const filtered = status !== "all" || Boolean(search) || tags.length > 0 || Boolean(url.target);
  const queued = counts.queued ?? 0;
  const scope = [
    url.target ? `of ${url.target}` : "",
    search ? `matching "${search}"` : "",
    tags.length > 0 ? `tagged ${tags.join(" and ")}` : "",
    from ? `from the ${WINDOWS.find((one) => one.value === hours)?.label.toLowerCase()}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  /** The way out of a backlog: the queued runs this list shows. */
  const cancelQueued = async () => {
    const sure = await ask.confirm({
      title: `Cancel ${queued} queued run${queued === 1 ? "" : "s"}?`,
      text: `Every queued run this list shows${scope ? ` (${scope})` : ""} is cancelled. Runs already going carry on, and a flow's steps are left to their flow.`,
      action: "Cancel queued runs",
      cancel: "Keep them",
      danger: true,
    });
    if (!sure) return;
    try {
      const done = await api.post<{ cancelled: number; more: boolean }>(`${root}/runs/cancel`, {
        include: "queued",
        filters: {
          ...(url.target ? { target: url.target } : {}),
          ...(search ? { q: search } : {}),
          ...(tags.length > 0 ? { tags } : {}),
          ...(from ? { from } : {}),
        },
      });
      notify.success(
        `${done.cancelled} queued run${done.cancelled === 1 ? "" : "s"} cancelled${done.more ? ". More are left: cancel again." : "."}`,
      );
      refresh();
    } catch (error) {
      notify.error(error);
    }
  };
  const open = (one: Activity) => {
    setChosen(one);
    setUrl({ run: one.id });
    setOpenings((n) => n + 1);
  };
  const addTag = (value: string) => {
    if (!tags.includes(value)) setUrl({ tag: [...tags, value] });
  };

  const actionsOf = (one: Activity): MenuItem[] => {
    const page = `${link}/runs/${one.id}`;
    const going = LIVE.includes(one.state);
    return [
      { label: "Open", onSelect: () => navigate(page) },
      ...(one.kind === "script" && !going
        ? [
            {
              label: "Run again",
              onSelect: () =>
                void api
                  .post<{ id: string }>(`${root}/runs/${one.id}/rerun`, { bundle: "original" })
                  .then((started) =>
                    notify.success("Started again.", {
                      action: {
                        label: "Open it",
                        onClick: () => navigate(`${link}/runs/${started.id}`),
                      },
                    }),
                  )
                  .then(refresh, notify.error),
            },
          ]
        : []),
      ...(one.kind === "flow" && one.state === "failed"
        ? [
            {
              label: "Retry from the failed step",
              onSelect: () =>
                void api
                  .post<{ id: string }>(`${root}/flow-runs/${one.id}/retry`, { from: "failed" })
                  .then((started) =>
                    notify.success("Retrying from the failed step.", {
                      action: {
                        label: "Open it",
                        onClick: () => navigate(`${link}/runs/${started.id}`),
                      },
                    }),
                  )
                  .then(refresh, notify.error),
            },
          ]
        : []),
      ...(going
        ? [
            {
              label: "Cancel",
              danger: true,
              onSelect: () =>
                void ask
                  .confirm({
                    title: `Cancel this run of ${one.target}?`,
                    text:
                      one.kind === "flow"
                        ? "The flow stops, with every step it has going."
                        : "The run stops where it is.",
                    action: "Cancel the run",
                    cancel: "Keep it",
                    danger: true,
                  })
                  .then((sure) =>
                    sure
                      ? api
                          .post(
                            `${root}/${one.kind === "flow" ? "flow-runs" : "runs"}/${one.id}/cancel`,
                          )
                          .then(refresh, notify.error)
                      : undefined,
                  ),
            },
          ]
        : []),
      {
        label: `Only runs of ${one.target}`,
        separated: true,
        onSelect: () => setUrl({ target: one.target }),
      },
      { label: "Copy the run ID", onSelect: () => void copyText(one.id, "Run ID copied.") },
      {
        label: "Copy a link to it",
        onSelect: () => void copyText(`${location.origin}${page}`, "Link copied."),
      },
    ];
  };

  const columns: DataColumn<Activity>[] = [
    {
      header: "State",
      width: "w-48",
      cell: (one) => <StatePill state={one.state} />,
    },
    {
      header: "Target",
      cell: (one) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <KindIcon kind={one.kind} />
          <Link
            to={`${link}/runs/${one.id}`}
            className="min-w-0 truncate font-mono text-telemetry text-ink no-underline hover:underline"
          >
            {one.target}
          </Link>
          {one.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              tabIndex={-1}
              onClick={() => addTag(tag)}
              aria-label={`Show only runs tagged ${tag}`}
              className="hidden shrink-0 md:inline"
            >
              <Tag tone="neutral">{tag}</Tag>
            </button>
          ))}
        </span>
      ),
    },
    {
      header: "Result",
      priority: 2,
      truncate: true,
      cell: (one) =>
        one.errorSummary ? (
          <span className="text-danger" title={one.errorSummary}>
            {one.errorSummary}
          </span>
        ) : one.outputSummary ? (
          <span className="font-mono text-telemetry text-ink-muted" title={one.outputSummary}>
            {one.outputSummary}
          </span>
        ) : (
          <span className="text-ink-subtle">—</span>
        ),
    },
    {
      header: "Trigger",
      priority: 3,
      width: "w-36",
      truncate: true,
      cell: (one) => <span className="text-ink-muted">{TRIGGER[one.trigger] ?? one.trigger}</span>,
    },
    {
      header: "Started",
      width: "w-32",
      sort: "started",
      cell: (one) => {
        const at = one.startedAt ?? one.scheduledFor ?? one.createdAt;
        return (
          <time dateTime={at} title={stamp(at)} className="whitespace-nowrap text-ink-muted">
            {started(at)}
          </time>
        );
      },
    },
    {
      header: "Duration",
      priority: 2,
      width: "w-24",
      align: "end",
      sort: "duration",
      cell: (one) =>
        one.startedAt ? (
          <Elapsed from={one.startedAt} to={one.finishedAt} className="text-ink-muted" />
        ) : (
          <Mono className="text-ink-subtle">—</Mono>
        ),
    },
    {
      header: "Attempt",
      priority: 3,
      width: "w-20",
      align: "end",
      cell: (one) =>
        one.maxAttempts > 1 && one.attempt > 1 ? (
          <Mono className="text-ink-muted">
            {one.attempt}/{one.maxAttempts}
          </Mono>
        ) : null,
    },
    {
      header: "Run ID",
      priority: 3,
      width: "w-28",
      cell: (one) => <Mono className="text-ink-subtle">{one.id.slice(-8)}</Mono>,
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 border-line border-b px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="m-0 text-display">Runs</h1>
            <p className="m-0 text-ink-muted">
              Every script and flow that ran here. A step of a flow is part of its flow's run.
              {list.data?.keptDays
                ? ` History is kept for ${list.data.keptDays} day${list.data.keptDays === 1 ? "" : "s"}.`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {!streaming && list.updatedAt ? (
              <span className="text-meta text-ink-muted">
                Updated {clockTime(list.updatedAt)}
                {live ? " · asked again every 5 s" : ""}
              </span>
            ) : null}
            <div className="w-full sm:w-64">
              <TextField
                name="q"
                label="Search"
                value={typed}
                required={false}
                placeholder="A path, a run ID, a tag or an error"
                onChange={setTyped}
              />
            </div>
            <div className="w-40">
              <SelectField
                label="Kind"
                name="kind"
                value={kind}
                onChange={(value) => setUrl({ kind: value === "all" ? undefined : value })}
                options={[
                  { value: "all", label: "Scripts and flows" },
                  { value: "script", label: "Scripts" },
                  { value: "flow", label: "Flows" },
                ]}
              />
            </div>
            <div className="w-40">
              <SelectField
                label="When"
                name="when"
                value={hours}
                onChange={(value) => setUrl({ when: value })}
                options={WINDOWS}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <FilterChips
            label="Status"
            value={status}
            onChange={(next) => setUrl({ status: next === "all" ? undefined : next })}
            options={FILTERS.map(({ value, label, states }) => ({
              value,
              label,
              count:
                value === "all" ? total : states.reduce((sum, one) => sum + (counts[one] ?? 0), 0),
            }))}
          />
          {url.target ? (
            <button
              type="button"
              onClick={() => setUrl({ target: undefined })}
              aria-label={`Stop showing only runs of ${url.target}`}
              className="flex items-center gap-1 rounded-control border border-line px-2 py-0.5 text-meta hover:bg-surface"
            >
              Of <Mono>{url.target}</Mono> <X aria-hidden="true" size={12} />
            </button>
          ) : null}
          {tags.map((one) => (
            <button
              key={one}
              type="button"
              onClick={() => setUrl({ tag: tags.filter((other) => other !== one) })}
              aria-label={`Stop showing only runs tagged ${one}`}
              className="flex items-center gap-1 rounded-control border border-line px-2 py-0.5 text-meta hover:bg-surface"
            >
              Tagged <Mono>{one}</Mono> <X aria-hidden="true" size={12} />
            </button>
          ))}
          <span className="ml-auto flex items-center gap-2">
            {queued > 0 ? (
              <Button size="small" onClick={cancelQueued}>
                Cancel {queued} queued
              </Button>
            ) : null}
            <DensityMenu density={density} onChange={setDensity} />
          </span>
        </div>
      </div>

      <MasterDetail
        inspector={
          selected ? (
            <Inspector
              open
              label="The chosen run"
              subject={`${selected}:${openings}`}
              title={picked?.target ?? "Run"}
              eyebrow="Run"
              onClose={() => setUrl({ run: undefined })}
            >
              {missing ? (
                <p className="m-0 text-ink-muted">
                  No run has this ID.{" "}
                  <button
                    type="button"
                    className="text-action underline-offset-2 hover:underline"
                    onClick={() => setUrl({ run: undefined })}
                  >
                    Back to the list
                  </button>
                </p>
              ) : looked.error && !picked ? (
                <Notice tone="danger">{looked.error.message}</Notice>
              ) : !picked ? (
                <p className="m-0 text-ink-muted">Loading…</p>
              ) : picked.kind === "flow" ? (
                <FlowRunSummary run={picked} link={link} />
              ) : (
                <ScriptRunPanel root={root} link={link} runId={selected} />
              )}
            </Inspector>
          ) : null
        }
      >
        <DataTable<Activity>
          id="runs"
          label="Runs"
          fill
          density={density}
          columns={columns}
          rows={list.data ? items : undefined}
          rowKey={(one) => one.id}
          selected={selected}
          onOpen={open}
          href={(one) => `${link}/runs/${one.id}`}
          sort={sort}
          onSort={(next) => setUrl({ sort: next?.key, dir: next?.dir })}
          actions={actionsOf}
          error={list.error?.message ?? moreError}
          onRetry={() => (list.error ? list.reload() : void loadMore())}
          refreshing={list.loading && Boolean(list.data)}
          empty={{ title: "Nothing ran in this time" }}
          filtered={
            filtered
              ? {
                  onClear: () => {
                    setTyped("");
                    setUrl({ status: undefined, q: undefined, tag: [], target: undefined });
                  },
                }
              : undefined
          }
          footer={
            next ? (
              <div className="flex justify-center">
                <Button onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "Loading…" : "Load more"}
                </Button>
              </div>
            ) : null
          }
        />
      </MasterDetail>
    </div>
  );
}

/** Puts text on the clipboard and says so. */
async function copyText(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    notify.success(done);
  } catch {
    notify.error(new Error("The clipboard could not be reached. Copy it from the page instead."));
  }
}

function FlowRunSummary({ run, link }: { run: Activity; link: string }) {
  return (
    <div className="flex flex-col gap-4">
      <StatePill state={run.state} />
      {run.error ? <Notice tone="danger">{run.error}</Notice> : null}
      <KeyValues
        rows={[
          { label: "Started", value: stamp(run.createdAt), mono: true },
          { label: "Finished", value: run.finishedAt ? stamp(run.finishedAt) : "—", mono: true },
          { label: "Started by", value: TRIGGER[run.trigger] ?? run.trigger },
          {
            label: "Flow",
            value: <Link to={`${link}/flows/${run.target}`}>{run.target}</Link>,
            mono: true,
          },
          {
            label: "Version",
            value: <Link to={`${link}/deployments`}>v{run.bundleVersion}</Link>,
            mono: true,
          },
          { label: "Run ID", value: <CopyableId value={run.id} label="Copy the run ID" /> },
        ]}
      />
      <Button variant="primary" onClick={() => navigate(`${link}/runs/${run.id}`)}>
        Open full view <ArrowUpRight aria-hidden="true" size={15} />
      </Button>
    </div>
  );
}

export function ScriptRunPanel({
  root,
  link,
  runId,
}: {
  root: string;
  link: string;
  runId: string;
}) {
  const { run, lines, earlier, error, reconnecting } = useLiveRun(root, runId);
  const insight = useLoad<Insight>(
    run && !["queued", "running"].includes(run.status) ? `${root}/runs/${runId}/insight` : null,
  );
  if (error && !run) return <Notice tone="danger">{error}</Notice>;
  if (!run) return <p className="m-0 text-ink-muted">Loading…</p>;
  const active = run.status === "queued" || run.status === "running";
  const failed = run.status === "failed";
  const logFile = `${run.script.replaceAll("/", "-")}-${run.id.slice(-12)}.log`;
  const wholeLog = wholeLogDownload(root, run.id, logFile, earlier);
  const diagnosis = insight.data?.diagnosis;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <StatePill state={run.state} />
          <WaitedAndRan run={run} />
        </span>
        <StateAnnouncer state={run.state} label={`Run of ${run.script}`} />
        <Reconnecting show={reconnecting} />
        <div className="flex gap-2">
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
                if (sure) await api.post(`${root}/runs/${runId}/cancel`).catch(notify.error);
              }}
            >
              Cancel run
            </Button>
          ) : null}
          <Button size="small" onClick={() => navigate(`${link}/runs/${runId}`)}>
            Open full view <ArrowUpRight aria-hidden="true" size={13} />
          </Button>
          <CopyIcon
            value={curlFor("POST", `${root}/runs`, { script: run.script, input: run.input })}
            label="Copy as curl: start this script again with the same input"
          />
        </div>
      </div>

      {failed && run.error ? (
        <div className="flex flex-col gap-2 rounded-panel border border-danger/40 bg-danger-soft/40 p-3">
          <span className="flex items-center gap-2 font-medium text-danger">
            <CircleX aria-hidden="true" size={14} /> Why it failed
          </span>
          <p className="m-0 font-mono text-telemetry break-words">{run.error.message}</p>
        </div>
      ) : null}
      {diagnosis ? (
        <div className="rounded-panel border border-line">
          <NextStep
            tone="attention"
            icon={<Lightbulb aria-hidden="true" size={15} />}
            title={diagnosis.cause}
            detail={diagnosis.next}
            action={
              diagnosis.section ? (
                <Button size="small" onClick={() => navigate(`${link}/${diagnosis.section}`)}>
                  Open {diagnosis.section}
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : null}
      {run.waitingFor ? <Notice tone="attention">{run.waitingFor}</Notice> : null}

      {insight.data && insight.data.attempts.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-label text-ink-subtle uppercase">Attempts</span>
          <div className="flex flex-wrap items-center gap-1.5 text-meta">
            {insight.data.attempts.map((one, index) => (
              <span key={one.attempt} className="flex items-center gap-1.5">
                {index > 0 ? <span aria-hidden="true" className="h-px w-3 bg-line-strong" /> : null}
                <Junction kind={one.failed ? "danger" : "here"} size={5} />
                <span className={one.failed ? "text-danger" : "text-ink-muted"}>
                  #{one.attempt} <Mono>{stamp(one.startedAt).slice(11)}</Mono>
                </span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <Tabs
        label="About this run"
        tabs={[
          {
            id: "logs",
            label: "Logs",
            content: (
              <div className="flex flex-col gap-2 pt-3">
                <LogWindowNote earlier={earlier} onDownload={wholeLog} />
                <LogViewer
                  lines={lines}
                  firstLine={earlier + 1}
                  live={active}
                  onDownload={wholeLog}
                  fileName={logFile}
                  empty={active ? "Waiting for the first line…" : "The script logged nothing."}
                />
              </div>
            ),
          },
          {
            id: "data",
            label: "Input and output",
            content: (
              <div className="flex flex-col gap-3 pt-3">
                <JsonView label="Input" value={run.input} maxHeight="16rem" />
                {run.status === "succeeded" ? (
                  <ResultView label="Result" value={run.output} maxHeight="16rem" />
                ) : (
                  <JsonView
                    label="Result"
                    tone={failed ? "danger" : "plain"}
                    maxHeight="16rem"
                    value={failed ? { error: run.error } : undefined}
                  />
                )}
              </div>
            ),
          },
          {
            id: "details",
            label: "Details",
            content: (
              <div className="flex flex-col gap-4 pt-3">
                <KeyValues
                  rows={[
                    { label: "Received", value: stamp(run.createdAt), mono: true },
                    {
                      label: "Started",
                      value: run.startedAt ? stamp(run.startedAt) : "—",
                      mono: true,
                    },
                    {
                      label: "Finished",
                      value: run.finishedAt ? stamp(run.finishedAt) : "—",
                      mono: true,
                    },
                    {
                      label: "Script",
                      value: <Link to={`${link}/scripts/edit/${run.script}`}>{run.script}</Link>,
                      mono: true,
                    },
                    {
                      label: "Started by",
                      value:
                        typeof run.trigger.trigger === "string" ? (
                          <Link
                            to={`${link}/triggers?trigger=${encodeURIComponent(run.trigger.trigger)}`}
                          >
                            {TRIGGER[run.trigger.type] ?? run.trigger.type} {run.trigger.trigger}
                          </Link>
                        ) : (
                          (TRIGGER[run.trigger.type] ?? run.trigger.type)
                        ),
                    },
                    {
                      label: "Version",
                      value: <Link to={`${link}/deployments`}>v{run.bundleVersion}</Link>,
                      mono: true,
                    },
                    {
                      label: "Worker",
                      value: insight.data?.worker
                        ? `${insight.data.worker.name}${insight.data.worker.pool ? ` · ${insight.data.worker.pool}` : ""}`
                        : "—",
                    },
                    {
                      label: "Timeout",
                      value: insight.data?.timeoutSeconds ? `${insight.data.timeoutSeconds}s` : "—",
                      mono: true,
                    },
                    {
                      label: "Run ID",
                      value: <CopyableId value={run.id} label="Copy the run ID" />,
                    },
                  ]}
                />
                {insight.data && insight.data.uses.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-label text-ink-subtle uppercase">Uses</span>
                    {insight.data.uses.map((one) => (
                      <span
                        key={one.connection}
                        className="flex items-center justify-between gap-2"
                      >
                        <Mono>{one.connection}</Mono>
                        {one.bound ? (
                          <Tag tone="live">Bound</Tag>
                        ) : (
                          <Tag tone="production">Not bound</Tag>
                        )}
                      </span>
                    ))}
                  </div>
                ) : null}
                {run.alert?.handlerRunId ? (
                  <Link to={`${link}/runs/${String(run.alert.handlerRunId)}`} className="text-meta">
                    The failure handler's run
                  </Link>
                ) : null}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

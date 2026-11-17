import { Button, JsonView, LogViewer, type MenuItem, Notice, ResultView, Tabs } from "@vynxlabs/ui";
import { ArrowUpRight, CircleX, FileCode2, Lightbulb, RotateCcw, Workflow, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, useLoad } from "../api.ts";
import { ask, copyText, notify } from "../ask.tsx";
import { StateAnnouncer } from "../kit/Announce.tsx";
import { type BatchAnswer, useBatch } from "../kit/BatchResult.tsx";
import { CopyIcon, curlFor, Identifier } from "../kit/copy.tsx";
import {
  type DataColumn,
  DataTable,
  DensityMenu,
  type SortState,
  useDensity,
} from "../kit/DataTable.tsx";
import { Elapsed, WaitedAndRan } from "../kit/Elapsed.tsx";
import { hm, } from "../kit/format.ts";
import { ErrorState, Loading } from "../kit/LoadState.tsx";
import { FilterChips, Inspector, KeyValues, MasterDetail, NextStep } from "../kit/layout.tsx";
import { Junction } from "../kit/motifs.tsx";
import { PageHeader } from "../kit/PageHeader.tsx";
import { Reconnecting } from "../kit/Reconnecting.tsx";
import { Mono, type RunState, StatePill, Tag } from "../kit/status.tsx";
import { Time } from "../kit/Time.tsx";
import { useTitleObject } from "../kit/title.ts";
import { ColumnsMenu, ViewsMenu } from "../kit/views.tsx";
import { Link, navigate, useUrlState } from "../router.tsx";
import { useStreamConnected } from "../stream.ts";
import { LogWindowNote, TRIGGER, useLiveRun, wholeLogDownload } from "./Execution.tsx";

/** What the list can be narrowed to: a state. `waiting`, from older addresses, is either kind. */
type Filter =
  | "queued"
  | "running"
  | "waiting"
  | "waiting_approval"
  | "waiting_time"
  | "succeeded"
  | "failed"
  | "canceled";

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
  wakeAt?: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface Insight {
  attempts: { attempt: number; startedAt: string; endedAt: string; failed: boolean }[];
  worker: { id: string; name: string; pool: string | null } | null;
  timeoutSeconds: number | null;
  uses: { connection: string; bound: boolean }[];
  diagnosis: { cause: string; next: string; section?: string } | null;
  /** Where in the script it failed, when the stack points into its own code. */
  location?: { file: string; line: number; column: number } | null;
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
  { value: "waiting_approval", label: "Waiting for approval", states: ["waiting_approval"] },
  { value: "waiting_time", label: "Waiting for a time", states: ["waiting_time"] },
  { value: "queued", label: "Queued", states: ["queued"] },
  { value: "succeeded", label: "Succeeded", states: ["succeeded"] },
  { value: "canceled", label: "Canceled", states: ["canceled"] },
];
/** States in which a run may still change. */
const LIVE: RunState[] = ["queued", "running", "waiting_approval", "waiting_time"];

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
  cols: { type: "list" },
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
  const status: "all" | Filter = [...FILTERS.map((one) => one.value), "waiting"].includes(
    wanted ?? "",
  )
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
  // Compact by default: a run is one line, and twenty fit a laptop's screen.
  const [density, setDensity] = useDensity("runs", "compact");

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
  // Rows checked for a batch: cancel them, run them again, retry them.
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const batch = useBatch();
  const kindOf = (id: string) => items.find((one) => one.id === id);
  const nameOf = (id: string) => kindOf(id)?.target ?? id;
  /** Sends one batch per kind: script runs and flow runs have their own routes. */
  const runBatch = async (
    ids: string[],
    script: "cancel" | "rerun" | undefined,
    flow: "cancel" | "retry" | "restart" | undefined,
  ): Promise<BatchAnswer> => {
    const scripts = ids.filter((id) => kindOf(id)?.kind === "script");
    const flows = ids.filter((id) => kindOf(id)?.kind === "flow");
    const answers: BatchAnswer[] = [];
    if (script && scripts.length > 0)
      answers.push(
        await api.post<BatchAnswer>(`${root}/runs/batch`, { action: script, ids: scripts }),
      );
    if (flow && flows.length > 0)
      answers.push(
        await api.post<BatchAnswer>(`${root}/flow-runs/batch`, { action: flow, ids: flows }),
      );
    return {
      results: answers.flatMap((one) => one.results),
      done: answers.reduce((sum, one) => sum + one.done, 0),
      failed: answers.reduce((sum, one) => sum + one.failed, 0),
    };
  };
  const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;
  const sample = (ids: string[]) => {
    const names = ids.slice(0, 3).map(nameOf).join(", ");
    return ids.length > 3 ? `${names} and ${ids.length - 3} more` : names;
  };
  const cancelChecked = async (ids: string[]) => {
    const sure = await ask.confirm({
      title: `Cancel ${plural(ids.length, "run")}?`,
      text: `${sample(ids)}. Runs that have finished are left as they are.`,
      action: `Cancel ${plural(ids.length, "run")}`,
      cancel: "Keep them",
      danger: true,
    });
    if (!sure) return;
    await batch.run(() => runBatch(ids, "cancel", "cancel"), {
      title: "Canceling runs",
      done: (count) => `${plural(count, "run")} canceled.`,
      name: nameOf,
      retry: (again) => runBatch(again, "cancel", "cancel"),
    });
    setChecked(new Set());
    refresh();
  };
  const againChecked = async (ids: string[]) => {
    const sure = await ask.confirm({
      title: `Run ${plural(ids.length, "run")} again?`,
      text: `${sample(ids)}. Scripts run again with the same input, on the version they ran; flows retry from their failed step, or from the start if none failed.`,
      action: "Run again",
    });
    if (!sure) return;
    const failedFlows = ids.filter(
      (id) => kindOf(id)?.kind === "flow" && kindOf(id)?.state === "failed",
    );
    const otherFlows = ids.filter(
      (id) => kindOf(id)?.kind === "flow" && kindOf(id)?.state !== "failed",
    );
    const scripts = ids.filter((id) => kindOf(id)?.kind === "script");
    const send = async (subset: string[]) => {
      const parts = await Promise.all([
        runBatch(
          subset.filter((id) => scripts.includes(id) || failedFlows.includes(id)),
          "rerun",
          "retry",
        ),
        runBatch(
          subset.filter((id) => otherFlows.includes(id)),
          undefined,
          "restart",
        ),
      ]);
      return {
        results: parts.flatMap((one) => one.results),
        done: parts.reduce((sum, one) => sum + one.done, 0),
        failed: parts.reduce((sum, one) => sum + one.failed, 0),
      };
    };
    await batch.run(() => send(ids), {
      title: "Running again",
      done: (count) => `${plural(count, "run")} started again.`,
      name: nameOf,
      retry: send,
    });
    setChecked(new Set());
    refresh();
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
      cell: (one) => <StatePill state={one.state} until={one.wakeAt} />,
    },
    {
      header: "Target",
      // From 1920 px the path keeps what it needs, and the result takes the rest.
      width: "3xl:w-[26rem]",
      cell: (one) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <KindIcon kind={one.kind} />
          <Link
            to={`${link}/runs/${one.id}`}
            className="min-w-0 truncate font-mono text-code text-ink no-underline hover:underline"
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
          <span className="font-mono text-code text-ink-muted" title={one.outputSummary}>
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
        return <Time value={at} mode="ago" className="text-ink-muted" />;
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
      <div className="flex flex-col gap-2 border-line border-b px-4 py-3 md:px-6">
        <PageHeader
          compact
          title="Runs"
          state={
            <p className="m-0 min-w-0 max-w-xl flex-1 truncate text-meta text-ink-muted">
              Scripts and flows that ran here; a flow's steps are part of its run.
              {list.data?.keptDays
                ? ` Kept ${list.data.keptDays} day${list.data.keptDays === 1 ? "" : "s"}.`
                : ""}
              {!streaming && list.updatedAt ? (
                <>
                  {" "}
                  Updated {hm(list.updatedAt)}
                  {live ? ", asked again every 5 s." : "."}
                </>
              ) : null}
            </p>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                aria-label="Search"
                placeholder="A path, a run ID, a tag or an error"
                value={typed}
                onChange={(event) => setTyped(event.currentTarget.value)}
                className="h-8 rounded-control border border-line-control bg-surface px-2 text-body-sm w-full sm:w-64"
              />
              <select
                aria-label="Kind"
                value={kind}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setUrl({ kind: value === "all" ? undefined : value });
                }}
                className="h-8 rounded-control border border-line-control bg-surface px-2 text-body-sm"
              >
                <option value="all">Scripts and flows</option>
                <option value="script">Scripts</option>
                <option value="flow">Flows</option>
              </select>
              <select
                aria-label="When"
                value={hours}
                onChange={(event) => setUrl({ when: event.currentTarget.value })}
                className="h-8 rounded-control border border-line-control bg-surface px-2 text-body-sm"
              >
                {WINDOWS.map((one) => (
                  <option key={one.value} value={one.value}>
                    {one.label}
                  </option>
                ))}
              </select>
            </div>
          }
        />
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
            <ColumnsMenu
              columns={columns.slice(1).map((column) => ({
                key: column.key ?? column.header,
                label: column.header,
              }))}
              shown={url.cols.length > 0 ? url.cols : undefined}
              onChange={(next) => setUrl({ cols: next ?? [] })}
            />
            <DensityMenu density={density} onChange={setDensity} />
            <ViewsMenu
              tenantId={tenantOf(root)}
              workspaceId={workspaceOf(root)}
              list="runs"
              omit={["run"]}
              density={{ value: density, set: setDensity }}
            />
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
                <ErrorState error={looked.error} onRetry={looked.reload} />
              ) : !picked ? (
                <Loading />
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
          columnsShown={url.cols.length > 0 ? url.cols : undefined}
          rows={list.data ? items : undefined}
          rowKey={(one) => one.id}
          selected={selected}
          onOpen={open}
          href={(one) => `${link}/runs/${one.id}`}
          checked={checked}
          onCheck={setChecked}
          batch={(keys) => (
            <>
              <Button
                size="small"
                variant="danger"
                disabled={batch.busy}
                onClick={() => void cancelChecked([...keys])}
              >
                Cancel
              </Button>
              <Button
                size="small"
                disabled={batch.busy}
                onClick={() => void againChecked([...keys])}
              >
                <RotateCcw aria-hidden="true" size={14} /> Run again
              </Button>
            </>
          )}
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
      {batch.dialog}
    </div>
  );
}

function FlowRunSummary({ run, link }: { run: Activity; link: string }) {
  return (
    <div className="flex flex-col gap-4">
      <StatePill state={run.state} />
      {run.error ? <Notice tone="danger">{run.error}</Notice> : null}
      <KeyValues
        rows={[
          { label: "Started", value: <Time value={run.createdAt} />, mono: true },
          {
            label: "Finished",
            value: run.finishedAt ? <Time value={run.finishedAt} /> : "—",
            mono: true,
          },
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
          { label: "Run ID", value: <Identifier value={run.id} label="Copy the run ID" /> },
        ]}
      />
      <Button variant="primary" onClick={() => navigate(`${link}/runs/${run.id}`)}>
        Open full view <ArrowUpRight aria-hidden="true" size={16} />
      </Button>
    </div>
  );
}

export function ScriptRunPanel({
  root,
  link,
  runId,
  tab,
  onTab,
  onLocation,
}: {
  root: string;
  link: string;
  runId: string;
  /** The tab shown, held by the caller so it stays chosen from one run to the next. */
  tab?: string | undefined;
  onTab?: ((tab: string) => void) | undefined;
  /** Offered when the failure points at a line of the script, to show it there. */
  onLocation?: ((location: { file: string; line: number; column: number }) => void) | undefined;
}) {
  const { run, lines, earlier, error, reconnecting } = useLiveRun(root, runId);
  const insight = useLoad<Insight>(
    run && !["queued", "running"].includes(run.status) ? `${root}/runs/${runId}/insight` : null,
  );
  if (error && !run) return <Notice tone="danger">{error}</Notice>;
  if (!run) return <Loading />;
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
            Open full view <ArrowUpRight aria-hidden="true" size={14} />
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
          <p className="m-0 font-mono text-code break-words">{run.error.message}</p>
          {insight.data?.location ? (
            onLocation ? (
              <Button
                size="small"
                onClick={() =>
                  onLocation(insight.data?.location as NonNullable<Insight["location"]>)
                }
              >
                Go to line {insight.data.location.line}
              </Button>
            ) : (
              <span className="text-meta text-ink-muted">
                At <Mono>{`${insight.data.location.file}:${insight.data.location.line}`}</Mono>
              </span>
            )
          ) : null}
        </div>
      ) : null}
      {diagnosis ? (
        <div className="rounded-panel border border-line">
          <NextStep
            tone="attention"
            icon={<Lightbulb aria-hidden="true" size={16} />}
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
                  #{one.attempt} <Time value={one.startedAt} className="font-mono text-code" />
                </span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <Tabs
        label="About this run"
        {...(tab !== undefined ? { value: tab } : {})}
        {...(onTab ? { onChange: onTab } : {})}
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
                    { label: "Received", value: <Time value={run.createdAt} />, mono: true },
                    {
                      label: "Started",
                      value: run.startedAt ? <Time value={run.startedAt} /> : "—",
                      mono: true,
                    },
                    {
                      label: "Finished",
                      value: run.finishedAt ? <Time value={run.finishedAt} /> : "—",
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
                      value: <Identifier value={run.id} label="Copy the run ID" />,
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
                        {one.bound ? <Tag tone="live">Bound</Tag> : <StatePill state="unbound" />}
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

/** The tenant's and workspace's IDs, from a workspace's API root. */
const tenantOf = (root: string) => root.split("/tenants/")[1]?.split("/")[0] ?? "";
const workspaceOf = (root: string) => root.split("/workspaces/")[1]?.split("/")[0];

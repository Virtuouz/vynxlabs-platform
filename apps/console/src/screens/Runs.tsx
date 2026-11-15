import {
  Button,
  JsonView,
  LogViewer,
  Notice,
  ResultView,
  SelectField,
  Tabs,
  TextField,
} from "@vynxlabs/ui";
import { ArrowUpRight, CircleX, Lightbulb, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { api, useLoad } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { CopyableId, CopyIcon, curlFor } from "../kit/copy.tsx";
import { FilterChips, Inspector, KeyValues, MasterDetail, NextStep } from "../kit/layout.tsx";
import { Junction } from "../kit/motifs.tsx";
import { Mono, type RunState, StatePill, Tag } from "../kit/status.tsx";
import { Link, navigate, useQueryValue } from "../router.tsx";
import { useStreamConnected } from "../stream.ts";
import { stamp, TRIGGER, took, useLiveRun } from "./Execution.tsx";
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
  tags: string[];
  bundleVersion: number;
  createdAt: string;
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
 * Every run of the workspace, script and flow, in one list, with the chosen
 * one beside it: what happened, why it failed and what to do, its attempts
 * and its log. Its filters, its search and the run chosen are in the address,
 * so a reload, a shared link or the back button keeps them.
 */
export function RunsWorkbench({
  root,
  link,
}: {
  root: string;
  /** The workspace's console address. */
  link: string;
}) {
  const [asked, ask] = useQueryValue("status");
  // An address from before the states, `?status=cancelled`, still works.
  const wanted = asked === "cancelled" ? "canceled" : asked;
  const status: "all" | Filter = FILTERS.some((one) => one.value === wanted)
    ? (wanted as Filter)
    : "all";
  const setStatus = (next: "all" | Filter) => ask(next === "all" ? null : next);
  const [kindAsked, setKindAsked] = useQueryValue("kind");
  const kind = kindAsked === "script" || kindAsked === "flow" ? kindAsked : "all";
  const [whenAsked, setWhenAsked] = useQueryValue("when");
  const hours = WINDOWS.some((one) => one.value === whenAsked) ? (whenAsked as string) : "24";
  const [search, setSearch] = useQueryValue("q");
  const [tag, setTag] = useQueryValue("tag");
  const [selected, choose] = useQueryValue("run");
  const [typed, setTyped] = useState(search ?? "");
  const [tick, setTick] = useState(0);
  const [more, setMore] = useState<string[]>([]);
  const [lastNext, setLastNext] = useState<string | null>(null);

  // What is typed reaches the address, and the list, once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => {
      if ((search ?? "") !== typed.trim()) setSearch(typed.trim() || null);
    }, 300);
    return () => clearTimeout(timer);
  }, [typed, search, setSearch]);

  // The window's start is fixed when the period is chosen or the list refreshes. Worked
  // out on each render, it would change the address every time and load without end.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `tick` moves the window forward
  const from = useMemo(
    () => (hours === "all" ? null : new Date(Date.now() - Number(hours) * 3_600_000).toISOString()),
    [hours, tick],
  );
  const query = new URLSearchParams({ limit: "100" });
  if (status !== "all") query.set("state", status);
  if (kind !== "all") query.set("kind", kind);
  if (from) query.set("from", from);
  if (search) query.set("q", search);
  if (tag) query.set("tag", tag);
  const base = `${root}/activity?${query}`;
  const list = useLoad<Page>(`${base}&tick=${tick}`);
  // Pages beyond the first start again whenever what is asked for changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `base` is what is asked for
  useEffect(() => {
    setMore([]);
    setLastNext(null);
  }, [base]);
  const items = list.data?.items ?? [];
  const live = items.some((one) => LIVE.includes(one.state));

  // While anything is in progress, changes arrive as events. Without them, the list asks
  // again every few seconds.
  const streaming = useStreamConnected();
  useEffect(() => {
    if (!live || streaming) return;
    const timer = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(timer);
  }, [live, streaming]);

  const [chosen, setChosen] = useState<Activity>();
  const counts = list.data?.stateCounts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const next = more.length === 0 ? (list.data?.nextCursor ?? null) : lastNext;
  const filtered = status !== "all" || Boolean(search) || Boolean(tag);
  const row = (one: Activity) => (
    <RunRow
      key={one.id}
      run={one}
      link={link}
      on={one.id === selected}
      onChoose={() => {
        setChosen(one);
        choose(one.id);
      }}
      onTag={(value) => setTag(value)}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 border-line border-b px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="m-0 text-display">Runs</h1>
            <p className="m-0 text-ink-muted">
              Every script and flow that ran here, newest first. A step of a flow is part of its
              flow's run.
              {list.data?.keptDays
                ? ` History is kept for ${list.data.keptDays} day${list.data.keptDays === 1 ? "" : "s"}.`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {live ? (
              <span className="flex items-center gap-1.5 text-meta text-ink-muted">
                <Junction kind="here" size={5} />
                {streaming ? "Live" : "Live · updates every 5s"}
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
                onChange={(value) => setKindAsked(value === "all" ? null : value)}
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
                onChange={(value) => setWhenAsked(value === "24" ? null : value)}
                options={WINDOWS}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <FilterChips
            label="Status"
            value={status}
            onChange={setStatus}
            options={FILTERS.map(({ value, label, states }) => ({
              value,
              label,
              count:
                value === "all" ? total : states.reduce((sum, one) => sum + (counts[one] ?? 0), 0),
            }))}
          />
          {tag ? (
            <button
              type="button"
              onClick={() => setTag(null)}
              aria-label={`Stop showing only runs tagged ${tag}`}
              className="flex items-center gap-1 rounded-control border border-line px-2 py-0.5 text-meta hover:bg-surface"
            >
              Tagged <Mono>{tag}</Mono> <X aria-hidden="true" size={12} />
            </button>
          ) : null}
        </div>
      </div>

      <MasterDetail
        inspector={
          selected ? (
            <Inspector
              open
              label="The chosen run"
              title={chosen?.id === selected ? chosen.target : "Run"}
              eyebrow="Run"
              onClose={() => choose(null)}
            >
              {chosen?.id === selected && chosen.kind === "flow" ? (
                <FlowRunSummary run={chosen} link={link} />
              ) : (
                <ScriptRunPanel root={root} link={link} runId={selected} />
              )}
            </Inspector>
          ) : null
        }
      >
        {list.error ? (
          <div className="p-4">
            <Notice tone="danger">{list.error.message}</Notice>
          </div>
        ) : !list.data ? (
          <p className="m-0 p-6 text-ink-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="m-0 p-6 text-ink-muted">
            {filtered ? "No runs like that in this time." : "Nothing ran in this time."}
          </p>
        ) : (
          <>
            <table className="w-full table-fixed border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-canvas">
                <tr className="border-line border-b text-meta text-ink-subtle">
                  <th className="w-32 px-4 py-2 font-medium md:w-40 md:pl-6">Status</th>
                  <th className="px-3 py-2 font-medium">What</th>
                  <th className="hidden w-44 px-3 py-2 font-medium lg:table-cell">Started by</th>
                  <th className="w-28 px-3 py-2 font-medium">Started</th>
                  <th className="hidden w-24 px-3 py-2 text-right font-medium sm:table-cell md:pr-6">
                    Took
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map(row)}
                {more.map((cursor, index) => (
                  <MoreRuns
                    key={cursor}
                    path={`${base}&cursor=${encodeURIComponent(cursor)}`}
                    render={row}
                    onNext={index === more.length - 1 ? setLastNext : undefined}
                  />
                ))}
              </tbody>
            </table>
            {next ? (
              <div className="flex justify-center p-4">
                <Button onClick={() => setMore((pages) => [...pages, next])}>Load more</Button>
              </div>
            ) : null}
          </>
        )}
      </MasterDetail>
    </div>
  );
}

/** A further page of the list, read by its cursor and refreshed like the first. */
function MoreRuns({
  path,
  render,
  onNext,
}: {
  path: string;
  render: (run: Activity) => ReactNode;
  onNext: ((cursor: string | null) => void) | undefined;
}) {
  const page = useLoad<Page>(path);
  useEffect(() => {
    if (page.data) onNext?.(page.data.nextCursor);
  }, [page.data, onNext]);
  if (page.error) {
    return (
      <tr>
        <td colSpan={5} className="p-4">
          <Notice tone="danger">{page.error.message}</Notice>
        </td>
      </tr>
    );
  }
  return <>{(page.data?.items ?? []).map(render)}</>;
}

function RunRow({
  run,
  link,
  on,
  onChoose,
  onTag,
}: {
  run: Activity;
  link: string;
  on: boolean;
  onChoose: () => void;
  onTag: (tag: string) => void;
}) {
  return (
    <tr
      aria-selected={on}
      onClick={onChoose}
      className={`cursor-pointer border-line border-b ${on ? "bg-selected" : "hover:bg-surface"}`}
    >
      <td className="px-4 py-2.5 align-top md:pl-6">
        <StatePill state={run.state} />
      </td>
      <td className="px-3 py-2.5">
        <Link
          to={`${link}/runs/${run.id}`}
          className="block font-mono text-telemetry break-all text-ink no-underline sm:truncate"
        >
          {run.target}
        </Link>
        {run.errorSummary ? (
          <span className="block truncate text-meta text-danger" title={run.errorSummary}>
            {run.errorSummary}
          </span>
        ) : (
          <span className="block truncate text-meta text-ink-subtle">
            {run.kind === "flow" ? "Flow" : "Script"}
            {run.maxAttempts > 1
              ? ` · attempt ${Math.max(run.attempt, 1)} of ${run.maxAttempts}`
              : ""}
          </span>
        )}
        {run.tags.length > 0 ? (
          <span className="mt-1 flex flex-wrap gap-1">
            {run.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onTag(tag);
                }}
                aria-label={`Show only runs tagged ${tag}`}
              >
                <Tag tone="neutral">{tag}</Tag>
              </button>
            ))}
          </span>
        ) : null}
      </td>
      <td className="hidden px-3 py-2.5 align-top text-ink-muted lg:table-cell">
        {TRIGGER[run.trigger] ?? run.trigger}
      </td>
      <td className="px-3 py-2.5 align-top whitespace-nowrap text-ink-muted">
        {started(run.createdAt)}
      </td>
      <td className="hidden px-3 py-2.5 text-right align-top sm:table-cell md:pr-6">
        <Mono className="text-ink-muted">{took(run) || "—"}</Mono>
      </td>
    </tr>
  );
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
  const { run, lines, error } = useLiveRun(root, runId);
  const insight = useLoad<Insight>(
    run && !["queued", "running"].includes(run.status) ? `${root}/runs/${runId}/insight` : null,
  );
  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!run) return <p className="m-0 text-ink-muted">Loading…</p>;
  const active = run.status === "queued" || run.status === "running";
  const failed = run.status === "failed";
  const diagnosis = insight.data?.diagnosis;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatePill state={run.state} detail={took(run) || undefined} />
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
              <div className="pt-3">
                <LogViewer
                  lines={lines}
                  live={active}
                  fileName={`${run.script.replaceAll("/", "-")}-${run.id.slice(-12)}.log`}
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

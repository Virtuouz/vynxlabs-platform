import {
  Button,
  duration,
  EmptyState,
  Facts,
  JsonView,
  LogViewer,
  Notice,
  Table,
  Tabs,
  Timeline,
  type TimelineRow,
} from "@vynxlabs/ui";
import { type ReactNode, useEffect, useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { FlowGraph, type GraphEdge, type GraphNode, type Positions } from "../FlowGraph.tsx";
import { InputDialog } from "../InputDialog.tsx";
import { CollectionView } from "../kit/CollectionView.tsx";
import { FilterChips, Inspector, KeyValues } from "../kit/layout.tsx";
import { Junction } from "../kit/motifs.tsx";
import { Mono, type RunState, StatePill, Tag } from "../kit/status.tsx";
import { Page, when } from "../ListScreen.tsx";
import { Link, navigate } from "../router.tsx";
import { useStreamConnected, useStreamEvents } from "../stream.ts";
import { useLiveRun } from "./Execution.tsx";
import { fromNow } from "./Overview.tsx";

const code = (text: string) => <code className="font-mono text-[13px]">{text}</code>;

type FlowStatus = "running" | "succeeded" | "failed" | "cancelled";
/** How a run began, as the end of a sentence. */
const STARTED: Record<string, string> = {
  manual: "by hand",
  schedule: "by its schedule",
  webhook: "by a webhook",
  event: "by an event",
  flow: "by another flow",
};

const TRIGGER: Record<string, string> = {
  manual: "By hand",
  schedule: "Schedule",
  webhook: "Webhook",
  event: "Event",
  flow: "Another flow",
};

interface FlowRow {
  path: string;
  description: string;
  nodeCount: number;
  triggers: string[];
  lastRun: { id: string; status: FlowStatus; state: RunState; createdAt: string } | null;
  version: number | null;
  draft: "changed" | "removed" | null;
  starts: { type: string; detail: string | null }[];
  runs: { lastDay: number; failedLastDay: number; waiting: number };
}

type FlowFilter = "all" | "failing" | "waiting" | "draft";

/** The workspace's processes: what starts each, how its runs went, and what is drafted. */
export function Flows({
  root,
  link,
  editable = false,
}: {
  root: string;
  link: string;
  /** Whether flows can be drawn here: true in a dev workspace. */
  editable?: boolean;
}) {
  const list = useLoad<{ items: FlowRow[] }>(`${root}/flows`);
  const [filter, setFilter] = useState<FlowFilter>("all");
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<string>();
  const items = list.data?.items ?? [];
  const wanted = search.trim().toLowerCase();
  const rows = items.filter(
    (row) =>
      (filter === "all" ||
        (filter === "failing" && row.runs.failedLastDay > 0) ||
        (filter === "waiting" && row.runs.waiting > 0) ||
        (filter === "draft" && row.draft !== null)) &&
      (!wanted ||
        row.path.toLowerCase().includes(wanted) ||
        row.description.toLowerCase().includes(wanted)),
  );
  const open = items.find((row) => row.path === chosen);
  const waiting = items.reduce((sum, row) => sum + row.runs.waiting, 0);

  return (
    <CollectionView<FlowRow>
      title="Flows"
      description="A flow is a graph of steps the platform runs in order, remembering where it is. It survives a restart."
      actions={
        editable ? (
          <Button variant="primary" onClick={() => navigate(`${link}/flows/new`)}>
            New flow
          </Button>
        ) : undefined
      }
      toolbar={
        <div className="flex flex-col gap-3">
          {waiting > 0 ? (
            <Notice tone="attention">
              {waiting} run{waiting === 1 ? " is" : "s are"} waiting for a person.{" "}
              <Link to={link.replace(/\/workspaces\/.*$/, "/approvals")}>Decide</Link>
            </Notice>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex h-8 w-64 max-w-full items-center gap-2 rounded-control border border-line bg-structure px-2.5 text-ink-subtle">
              <span className="sr-only">Find a flow</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find by path or purpose"
                className="min-w-0 flex-1 border-0 bg-transparent text-ink outline-none placeholder:text-ink-subtle"
              />
            </label>
            <FilterChips<FlowFilter>
              label="Show"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All", count: items.length },
                {
                  value: "failing",
                  label: "Failed today",
                  count: items.filter((row) => row.runs.failedLastDay > 0).length,
                },
                {
                  value: "waiting",
                  label: "Waiting",
                  count: items.filter((row) => row.runs.waiting > 0).length,
                },
                {
                  value: "draft",
                  label: "Drafted",
                  count: items.filter((row) => row.draft).length,
                },
              ]}
            />
          </div>
        </div>
      }
      columns={[
        {
          header: "Flow",
          cell: (row) => (
            <span className="flex min-w-0 flex-col">
              <Link
                to={`${link}/flows/${row.path}`}
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
          header: "Started by",
          priority: 3,
          cell: (row) => (
            <span className="flex flex-col text-ink-muted">
              {row.starts.length === 0
                ? "Nothing yet"
                : row.starts.map((one) => (
                    <span key={`${one.type}-${one.detail}`} className="truncate">
                      {TRIGGER[one.type] ?? one.type}
                      {one.detail ? (
                        <span className="font-mono text-telemetry text-ink-subtle">
                          {" "}
                          · {one.detail}
                        </span>
                      ) : null}
                    </span>
                  ))}
            </span>
          ),
        },
        {
          header: "Steps",
          priority: 3,
          cell: (row) => <StepChain count={row.nodeCount} />,
        },
        {
          header: "Last run",
          priority: 2,
          cell: (row) =>
            row.lastRun ? (
              <span className="flex flex-col">
                <StatePill state={row.lastRun.state} detail={fromNow(row.lastRun.createdAt)} />
                <span className="text-meta text-ink-subtle">
                  {row.runs.lastDay} today
                  {row.runs.failedLastDay ? ` · ${row.runs.failedLastDay} failed` : ""}
                  {row.runs.waiting ? ` · ${row.runs.waiting} waiting` : ""}
                </span>
              </span>
            ) : (
              <span className="text-ink-subtle">Never</span>
            ),
        },
        {
          header: "State",
          cell: (row) => (
            <span className="flex flex-wrap items-center gap-1.5">
              {row.version === null ? null : <Tag tone="live">v{row.version}</Tag>}
              {row.draft === "changed" ? <Tag tone="draft">Draft</Tag> : null}
              {row.draft === "removed" ? <Tag tone="danger">Removing</Tag> : null}
            </span>
          ),
        },
      ]}
      rows={list.data ? rows : undefined}
      rowKey={(row) => row.path}
      selected={chosen}
      onSelect={(row) => setChosen(row.path)}
      error={list.error?.message}
      empty={{
        title: items.length > 0 ? "No flow matches" : "No flows yet",
        text:
          items.length > 0
            ? "Try another word, or show every flow."
            : editable
              ? "Draw one here, or define one in the tenant's repository with defineFlow."
              : "Flows reach a production workspace by promotion from its dev workspace.",
        ...(editable && items.length === 0
          ? {
              action: (
                <Button variant="primary" onClick={() => navigate(`${link}/flows/new`)}>
                  New flow
                </Button>
              ),
            }
          : {}),
      }}
      inspector={
        open ? (
          <Inspector
            open
            label="The chosen flow"
            title={open.path}
            eyebrow="Flow"
            onClose={() => setChosen(undefined)}
            footer={
              <>
                <Button variant="primary" onClick={() => navigate(`${link}/flows/${open.path}`)}>
                  Open
                </Button>
                {editable && open.draft !== "removed" ? (
                  <Button onClick={() => navigate(`${link}/flows/edit/${open.path}`)}>Edit</Button>
                ) : null}
              </>
            }
          >
            <div className="flex flex-col gap-4">
              <p className="m-0 text-ink-muted">{open.description || "No description."}</p>
              <KeyValues
                rows={[
                  {
                    label: "Deployed",
                    value: open.version === null ? "Not yet" : `v${open.version}`,
                    mono: true,
                  },
                  {
                    label: "Draft",
                    value:
                      open.draft === "changed"
                        ? "Changes saved, not deployed"
                        : open.draft === "removed"
                          ? "Removed in the draft"
                          : "None",
                  },
                  { label: "Steps", value: String(open.nodeCount), mono: true },
                  {
                    label: "Runs today",
                    value: `${open.runs.lastDay}, ${open.runs.failedLastDay} failed`,
                    mono: true,
                  },
                ]}
              />
              <div className="flex flex-col gap-1.5">
                <span className="text-label text-ink-subtle uppercase">What starts it</span>
                {open.starts.length === 0 ? (
                  <span className="text-ink-subtle">No trigger yet.</span>
                ) : (
                  open.starts.map((one) => (
                    <span key={`${one.type}-${one.detail}`} className="flex items-center gap-2">
                      <Junction kind="here" size={5} />
                      {TRIGGER[one.type] ?? one.type}
                      {one.detail ? <Mono className="text-ink-subtle">{one.detail}</Mono> : null}
                    </span>
                  ))
                )}
              </div>
              {open.lastRun ? (
                <Link to={`${link}/runs/${open.lastRun.id}`} className="text-meta">
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

/** A flow's size as a short chain of junctions. */
function StepChain({ count }: { count: number }) {
  const shown = Math.min(count, 6);
  return (
    <span className="flex items-center gap-1" title={`${count} steps`}>
      {Array.from({ length: shown }, (_, index) => `step-${index}`).map((key, index) => (
        <span key={key} className="flex items-center gap-1">
          {index > 0 ? <span aria-hidden="true" className="h-px w-2 bg-line-strong" /> : null}
          <Junction kind={index === 0 ? "here" : "plain"} size={5} />
        </span>
      ))}
      <Mono className="ml-1.5 text-ink-subtle">{count}</Mono>
    </span>
  );
}

export interface FlowDetail {
  path: string;
  version: number;
  description: string;
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
  layout: Positions;
  triggers: { node: string; type: string; nextFireAt: string | null; url: string | null }[];
}

interface FlowRunRow {
  id: string;
  status: FlowStatus;
  state: RunState;
  trigger: { type: string };
  createdAt: string;
  finishedAt: string | null;
}

/** One flow: its graph, how it is started, and its recent runs. */
export function FlowView({
  root,
  path,
  link,
  editable = false,
}: {
  root: string;
  path: string;
  link: string;
  editable?: boolean;
}) {
  const flow = useLoad<FlowDetail>(`${root}/flows/${path}`);
  const runs = useLoad<{ items: FlowRunRow[] }>(
    `${root}/flow-runs?flow=${encodeURIComponent(path)}&limit=20`,
  );
  const [saved, setSaved] = useState<"saving" | "saved" | string>();
  const [starting, setStarting] = useState(false);
  if (flow.error) return <Notice tone="danger">{flow.error.message}</Notice>;
  if (!flow.data) return <p className="text-ink-muted">Loading…</p>;
  const data = flow.data;
  const manual = Object.values(data.nodes).some(
    (node) => node.type === "trigger" && (node.trigger as { type: string }).type === "manual",
  );

  return (
    <Page
      title={data.path}
      description={data.description}
      action={
        manual ? (
          <Button variant="primary" onClick={() => setStarting(true)}>
            Start flow
          </Button>
        ) : undefined
      }
    >
      <InputDialog
        open={starting}
        onClose={() => setStarting(false)}
        title={`Start ${data.path}`}
        action="Start flow"
        onSubmit={async (input) => {
          const started = await api.post<{ id: string }>(`${root}/flow-runs`, {
            flow: data.path,
            input,
          });
          navigate(`${link}/runs/${started.id}`);
        }}
      />
      <span className="flex flex-wrap items-center gap-4">
        <Link to={`${link}/flows`} className="text-action">
          All flows
        </Link>
        {editable ? (
          <Link to={`${link}/flows/edit/${data.path}`} className="text-action">
            Edit this flow
          </Link>
        ) : null}
      </span>
      <FlowGraph
        nodes={data.nodes}
        edges={data.edges}
        layout={data.layout}
        onMove={async (positions) => {
          setSaved("saving");
          try {
            await api.put(`${root}/flow-layouts/${data.path}`, { positions });
            setSaved("saved");
          } catch (error) {
            setSaved(
              (error as ApiError).status === 403
                ? "You can arrange the graph, but only someone who manages flows can save it."
                : (error as Error).message,
            );
          }
        }}
      />
      <p className="m-0 text-[13px] text-ink-muted" aria-live="polite">
        {saved === "saving"
          ? "Saving the arrangement…"
          : saved === "saved"
            ? "Arrangement saved. The flow itself is unchanged."
            : (saved ??
              "Drag a step to arrange the graph. Arranging changes nothing about how the flow runs.")}
      </p>
      {data.triggers.length > 0 ? (
        <section>
          <h2 className="mt-2 mb-2 text-base font-semibold">How it starts</h2>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {data.triggers.map((trigger) => (
              <li key={trigger.node}>
                {code(trigger.node)}{" "}
                {trigger.type === "schedule" && trigger.nextFireAt ? (
                  <span>runs next at {when(trigger.nextFireAt)}</span>
                ) : trigger.type === "webhook" ? (
                  trigger.url ? (
                    <span className="font-mono text-[13px] break-all select-all">
                      POST {trigger.url}
                    </span>
                  ) : (
                    <span className="text-ink-muted">
                      a webhook. Its address is shown to those who manage triggers.
                    </span>
                  )
                ) : (
                  <span>starts when its event is published</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section>
        <h2 className="mt-2 mb-2 text-base font-semibold">Recent runs</h2>
        <Table
          rows={runs.data?.items ?? []}
          rowKey={(row) => row.id}
          empty={<EmptyState title="This flow has not run yet" />}
          columns={[
            {
              header: "Started",
              cell: (row) => (
                <Link to={`${link}/runs/${row.id}`} className="text-action">
                  {when(row.createdAt)}
                </Link>
              ),
            },
            { header: "Status", cell: (row) => <StatePill state={row.state} /> },
            { header: "Started by", cell: (row) => TRIGGER[row.trigger.type] ?? row.trigger.type },
          ]}
        />
      </section>
    </Page>
  );
}

export interface StepRow {
  node: string;
  item: string;
  status: string;
  state: RunState;
  outputName: string | null;
  output: unknown;
  error: { message: string } | null;
  handled: boolean;
  runId: string | null;
  childFlowRunId: string | null;
  wakeAt: string | null;
  detail: { title?: string; detail?: unknown };
  copiedFrom: { flowRunId: string; runId?: string; childFlowRunId?: string } | null;
  startedAt: string;
  pickedUpAt: string | null;
  finishedAt: string | null;
}
export interface FlowRunDetail extends FlowRunRow {
  flow: string;
  triggerNode: string;
  bundleId: string;
  bundleVersion: number;
  error: { message: string } | null;
  errorSummary: string | null;
  tags: string[];
  retryOf: string | null;
  retries: { id: string; state: RunState; createdAt: string }[];
  startedBy: { type: string; id: string | null };
  input: unknown;
  output: unknown;
  steps: StepRow[];
}

/**
 * A step as a row of the timeline. A step that runs a script waits for a worker
 * first. An approval or a delay is held on purpose for its whole length.
 */
export function timelineRow(step: StepRow, runStartedAt?: string): TimelineRow {
  // A step a retry kept was done in the run it retries. Here it took no time at all.
  if (step.copiedFrom && runStartedAt) {
    const at = Date.parse(runStartedAt);
    return {
      id: step.node,
      label: `${step.node} · kept`,
      start: at,
      end: at,
      tone: "muted",
      segments: [],
    };
  }
  const start = Date.parse(step.startedAt);
  const end = step.finishedAt ? Date.parse(step.finishedAt) : undefined;
  const held = step.detail.title !== undefined || step.wakeAt !== null;
  const picked = step.pickedUpAt ? Date.parse(step.pickedUpAt) : undefined;
  const last = end ?? Date.now();
  return {
    id: step.node,
    label: step.node,
    start,
    end,
    tone: step.status === "failed" ? "danger" : step.status === "skipped" ? "muted" : "plain",
    segments: held
      ? [{ kind: "hold", until: last }]
      : step.runId
        ? picked
          ? [
              { kind: "wait", until: picked },
              { kind: "run", until: last },
            ]
          : [{ kind: "wait", until: last }]
        : [{ kind: "run", until: last }],
  };
}

/** One flow run, on a time axis and on the flow's graph, refreshed while it is in progress. */
export function FlowRunView({
  root,
  id,
  link,
  header,
}: {
  root: string;
  id: string;
  link: string;
  /** Drawn in place of the page's own title, with the run and a way to read it again. */
  header?: (run: FlowRunDetail, refresh: () => void, flow: FlowDetail | undefined) => ReactNode;
}) {
  const [run, setRun] = useState<FlowRunDetail>();
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const [tick, setTick] = useState(0);
  const flow = useLoad<FlowDetail>(run ? `${root}/flows/${run.flow}` : null);
  const streaming = useStreamConnected();
  const [changed, setChanged] = useState(0);
  // Read again when the flow run, a step of it or a script run it started changes, and
  // after an action here. Without the stream, every second and a half while it runs.
  useStreamEvents(
    (event) => event.id === id || event.flow === id,
    () => setChanged((n) => n + 1),
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: `tick` and `changed` ask again
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const current = await api.get<FlowRunDetail>(`${root}/flow-runs/${id}`);
        if (stopped) return;
        setRun(current);
        if (current.status === "running" && !streaming) timer = setTimeout(poll, 1500);
      } catch (caught) {
        if (!stopped) setError((caught as Error).message);
      }
    };
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [root, id, tick, changed, streaming]);

  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!run) return <p className="text-ink-muted">Loading…</p>;
  // The trigger first, then the steps as they began.
  const steps = run.steps
    .filter((step) => step.item === "")
    .sort((a, b) => Number(b.node === run.triggerNode) - Number(a.node === run.triggerNode));
  const statuses = Object.fromEntries(steps.map((step) => [step.node, step.state]));
  const chosen = steps.find((step) => step.node === selected);
  const items = run.steps.filter((step) => step.node === selected && step.item !== "");
  const waitingApprovals = steps.filter((step) => step.status === "waiting" && step.detail.title);

  const decide = async (node: string, decision: "approve" | "reject") => {
    const comment = await ask.prompt({
      title: decision === "approve" ? "Approve" : "Reject",
      label: decision === "approve" ? "Note (optional)" : "Why is it rejected?",
      required: decision === "reject",
      multiline: true,
      action: decision === "approve" ? "Approve" : "Reject",
      danger: decision === "reject",
    });
    if (comment === null) return;
    try {
      await api.post(`${root}/flow-runs/${id}/approvals/${node}`, {
        decision,
        ...(comment ? { comment } : {}),
      });
      setTick((value) => value + 1);
    } catch (caught) {
      notify.error(caught);
    }
  };

  const refresh = () => setTick((value) => value + 1);
  return (
    <div className="flex flex-col gap-5">
      {header ? (
        header(run, refresh, flow.data)
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Link to={`${link}/flows/${run.flow}`} className="text-action">
            {run.flow}
          </Link>
          <StatePill state={run.state} />
          <span className="text-ink-muted">
            Started {when(run.createdAt)} {STARTED[run.trigger.type] ?? `by ${run.trigger.type}`},
            on bundle version {run.bundleVersion}
          </span>
        </div>
      )}
      {run.error ? (
        <Notice tone="danger">
          <strong>The flow failed.</strong> {run.error.message}
        </Notice>
      ) : null}
      {waitingApprovals.map((step) => (
        <Notice
          key={step.node}
          tone="attention"
          action={
            <span className="flex gap-2">
              <Button size="small" variant="primary" onClick={() => decide(step.node, "approve")}>
                Approve
              </Button>
              <Button size="small" onClick={() => decide(step.node, "reject")}>
                Reject
              </Button>
            </span>
          }
        >
          <strong>Waiting for approval:</strong> {step.detail.title}
          {step.detail.detail ? (
            <span className="ml-2 font-mono text-[13px]">{JSON.stringify(step.detail.detail)}</span>
          ) : null}
        </Notice>
      ))}
      <Tabs
        label="Views of this run"
        tabs={[
          {
            id: "timeline",
            label: "Timeline",
            content: (
              <div className="rounded-panel border border-line bg-surface p-4">
                {steps.length === 0 ? (
                  <p className="m-0 text-ink-muted">No step has started yet.</p>
                ) : (
                  <Timeline
                    rows={steps.map((step) => timelineRow(step, run.createdAt))}
                    selected={selected}
                    onSelect={setSelected}
                    legend={{
                      wait: "Waiting for a worker",
                      run: "Running",
                      hold: "Waiting on purpose",
                    }}
                  />
                )}
              </div>
            ),
          },
          {
            id: "graph",
            label: "Graph",
            content: flow.data ? (
              <FlowGraph
                nodes={flow.data.nodes}
                edges={flow.data.edges}
                layout={flow.data.layout}
                statuses={statuses}
                selected={selected}
                onSelect={setSelected}
              />
            ) : (
              <p className="m-0 text-ink-muted">Loading…</p>
            ),
          },
        ]}
      />
      {chosen ? (
        <section className="rounded-panel border border-line bg-surface p-4">
          <h2 className="mt-0 mb-2 flex items-center gap-2 text-base font-semibold">
            {code(chosen.node)} <StatePill state={chosen.state} />
            {chosen.outputName ? (
              <span className="font-normal text-ink-muted">took the case {chosen.outputName}</span>
            ) : null}
          </h2>
          <div className="mb-3">
            <Facts
              facts={[
                { label: "Started", value: when(chosen.startedAt) },
                {
                  label: "Waited",
                  value:
                    chosen.pickedUpAt &&
                    Date.parse(chosen.pickedUpAt) - Date.parse(chosen.startedAt) >= 100
                      ? duration(Date.parse(chosen.pickedUpAt) - Date.parse(chosen.startedAt))
                      : "",
                },
                {
                  label: "Took",
                  value: chosen.finishedAt
                    ? duration(Date.parse(chosen.finishedAt) - Date.parse(chosen.startedAt))
                    : "In progress",
                },
                { label: "Run ID", value: chosen.runId ?? "", code: true },
              ]}
            />
          </div>
          {chosen.error ? (
            <p className="mt-0 text-danger">
              {chosen.error.message}
              {chosen.handled ? (
                <span className="text-ink-muted"> The flow carried on down its error path.</span>
              ) : null}
            </p>
          ) : null}
          {chosen.wakeAt && chosen.status === "waiting" ? (
            <p className="mt-0 text-ink-muted">Waits until {when(chosen.wakeAt)}.</p>
          ) : null}
          {chosen.copiedFrom ? (
            <Notice tone="plain">
              Kept from{" "}
              <Link to={`${link}/runs/${chosen.copiedFrom.flowRunId}`}>
                the run this one retries
              </Link>
              : it was not run again.
              {chosen.copiedFrom.runId ? (
                <>
                  {" "}
                  <Link to={`${link}/runs/${chosen.copiedFrom.runId}`}>Its script run</Link>.
                </>
              ) : null}
            </Notice>
          ) : null}
          {chosen.runId ? (
            <div className="mb-3 flex flex-col gap-2">
              <StepLogs root={root} runId={chosen.runId} />
              <Link to={`${link}/runs/${chosen.runId}`} className="text-meta">
                Open this step's run
              </Link>
            </div>
          ) : null}
          {chosen.childFlowRunId ? (
            <p className="mt-0">
              <Link to={`${link}/runs/${chosen.childFlowRunId}`} className="text-action">
                See the flow run this step started
              </Link>
            </p>
          ) : null}
          {items.length > 0 ? (
            <p className="mt-0 text-ink-muted">
              {items.filter((item) => item.status === "succeeded").length} of {items.length} items
              done.
            </p>
          ) : null}
          {chosen.status === "succeeded" ? (
            <JsonView label={`Output of ${chosen.node}`} value={chosen.output} />
          ) : null}
        </section>
      ) : (
        <p className="m-0 text-ink-muted">Choose a step to see what it produced.</p>
      )}
    </div>
  );
}

/** The log of the script run a step started, where the step is shown. */
function StepLogs({ root, runId }: { root: string; runId: string }) {
  const { run, lines, error } = useLiveRun(root, runId);
  if (error) return <Notice tone="danger">{error}</Notice>;
  const active = run?.state === "queued" || run?.state === "running";
  return (
    <LogViewer
      lines={lines}
      live={active}
      fileName={`${runId.slice(-12)}.log`}
      empty={
        !run ? "Loading…" : active ? "Waiting for the first line…" : "The step logged nothing."
      }
    />
  );
}

import { Button, JsonView, LogViewer, Menu, Notice, ResultView, Tabs } from "@vynxlabs/ui";
import { ChevronDown, CircleX, Lightbulb, RotateCcw } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { api, useLoad } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { InputDialog } from "../InputDialog.tsx";
import { StateAnnouncer } from "../kit/Announce.tsx";
import { CopyableId, CopyIcon, curlFor } from "../kit/copy.tsx";
import { Elapsed, WaitedAndRan } from "../kit/Elapsed.tsx";
import { KeyValues, NextStep } from "../kit/layout.tsx";
import { Junction } from "../kit/motifs.tsx";
import { useDevWorkspace } from "../kit/objects.tsx";
import { Reconnecting } from "../kit/Reconnecting.tsx";
import { Mono, type RunState, StatePill, Tag } from "../kit/status.tsx";
import { useTitleObject } from "../kit/title.ts";
import { useRecordRecent } from "../recent.ts";
import { Link, navigate } from "../router.tsx";
import {
  type LiveRun,
  LogWindowNote,
  stamp,
  TRIGGER,
  useLiveRun,
  wholeLogDownload,
} from "./Execution.tsx";
import { type FlowDetail, type FlowRunDetail, FlowRunView } from "./Flows.tsx";
import { NotFound } from "./NotFound.tsx";
import type { Insight } from "./Runs.tsx";

const LIVE: RunState[] = ["queued", "running", "waiting_approval", "waiting_time"];

/**
 * One run on a page of its own: a script run with its attempts and its log, or
 * a flow run with its steps and graph. Every name on it leads to what it names,
 * and it can be run again from here.
 */
export function RunPage({ root, link, id }: { root: string; link: string; id: string }) {
  return (
    <div className="px-4 py-4 md:px-6">
      <RunOfEitherKind root={root} link={link} id={id} />
    </div>
  );
}

function RunOfEitherKind({ root, link, id }: { root: string; link: string; id: string }) {
  // The address does not say which kind of run it is: whichever answers is the one.
  const script = useLoad<LiveRun>(`${root}/runs/${id}`);
  const flow = useLoad<FlowRunDetail>(script.error ? `${root}/flow-runs/${id}` : null);
  // Remembered for the palette as what it turned out to be.
  const [, tenantId, workspaceId] = /^\/tenants\/([^/]+)\/workspaces\/([^/]+)/.exec(root) ?? [];
  useRecordRecent(
    tenantId,
    workspaceId,
    script.data ? "run" : flow.data ? "flow_run" : undefined,
    id,
  );
  if (script.data) return <ScriptRunPage root={root} link={link} id={id} />;
  if (flow.data) {
    return (
      <FlowRunView
        root={root}
        id={id}
        link={link}
        header={(run, refresh, detail, reconnecting) => (
          <FlowRunHeader
            root={root}
            link={link}
            run={run}
            flow={detail}
            refresh={refresh}
            reconnecting={reconnecting}
          />
        )}
      />
    );
  }
  if (script.error?.status === 404 && flow.error?.status === 404) {
    return <NotFound home={`${link}/runs`} homeLabel="Go to the runs" />;
  }
  const failed = script.error?.status !== 404 ? script.error : flow.error;
  if (failed) return <Notice tone="danger">{failed.message}</Notice>;
  return <p className="text-ink-muted">Loading…</p>;
}

/** What every run page starts with: where it is, how it stands, where it came from, and what to do. */
function RunHeader({
  link,
  id,
  path,
  pathLink,
  state,
  detail,
  started,
  version,
  tags,
  related,
  actions,
  timing,
  versionTo,
  reconnecting = false,
}: {
  link: string;
  id: string;
  path: string;
  pathLink: string;
  state: RunState;
  detail?: string | undefined;
  started: ReactNode;
  version: number;
  tags: string[];
  related: ReactNode;
  actions: ReactNode;
  /** How long it waited and ran, counting while it goes. */
  timing?: ReactNode;
  /** Where "version N" leads: the code at that version, when there is one to show. */
  versionTo?: string;
  /** A read failed and is being tried again: what is shown may be behind. */
  reconnecting?: boolean;
}) {
  useTitleObject(`Run of ${path}`);
  return (
    <header className="flex flex-col gap-3 border-line border-b pb-4">
      <nav aria-label="Where this run is" className="flex flex-wrap items-center gap-1.5 text-meta">
        <Link to={`${link}/runs`} className="text-ink-muted">
          Runs
        </Link>
        <span aria-hidden="true" className="text-ink-subtle">
          ›
        </span>
        <CopyableId value={id} label="Copy the run ID" />
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="m-0 font-mono text-title break-all">
            <Link to={pathLink} className="text-ink">
              {path}
            </Link>
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-ink-muted">
            <StatePill state={state} detail={detail} />
            {timing}
            <StateAnnouncer state={state} label={`Run of ${path}`} />
            <Reconnecting show={reconnecting} />
            {started ? <span>{started}</span> : null}
            <Link to={versionTo ?? `${link}/deployments`}>version {version}</Link>
            {related}
          </div>
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Link
                  key={tag}
                  to={`${link}/runs?tag=${encodeURIComponent(tag)}`}
                  className="no-underline"
                >
                  <Tag tone="neutral">{tag}</Tag>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>
    </header>
  );
}

/**
 * "Schedule reminders/hourly", with the trigger a link. Nothing for a run that
 * repeats another: the link to that run says it.
 */
function startedBy(link: string, trigger: { type: string; [detail: string]: unknown }) {
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
  if (typeof trigger.trigger === "string") {
    return (
      <Link to={`${link}/triggers?trigger=${encodeURIComponent(trigger.trigger)}`}>
        {word} {trigger.trigger}
      </Link>
    );
  }
  return word;
}

/**
 * Opens the script in a dev workspace's editor with this run's input loaded:
 * here when this is a dev workspace, or the dev workspace that promotes here.
 */
function EditInDev({ root, path, runId }: { root: string; path: string; runId: string }) {
  const dev = useDevWorkspace(root);
  if (!dev) return null;
  const here = root.split("/workspaces/")[1] as string;
  const to = `${dev.link}/scripts/edit/${path}?fromRun=${encodeURIComponent(`${here}:${runId}`)}`;
  return (
    <Button size="small" onClick={() => navigate(to)}>
      {dev.here ? "Edit with this input" : `Edit in ${dev.name}`}
    </Button>
  );
}

interface RetryPlan {
  bundleVersion: number;
  changed: string[];
  kept: string[];
  again: string[];
  approvalsKept: { node: string; decidedBy: string | null }[];
}

function ScriptRunPage({ root, link, id }: { root: string; link: string; id: string }) {
  const { run, lines, earlier, error, reconnecting } = useLiveRun(root, id);
  const ended = run !== undefined && !LIVE.includes(run.state);
  const insight = useLoad<Insight>(ended ? `${root}/runs/${id}/insight` : null);
  const [editing, setEditing] = useState(false);
  const scripts = useLoad<{ items: { path: string; inputSchema: Record<string, unknown> }[] }>(
    editing ? `${root}/scripts` : null,
  );
  if (error && !run) return <Notice tone="danger">{error}</Notice>;
  if (!run) return <p className="text-ink-muted">Loading…</p>;
  const active = run.state === "queued" || run.state === "running";
  const diagnosis = insight.data?.diagnosis;
  const logFile = `${run.script.replaceAll("/", "-")}-${run.id.slice(-12)}.log`;
  const wholeLog = wholeLogDownload(root, run.id, logFile, earlier);

  const rerun = async (body: { input?: unknown; bundle?: "original" | "active" }) => {
    const started = await api.post<{ id: string }>(`${root}/runs/${id}/rerun`, body);
    navigate(`${link}/runs/${started.id}`);
  };
  const confirmed = async (bundle: "original" | "active") => {
    const sure = await ask.confirm({
      title: `Run ${run.script} again?`,
      text:
        bundle === "original"
          ? `With the same input, on version ${run.bundleVersion}, the one it ran.`
          : "With the same input, on the version deployed now.",
      action: "Run again",
    });
    if (sure) await rerun({ bundle }).catch(notify.error);
  };

  return (
    <div className="flex flex-col gap-5">
      <RunHeader
        reconnecting={reconnecting}
        link={link}
        id={run.id}
        path={run.script}
        pathLink={`${link}/scripts/edit/${run.script}`}
        state={run.state}
        detail={
          run.maxAttempts > 1
            ? `attempt ${Math.max(run.attempt, 1)} of ${run.maxAttempts}`
            : undefined
        }
        timing={<WaitedAndRan run={run} />}
        versionTo={`${link}/scripts/${run.script}?tab=source&run=${run.id}`}
        started={startedBy(link, run.trigger)}
        version={run.bundleVersion}
        tags={run.tags ?? []}
        related={
          <>
            {run.rerunOf ? <Link to={`${link}/runs/${run.rerunOf}`}>Re-run of a run</Link> : null}
            {run.reruns && run.reruns.length > 0 ? (
              <Link to={`${link}/runs/${run.reruns[0]?.id}`}>
                Run again {run.reruns.length === 1 ? "once" : `${run.reruns.length} times`}
              </Link>
            ) : null}
          </>
        }
        actions={
          <>
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
                  if (sure) await api.post(`${root}/runs/${id}/cancel`).catch(notify.error);
                }}
              >
                Cancel run
              </Button>
            ) : null}
            {/* A step of a flow is run again by retrying its flow run. */}
            {run.trigger.type === "flow" ? null : (
              <Menu
                label={
                  <span className="flex items-center gap-1.5">
                    <RotateCcw aria-hidden="true" size={14} /> Re-run
                    <ChevronDown aria-hidden="true" size={14} />
                  </span>
                }
                triggerClassName="flex h-8 items-center rounded-control border border-line px-3 text-meta hover:bg-surface"
                align="end"
                items={[
                  { label: "With the same input", onSelect: () => void confirmed("original") },
                  { label: "With other input…", onSelect: () => setEditing(true) },
                  {
                    label: "On the version deployed now",
                    onSelect: () => void confirmed("active"),
                    separated: true,
                  },
                ]}
              />
            )}
            <EditInDev root={root} path={run.script} runId={run.id} />
            <CopyIcon
              value={curlFor("POST", `${root}/runs`, { script: run.script, input: run.input })}
              label="Copy as curl: start this script again with the same input"
            />
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4">
          {insight.data && insight.data.attempts.length > 0 ? (
            <section aria-labelledby="attempts" className="flex flex-col gap-1.5">
              <h2 id="attempts" className="m-0 text-label text-ink-subtle uppercase">
                Attempts
              </h2>
              <ol className="m-0 flex list-none flex-col gap-1 p-0">
                {insight.data.attempts.map((one) => (
                  <li key={one.attempt} className="flex items-center gap-2 text-meta">
                    <Junction kind={one.failed ? "danger" : "here"} size={5} />
                    <span className={one.failed ? "text-danger" : "text-ink-muted"}>
                      #{one.attempt} {one.failed ? "failed" : "succeeded"}
                    </span>
                    <Mono className="ml-auto text-ink-subtle">
                      {stamp(one.startedAt).slice(11)}
                    </Mono>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          <KeyValues
            rows={[
              { label: "Received", value: stamp(run.createdAt), mono: true },
              { label: "Started", value: run.startedAt ? stamp(run.startedAt) : "—", mono: true },
              {
                label: "Finished",
                value: run.finishedAt ? stamp(run.finishedAt) : "—",
                mono: true,
              },
              {
                label: "Worker",
                value: insight.data?.worker
                  ? `${insight.data.worker.name}${insight.data.worker.pool ? ` · ${insight.data.worker.pool}` : ""}`
                  : "—",
              },
              {
                label: "Time limit",
                value: insight.data?.timeoutSeconds ? `${insight.data.timeoutSeconds} s` : "—",
              },
              ...(run.concurrency
                ? [
                    {
                      label: "Concurrency key",
                      // A long value is kept as its hash; its start is enough to tell two apart.
                      value: `${
                        run.concurrency.value === ""
                          ? "(none)"
                          : run.concurrency.value.length > 40
                            ? `${run.concurrency.value.slice(0, 19)}…`
                            : run.concurrency.value
                      } · ${
                        run.concurrency.limit === 1
                          ? "one at a time"
                          : `${run.concurrency.limit} at a time`
                      }`,
                      mono: true,
                    },
                  ]
                : []),
            ]}
          />
          {insight.data && insight.data.uses.length > 0 ? (
            <section aria-labelledby="uses" className="flex flex-col gap-1.5">
              <h2 id="uses" className="m-0 text-label text-ink-subtle uppercase">
                Uses
              </h2>
              {insight.data.uses.map((one) => (
                <Link
                  key={one.connection}
                  to={`${link}/connections`}
                  className="flex items-center justify-between gap-2"
                >
                  <Mono>{one.connection}</Mono>
                  <Tag tone={one.bound ? "live" : "production"}>
                    {one.bound ? "Bound" : "Not bound"}
                  </Tag>
                </Link>
              ))}
            </section>
          ) : null}
          {run.alert?.handlerRunId ? (
            <Link to={`${link}/runs/${String(run.alert.handlerRunId)}`} className="text-meta">
              The failure handler's run
            </Link>
          ) : null}
          {run.alert?.suppressed && typeof run.alert.sameAs === "string" ? (
            <p className="m-0 text-meta text-ink-muted">
              No alert was sent: it is counted on{" "}
              <Link to={`${link}/runs/${run.alert.sameAs}`}>the alert of an earlier failure</Link>,
              sent less than ten minutes before.
            </p>
          ) : null}
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          {run.state === "failed" && run.error ? (
            <div className="flex flex-col gap-2 rounded-panel border border-danger/40 bg-danger-soft/40 p-3">
              <span className="flex items-center gap-2 font-medium text-danger">
                <CircleX aria-hidden="true" size={14} /> Why it failed
              </span>
              <p className="m-0 font-mono text-code break-words whitespace-pre-wrap">
                {run.error.message}
              </p>
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
          <section aria-label="Log" className="flex flex-col gap-2">
            <LogWindowNote earlier={earlier} onDownload={wholeLog} />
            <LogViewer
              lines={lines}
              firstLine={earlier + 1}
              live={active}
              fileName={logFile}
              onDownload={wholeLog}
              empty={active ? "Waiting for the first line…" : "The script logged nothing."}
            />
          </section>
          <Tabs
            label="What it was given and what it gave"
            tabs={[
              {
                id: "input",
                label: "Input",
                content: (
                  <div className="pt-3">
                    <JsonView label="Input" value={run.input} maxHeight="24rem" />
                  </div>
                ),
              },
              {
                id: "output",
                label: run.state === "failed" ? "Error" : "Output",
                content: (
                  <div className="pt-3">
                    {run.state === "succeeded" ? (
                      <ResultView label="Output" value={run.output} maxHeight="24rem" />
                    ) : (
                      <JsonView
                        label={run.state === "failed" ? "Error" : "Output"}
                        tone={run.state === "failed" ? "danger" : "plain"}
                        maxHeight="24rem"
                        value={run.state === "failed" ? { error: run.error } : undefined}
                      />
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>
      </div>

      {editing ? (
        <InputDialog
          open
          onClose={() => setEditing(false)}
          title={`Run ${run.script} again`}
          action="Run again"
          schema={scripts.data?.items.find((one) => one.path === run.script)?.inputSchema}
          initial={run.input}
          onSubmit={async (input) => {
            await rerun({ input });
            setEditing(false);
          }}
        />
      ) : null}
    </div>
  );
}

function FlowRunHeader({
  root,
  link,
  run,
  flow,
  refresh,
  reconnecting,
}: {
  root: string;
  link: string;
  run: FlowRunDetail;
  flow: FlowDetail | undefined;
  refresh: () => void;
  reconnecting: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const live = LIVE.includes(run.state);
  const finishedBadly = run.state === "failed" || run.state === "canceled";
  const trigger = flow?.nodes[run.triggerNode] as
    | { type: string; trigger?: { type: string; input?: Record<string, unknown> } }
    | undefined;

  const retry = async (body: { from: "failed" | "start"; input?: unknown; bundle?: string }) => {
    const started = await api.post<{ id: string }>(`${root}/flow-runs/${run.id}/retry`, body);
    navigate(`${link}/runs/${started.id}`);
  };
  // A newer version, such as a fix just promoted, can be retried on from the failed step
  // when the steps kept are the same in it.
  const onFix = useLoad<RetryPlan>(
    finishedBadly ? `${root}/flow-runs/${run.id}/retry-plan?bundle=active` : null,
  );
  const fix =
    onFix.data &&
    typeof onFix.data.bundleVersion === "number" &&
    onFix.data.bundleVersion !== run.bundleVersion &&
    (onFix.data.changed ?? []).length === 0
      ? onFix.data.bundleVersion
      : undefined;
  const fromFailed = async (bundle: "original" | "active" = "original") => {
    let plan: RetryPlan;
    try {
      plan = await api.get(`${root}/flow-runs/${run.id}/retry-plan?bundle=${bundle}`);
    } catch (caught) {
      notify.error(caught);
      return;
    }
    const approvals = plan.approvalsKept
      .map((one) => `${one.node}${one.decidedBy ? ` (approved by ${one.decidedBy})` : ""}`)
      .join(", ");
    const sure = await ask.confirm({
      title: "Retry from the failed step?",
      text:
        `Runs again: ${plan.again.join(", ") || "nothing"}. ` +
        `Kept as it was: ${plan.kept.join(", ") || "nothing"}. ` +
        (approvals ? `Approvals kept, not asked again: ${approvals}. ` : "") +
        `On version ${plan.bundleVersion}${bundle === "active" ? ", the one deployed now" : ""}, with the same input.`,
      action: "Retry",
    });
    if (sure)
      await retry({ from: "failed", ...(bundle === "active" ? { bundle } : {}) }).catch(
        notify.error,
      );
  };
  const fromStart = async (bundle: "original" | "active") => {
    const sure = await ask.confirm({
      title: `Run ${run.flow} again from the start?`,
      text:
        bundle === "original"
          ? `Every step runs again, with the same input, on version ${run.bundleVersion}.`
          : "Every step runs again, with the same input, on the version deployed now.",
      action: "Run again",
    });
    if (sure) await retry({ from: "start", bundle }).catch(notify.error);
  };

  return (
    <>
      <RunHeader
        reconnecting={reconnecting}
        link={link}
        id={run.id}
        path={run.flow}
        pathLink={`${link}/flows/${run.flow}`}
        state={run.state}
        timing={
          <Elapsed from={run.createdAt} to={run.finishedAt} className="text-code text-ink-muted" />
        }
        started={startedBy(link, run.trigger)}
        version={run.bundleVersion}
        tags={run.tags}
        related={
          <>
            {run.retryOf ? <Link to={`${link}/runs/${run.retryOf}`}>Retry of a run</Link> : null}
            {run.retries.length > 0 ? (
              <Link to={`${link}/runs/${run.retries[0]?.id}`}>
                Retried {run.retries.length === 1 ? "once" : `${run.retries.length} times`}
              </Link>
            ) : null}
          </>
        }
        actions={
          <>
            {live ? (
              <Button
                size="small"
                variant="danger"
                onClick={async () => {
                  const sure = await ask.confirm({
                    title: "Cancel this flow run?",
                    text: "Steps in progress are canceled too.",
                    action: "Cancel flow run",
                    cancel: "Keep running",
                    danger: true,
                  });
                  if (!sure) return;
                  await api.post(`${root}/flow-runs/${run.id}/cancel`).catch(notify.error);
                  refresh();
                }}
              >
                Cancel flow run
              </Button>
            ) : (
              <Menu
                label={
                  <span className="flex items-center gap-1.5">
                    <RotateCcw aria-hidden="true" size={14} /> Re-run
                    <ChevronDown aria-hidden="true" size={14} />
                  </span>
                }
                triggerClassName="flex h-8 items-center rounded-control border border-line px-3 text-meta hover:bg-surface"
                align="end"
                items={[
                  ...(finishedBadly
                    ? [{ label: "Retry from the failed step…", onSelect: () => void fromFailed() }]
                    : []),
                  ...(finishedBadly && fix !== undefined
                    ? [
                        {
                          label: `Retry from the failed step on v${fix} (deployed now)…`,
                          onSelect: () => void fromFailed("active"),
                        },
                      ]
                    : []),
                  { label: "Again from the start", onSelect: () => void fromStart("original") },
                  { label: "Again, with other input…", onSelect: () => setEditing(true) },
                  {
                    label: "On the version deployed now",
                    onSelect: () => void fromStart("active"),
                    separated: true,
                  },
                ]}
              />
            )}
            <CopyIcon
              value={curlFor("POST", `${root}/flow-runs`, { flow: run.flow, input: run.input })}
              label="Copy as curl: start this flow again with the same input"
            />
          </>
        }
      />
      {editing ? (
        <InputDialog
          open
          onClose={() => setEditing(false)}
          title={`Run ${run.flow} again`}
          action="Run again"
          schema={trigger?.trigger?.input}
          initial={run.input}
          onSubmit={async (input) => {
            await retry({ from: "start", input });
            setEditing(false);
          }}
        />
      ) : null}
    </>
  );
}

/** The old address of a flow run sends the browser to its page. */
export function ToRunPage({ to }: { to: string }) {
  useEffect(() => {
    navigate(to, { replace: true });
  }, [to]);
  return null;
}

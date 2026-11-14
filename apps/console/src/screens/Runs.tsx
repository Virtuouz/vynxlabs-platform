import { Button, JsonView, LogViewer, Notice, SelectField, Tabs } from "@vynxlabs/ui";
import { ArrowUpRight, CircleX, Lightbulb, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, useLoad } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { FilterChips, Inspector, KeyValues, MasterDetail, NextStep } from "../kit/layout.tsx";
import { Junction } from "../kit/motifs.tsx";
import { Mono, StatePill, stateOf, Tag } from "../kit/status.tsx";
import { Link, navigate } from "../router.tsx";
import { stamp, TRIGGER, took, useLiveRun } from "./Execution.tsx";
import { fromNow } from "./Overview.tsx";

type Status = "queued" | "running" | "waiting" | "succeeded" | "failed" | "cancelled";

interface Activity {
  kind: "script" | "flow";
  id: string;
  target: string;
  status: Status;
  trigger: string;
  attempt: number;
  maxAttempts: number;
  error: string | null;
  bundleVersion: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

interface Insight {
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
  { value: "all", label: "All time" },
];

const STATUSES: { value: "all" | Status; label: string }[] = [
  { value: "all", label: "All" },
  { value: "failed", label: "Failed" },
  { value: "running", label: "Running" },
  { value: "waiting", label: "Waiting" },
  { value: "queued", label: "Queued" },
  { value: "succeeded", label: "Succeeded" },
  { value: "cancelled", label: "Canceled" },
];

/** How long ago, or the date when it is older than a day. */
function started(iso: string) {
  const age = Date.now() - Date.parse(iso);
  return age < 86_400_000 ? fromNow(iso) : stamp(iso).slice(0, 16);
}

/**
 * Every run of the workspace, script and flow, in one list, with the chosen
 * one beside it: what happened, why it failed and what to do, its attempts
 * and its log. It refreshes while anything is in progress.
 */
export function RunsWorkbench({
  root,
  link,
  selected,
}: {
  root: string;
  /** The workspace's console address. */
  link: string;
  /** A run's ID from the address, when one is open. */
  selected: string | undefined;
}) {
  const [status, setStatus] = useState<"all" | Status>(() => {
    const asked = new URLSearchParams(location.search).get("status");
    return STATUSES.some((one) => one.value === asked) ? (asked as Status) : "all";
  });
  const [kind, setKind] = useState("all");
  const [hours, setHours] = useState("24");
  const [tick, setTick] = useState(0);

  // The window's start is fixed when the period is chosen or the list refreshes. Worked
  // out on each render, it would change the address every time and load without end.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `tick` moves the window forward
  const from = useMemo(
    () => (hours === "all" ? null : new Date(Date.now() - Number(hours) * 3_600_000).toISOString()),
    [hours, tick],
  );
  const query = new URLSearchParams({ limit: "100" });
  if (status !== "all") query.set("status", status);
  if (kind !== "all") query.set("kind", kind);
  if (from) query.set("from", from);
  const listPath = `${root}/activity?${query}&tick=${tick}`;
  const list = useLoad<{ items: Activity[]; counts: Record<string, number> }>(listPath);
  const items = list.data?.items ?? [];
  const live = items.some((one) => ["queued", "running", "waiting"].includes(one.status));

  // While anything is in progress, the list asks again every few seconds.
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(timer);
  }, [live]);

  const chosen = items.find((one) => one.id === selected);
  const total = Object.values(list.data?.counts ?? {}).reduce((a, b) => a + b, 0);
  const close = () => navigate(`${link}/runs${location.search}`);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 border-line border-b px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="m-0 text-display">Runs</h1>
            <p className="m-0 text-ink-muted">
              Every script and flow that ran here, newest first. A step of a flow is part of its
              flow's run.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {live ? (
              <span className="flex items-center gap-1.5 text-meta text-ink-muted">
                <Junction kind="here" size={5} />
                Live · updates every 5s
              </span>
            ) : null}
            <div className="w-40">
              <SelectField
                label="Kind"
                name="kind"
                value={kind}
                onChange={setKind}
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
                onChange={setHours}
                options={WINDOWS}
              />
            </div>
          </div>
        </div>
        <FilterChips
          label="Status"
          value={status}
          onChange={setStatus}
          options={STATUSES.map((one) => ({
            ...one,
            count: one.value === "all" ? total : (list.data?.counts[one.value] ?? 0),
          }))}
        />
      </div>

      <MasterDetail
        inspector={
          selected ? (
            <Inspector
              open
              label="The chosen run"
              title={chosen?.target ?? "Run"}
              eyebrow={chosen ? `${chosen.kind === "flow" ? "Flow" : "Script"} run` : "Run"}
              onClose={close}
            >
              {chosen?.kind === "flow" ? (
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
            {status === "all" ? "Nothing ran in this time." : "No runs like that in this time."}
          </p>
        ) : (
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
              {items.map((row) => {
                const on = row.id === selected;
                return (
                  <tr
                    key={row.id}
                    aria-selected={on}
                    onClick={() => navigate(`${link}/runs/${row.id}${location.search}`)}
                    className={`cursor-pointer border-line border-b ${on ? "bg-selected" : "hover:bg-surface"}`}
                  >
                    <td className="px-4 py-2.5 md:pl-6">
                      <StatePill state={stateOf(row.status)} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Link
                        to={`${link}/runs/${row.id}`}
                        className="block truncate font-mono text-telemetry text-ink no-underline"
                      >
                        {row.target}
                      </Link>
                      <span className="block truncate text-meta text-ink-subtle">
                        {row.kind === "flow" ? "Flow" : "Script"}
                        {row.maxAttempts > 1
                          ? ` · attempt ${Math.max(row.attempt, 1)} of ${row.maxAttempts}`
                          : ""}
                      </span>
                    </td>
                    <td className="hidden px-3 py-2.5 text-ink-muted lg:table-cell">
                      {TRIGGER[row.trigger] ?? row.trigger}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-ink-muted">
                      {started(row.createdAt)}
                    </td>
                    <td className="hidden px-3 py-2.5 text-right sm:table-cell md:pr-6">
                      <Mono className="text-ink-muted">{took(row) || "—"}</Mono>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </MasterDetail>
    </div>
  );
}

function FlowRunSummary({ run, link }: { run: Activity; link: string }) {
  return (
    <div className="flex flex-col gap-4">
      <StatePill state={stateOf(run.status)} />
      {run.error ? <Notice tone="danger">{run.error}</Notice> : null}
      <KeyValues
        rows={[
          { label: "Started", value: stamp(run.createdAt), mono: true },
          { label: "Finished", value: run.finishedAt ? stamp(run.finishedAt) : "—", mono: true },
          { label: "Started by", value: TRIGGER[run.trigger] ?? run.trigger },
          { label: "Version", value: `v${run.bundleVersion}`, mono: true },
          { label: "Run ID", value: run.id, mono: true },
        ]}
      />
      <Button variant="primary" onClick={() => navigate(`${link}/flow-runs/${run.id}`)}>
        Open the run's graph <ArrowUpRight aria-hidden="true" size={15} />
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
        <StatePill state={stateOf(run.status)} detail={took(run) || undefined} />
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
          ) : (
            <Button
              size="small"
              onClick={async () => {
                try {
                  const again = await api.post<{ id: string }>(`${root}/runs`, {
                    script: run.script,
                    input: run.input,
                  });
                  navigate(`${link}/runs/${again.id}`);
                } catch (caught) {
                  notify.error(caught);
                }
              }}
            >
              <RotateCcw aria-hidden="true" size={13} /> Run again
            </Button>
          )}
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
                <JsonView
                  label="Result"
                  tone={failed ? "danger" : "plain"}
                  maxHeight="16rem"
                  value={
                    failed
                      ? { error: run.error }
                      : run.status === "succeeded"
                        ? run.output
                        : undefined
                  }
                />
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
                    { label: "Started by", value: TRIGGER[run.trigger.type] ?? run.trigger.type },
                    { label: "Version", value: `v${run.bundleVersion}`, mono: true },
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
                    { label: "Run ID", value: run.id, mono: true },
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

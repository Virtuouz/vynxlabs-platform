import { Button } from "@volvel/ui";
import {
  CircleCheck,
  CirclePause,
  CircleX,
  FileInput,
  GitCompareArrows,
  GitMerge,
  Hand,
  Plug,
  Radio,
  Timer,
  Webhook,
} from "lucide-react";
import type { ReactNode } from "react";
import { useLoad } from "../api.ts";
import { duration, hm } from "../kit/format.ts";
import { ErrorState, Loading } from "../kit/LoadState.tsx";
import { EmptyCanvas, NextStep, PageHeader, Panel, SectionLabel } from "../kit/layout.tsx";
import { Junction, Wire } from "../kit/motifs.tsx";
import { EnvTag, Mono, StatePill } from "../kit/status.tsx";
import { Link, navigate } from "../router.tsx";
import type { WorkspaceCounts } from "../Shell.tsx";
import { type Trigger, TriggerState, triggerKey } from "./Operate.tsx";

interface Workspace {
  id: string;
  name: string;
  type: "production" | "dev";
  triggersPaused: boolean;
}

const TRIGGER_ICON: Record<string, typeof Timer> = {
  schedule: Timer,
  webhook: Webhook,
  event: Radio,
  form: FileInput,
  manual: Hand,
};

export interface RunStats {
  from: string;
  to: string;
  succeeded: number;
  failed: number;
  running: number;
  medianSeconds: number | null;
  hours: { start: string; succeeded: number; failed: number }[];
}

const seconds = (value: number) => duration(value * 1000);

/** Totals as figures, and each hour as one bar of succeeded under failed. */
function RunsCard({ stats, link }: { stats: RunStats; link: string }) {
  const peak = Math.max(1, ...stats.hours.map((hour) => hour.succeeded + hour.failed));
  return (
    <Panel className="flex flex-col gap-4 p-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Succeeded", value: String(stats.succeeded) },
          {
            label: "Failed",
            value: String(stats.failed),
            to: stats.failed > 0 ? `${link}/runs?status=failed` : undefined,
          },
          { label: "In progress", value: String(stats.running) },
          {
            label: "Median time",
            value: stats.medianSeconds === null ? "—" : seconds(stats.medianSeconds),
          },
        ].map((figure) => (
          <div key={figure.label} className="flex flex-col gap-0.5">
            <span className="text-meta text-ink-subtle">{figure.label}</span>
            {figure.to ? (
              <Link
                to={figure.to}
                className="font-mono text-title text-ink no-underline hover:underline"
              >
                {figure.value}
              </Link>
            ) : (
              <span className="font-mono text-title">{figure.value}</span>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex h-16 items-end gap-0.5" aria-hidden="true">
          {stats.hours.map((hour) => {
            const total = hour.succeeded + hour.failed;
            return (
              <div
                key={hour.start}
                className="group relative flex h-full min-w-0 flex-1 flex-col justify-end"
              >
                {total === 0 ? (
                  <span className="h-px w-full bg-line" />
                ) : (
                  <div
                    className="flex w-full flex-col gap-0.5"
                    style={{ height: `${(total / peak) * 100}%` }}
                  >
                    {hour.failed > 0 ? (
                      <span
                        className="w-full rounded-t-inner bg-danger"
                        style={{ flexGrow: hour.failed }}
                      />
                    ) : null}
                    {hour.succeeded > 0 ? (
                      <span
                        className={`w-full bg-success ${hour.failed > 0 ? "" : "rounded-t-inner"}`}
                        style={{ flexGrow: hour.succeeded }}
                      />
                    ) : null}
                  </div>
                )}
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-control border border-line bg-raised px-2 py-1 text-meta shadow-overlay group-hover:block">
                  {hm(hour.start)} · {hour.succeeded} succeeded · {hour.failed} failed
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between text-meta text-ink-subtle">
          <span data-volatile>{hm(stats.from)}</span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2 rounded-inner bg-success" /> Succeeded
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2 rounded-inner bg-danger" /> Failed
            </span>
          </span>
          <span>now</span>
        </div>
        {/* table-allowed: the chart's numbers, for screen readers. */}
        <table className="sr-only">
          <caption>Runs finished per hour, over the last 24 hours</caption>
          <thead>
            <tr>
              <th>Hour</th>
              <th>Succeeded</th>
              <th>Failed</th>
            </tr>
          </thead>
          <tbody>
            {stats.hours.map((hour) => (
              <tr key={hour.start}>
                <td>{hm(hour.start)}</td>
                <td>{hour.succeeded}</td>
                <td>{hour.failed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/** The first answer to "is this workspace healthy, and what should I do next?". */
/**
 * The first steps in a new workspace, from what is there (08 §5.13): a worker
 * to run code, a first script, its first run, a first deploy. Each is checked
 * off when it is done, by anyone, and leads to where it is done.
 */
function FirstRun({
  counts,
  link,
  tenantLink,
  managedWorkers,
  dev,
}: {
  counts: WorkspaceCounts;
  link: string;
  tenantLink: string;
  managedWorkers: boolean;
  dev: boolean;
}) {
  const steps = [
    {
      key: "worker",
      done: (counts.workersOnline ?? 0) > 0 || managedWorkers,
      title: "A worker to run code",
      detail: managedWorkers
        ? "The instance starts workers for this tenant when there is work."
        : "Start a worker with a credential, so scripts have somewhere to run.",
      to: `${tenantLink}/workers`,
      action: "Workers",
    },
    {
      key: "script",
      done: (counts.scripts ?? 0) > 0,
      title: "A first script",
      detail: "Write one here, from a starter that runs as it is.",
      to: dev ? `${link}/scripts/new` : `${link}/scripts`,
      action: dev ? "New script" : "Scripts",
    },
    {
      key: "run",
      done: counts.everRan === true,
      title: "A first run",
      detail: "Run it from its editor with ⌘↵, or start it from the scripts list.",
      to: `${link}/scripts`,
      action: "Scripts",
    },
    {
      key: "deploy",
      done: counts.version !== null,
      title: "A first deploy",
      detail: "Deploying makes what you wrote what runs here, for schedules and webhooks too.",
      to: `${link}/release`,
      action: "Releases",
    },
  ];
  const next = steps.find((step) => !step.done);
  const done = steps.filter((step) => step.done).length;
  return (
    <section aria-labelledby="first-steps" className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="first-steps" className="m-0 text-title">
          First steps
        </h2>
        <span className="text-meta text-ink-muted">
          {done} of {steps.length} done
        </span>
      </div>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {steps.map((step) => (
          <li key={step.key} className="flex flex-wrap items-start justify-between gap-3">
            <span className="flex min-w-0 items-start gap-2">
              <StatePill state={step.done ? "succeeded" : step === next ? "waiting" : "queued"}>
                <span className={step.done ? "text-ink-muted line-through" : "text-ink"}>
                  {step.title}
                </span>
              </StatePill>
              {step === next ? (
                <span className="hidden text-meta text-ink-muted md:inline">{step.detail}</span>
              ) : null}
            </span>
            {step === next ? (
              <Button size="small" variant="primary" onClick={() => navigate(step.to)}>
                {step.action}
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Overview({
  root,
  link,
  workspace,
}: {
  /** The workspace's API address. */
  root: string;
  /** The workspace's console address. */
  link: string;
  workspace: Workspace;
}) {
  const summary = useLoad<WorkspaceCounts>(`${root}/summary`);
  const tenantRoot = root.split("/workspaces/")[0] ?? "";
  const tenant = useLoad<{ managedWorkers?: boolean }>(tenantRoot);
  const triggers = useLoad<{ items: Trigger[] }>(`${root}/triggers`);
  const stats = useLoad<RunStats>(`${root}/run-stats?hours=24`);
  const counts = summary.data;
  // A workspace with nothing run or deployed yet is shown its first steps first, and never
  // "nothing needs you here": everything does.
  const firstRun =
    counts !== undefined &&
    counts.scripts !== undefined &&
    (counts.everRan === false || counts.version === null);

  const attention: { key: string; node: ReactNode }[] = [];
  if (counts) {
    const failed = counts.failedRuns?.count ?? 0;
    if (failed > 0)
      attention.push({
        key: "failed",
        node: (
          <NextStep
            tone="danger"
            icon={<CircleX aria-hidden="true" size={16} />}
            title={`${failed} run${failed === 1 ? "" : "s"} failed in the last 24 hours`}
            detail="Open the failed runs to see which step and which log line."
            action={
              <Button size="small" onClick={() => navigate(`${link}/runs?status=failed`)}>
                Open failed runs
              </Button>
            }
          />
        ),
      });
    if (counts.git?.state === "conflict")
      attention.push({
        key: "git",
        node: (
          <NextStep
            tone="attention"
            icon={<GitMerge aria-hidden="true" size={16} />}
            title="The branch and this workspace both changed the same files"
            detail="Choose which version to keep for each file."
            action={
              <Button size="small" onClick={() => navigate(`${link}/git`)}>
                Resolve
              </Button>
            }
          />
        ),
      });
    const approvals = counts.approvalsWaiting ?? 0;
    // An older server does not say which are the viewer's: then none is claimed.
    const mine = counts.approvalsWaitingMine ?? 0;
    const others = Math.max(0, approvals - mine);
    const runs = (n: number) => `${n} run${n === 1 ? " is" : "s are"}`;
    if (mine > 0)
      attention.push({
        key: "approvals",
        node: (
          <NextStep
            tone="attention"
            icon={<CirclePause aria-hidden="true" size={16} />}
            title={`${runs(mine)} waiting for you`}
            detail={
              others > 0
                ? `${others} more wait${others === 1 ? "s" : ""} for someone else. An approval step pauses a flow until someone decides.`
                : "An approval step pauses a flow until someone decides."
            }
            action={
              <Button size="small" onClick={() => navigate(`${link}/approvals`)}>
                Decide
              </Button>
            }
          />
        ),
      });
    else if (others > 0)
      attention.push({
        key: "approvals",
        node: (
          <NextStep
            tone="attention"
            icon={<CirclePause aria-hidden="true" size={16} />}
            title={`${runs(others)} waiting for someone else to decide`}
            detail="You cannot decide these, but you can see who can and what each waits on."
            action={
              <Button size="small" onClick={() => navigate(`${link}/approvals?show=others`)}>
                See who
              </Button>
            }
          />
        ),
      });
    const unbound = counts.unboundConnections ?? 0;
    if (unbound > 0)
      attention.push({
        key: "connections",
        node: (
          <NextStep
            tone="attention"
            icon={<Plug aria-hidden="true" size={16} />}
            title={`${unbound} connection${unbound === 1 ? " has" : "s have"} nothing bound here`}
            detail="A run that reaches it fails until it points somewhere."
            action={
              <Button size="small" onClick={() => navigate(`${link}/connections`)}>
                Configure
              </Button>
            }
          />
        ),
      });
    const drafts = counts.drafts ?? 0;
    if (drafts > 0)
      attention.push({
        key: "drafts",
        node: (
          <NextStep
            tone="action"
            icon={<GitCompareArrows aria-hidden="true" size={16} />}
            title={`${drafts} draft${drafts === 1 ? "" : "s"} not deployed`}
            detail="Saved here, and not yet running."
            action={
              <Button size="small" onClick={() => navigate(`${link}/changes`)}>
                Review
              </Button>
            }
          />
        ),
      });
    if (workspace.triggersPaused)
      attention.push({
        key: "paused",
        node: (
          <NextStep
            tone="attention"
            icon={<CirclePause aria-hidden="true" size={16} />}
            title="Triggers are paused"
            detail={
              workspace.type === "dev"
                ? "Dev workspaces start this way, so a schedule you try here does not run beside production's. Runs started by hand still work."
                : "No schedule, webhook or event starts anything here. Runs started by hand still work."
            }
            action={
              <Button size="small" onClick={() => navigate(`${link}/settings`)}>
                View settings
              </Button>
            }
          />
        ),
      });
  }

  const drafts = counts?.drafts ?? 0;
  const primary =
    drafts > 0 && workspace.type === "dev" ? (
      <Button variant="primary" onClick={() => navigate(`${link}/changes`)}>
        Review release
      </Button>
    ) : (
      <Button onClick={() => navigate(`${link}/runs`)}>Open runs</Button>
    );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        size="display-lg"
        eyebrow="Overview"
        title={workspace.name}
        meta={
          <>
            <EnvTag type={workspace.type} />
            {workspace.triggersPaused ? (
              <StatePill state="paused">Triggers paused</StatePill>
            ) : null}
            {counts?.version !== null && counts?.version !== undefined ? (
              <span className="text-ink-muted">
                Running <Mono>v{counts.version}</Mono>
              </span>
            ) : null}
          </>
        }
        actions={primary}
      />

      {summary.error ? <ErrorState error={summary.error} onRetry={summary.reload} /> : null}

      {/* From 1920 px, three columns: what needs you, how it runs and ships, what starts it. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] 3xl:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6 3xl:grid 3xl:grid-cols-2 3xl:items-start">
          <div className="flex min-w-0 flex-col gap-6">
            {firstRun && counts ? (
              <Panel>
                <FirstRun
                  counts={counts}
                  link={link}
                  tenantLink={link.split("/workspaces/")[0] ?? ""}
                  managedWorkers={tenant.data?.managedWorkers === true}
                  dev={workspace.type === "dev"}
                />
              </Panel>
            ) : null}
            {firstRun && attention.length === 0 ? null : (
              <section className="flex flex-col gap-2">
                <SectionLabel>Needs attention</SectionLabel>
                <Panel className="divide-y divide-line">
                  {!counts ? (
                    <p className="m-0 px-4 py-3 text-ink-muted">Checking…</p>
                  ) : attention.length === 0 ? (
                    <NextStep
                      tone="success"
                      icon={<CircleCheck aria-hidden="true" size={16} />}
                      title="Nothing needs you here"
                      detail="No failed runs in the last 24 hours, nothing waiting, everything bound."
                    />
                  ) : (
                    attention.map((item) => <div key={item.key}>{item.node}</div>)
                  )}
                </Panel>
              </section>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            {stats.data ? (
              <section className="flex flex-col gap-2">
                <SectionLabel
                  action={
                    <Link to={`${link}/runs`} className="text-meta">
                      All runs
                    </Link>
                  }
                >
                  Runs · last 24 hours
                </SectionLabel>
                <RunsCard stats={stats.data} link={link} />
              </section>
            ) : null}

            {counts ? (
              <section className="flex flex-col gap-2">
                <SectionLabel
                  action={
                    <Link to={`${link}/release`} className="text-meta">
                      Deployments
                    </Link>
                  }
                >
                  Release
                </SectionLabel>
                <Panel className="flex flex-col gap-4 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-body-sm">
                    <span className="flex items-center gap-1.5">
                      <Junction kind="pending" />
                      Draft <Mono className="text-action">{counts.drafts ?? "—"}</Mono>
                    </span>
                    <Wire width={20} />
                    <span className="flex items-center gap-1.5">
                      <Junction kind={workspace.type === "production" ? "production" : "here"} />
                      {workspace.name}{" "}
                      <Mono className="text-ink-muted">
                        {counts.version === null ? "nothing deployed" : `v${counts.version}`}
                      </Mono>
                    </span>
                    {counts.linked ? (
                      <>
                        <Wire dashed width={20} />
                        <span className="flex items-center gap-1.5">
                          <Junction
                            kind={counts.linked.type === "production" ? "production" : "plain"}
                          />
                          {counts.linked.name}{" "}
                          <Mono className="text-ink-muted">
                            {counts.linked.version === null ? "—" : `v${counts.linked.version}`}
                          </Mono>
                        </span>
                      </>
                    ) : null}
                  </div>
                  {counts.linked ? (
                    <p className="m-0 text-meta text-ink-muted">
                      {counts.linked.same
                        ? `${counts.linked.name} runs the same bundle as this workspace.`
                        : `${counts.linked.name} runs a different bundle. Promote to bring it up to date.`}
                    </p>
                  ) : (
                    <p className="m-0 text-meta text-ink-muted">This workspace promotes nowhere.</p>
                  )}
                </Panel>
              </section>
            ) : null}
          </div>
        </div>

        <section className="flex flex-col gap-2">
          <SectionLabel
            action={
              <Link to={`${link}/triggers`} className="text-meta">
                All triggers
              </Link>
            }
          >
            What starts work here
          </SectionLabel>
          {triggers.error ? (
            <ErrorState error={triggers.error} onRetry={triggers.reload} />
          ) : !triggers.data ? (
            <Loading />
          ) : triggers.data.items.length === 0 ? (
            <EmptyCanvas
              title="Nothing starts by itself yet"
              text="A schedule, a webhook or an event in a flow or script starts work here once it is deployed."
            />
          ) : (
            <Panel as="div" className="divide-y divide-line overflow-hidden">
              {triggers.data.items.slice(0, 8).map((trigger) => {
                const Icon = TRIGGER_ICON[trigger.type] ?? Radio;
                return (
                  <Link
                    key={triggerKey(trigger)}
                    to={`${link}/triggers?trigger=${encodeURIComponent(triggerKey(trigger))}`}
                    className="flex items-start gap-3 px-4 py-3 text-ink no-underline hover:bg-surface-raised"
                  >
                    <Icon aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-ink-muted" />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-mono text-code">
                        {trigger.path}
                        {trigger.node ? (
                          <span className="text-ink-subtle">#{trigger.node}</span>
                        ) : null}
                      </span>
                      <span className="truncate text-meta text-ink-subtle">
                        {trigger.type}
                        {trigger.script ? ` → ${trigger.script}` : ""}
                      </span>
                    </div>
                    <span className="shrink-0 text-meta">
                      <TriggerState row={trigger} workspacePaused={workspace.triggersPaused} />
                    </span>
                  </Link>
                );
              })}
            </Panel>
          )}
        </section>
      </div>
    </div>
  );
}

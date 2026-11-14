import { Button, Notice } from "@vynxlabs/ui";
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
import { EmptyCanvas, NextStep, PageHeader, Panel, SectionLabel } from "../kit/layout.tsx";
import { Junction, Wire } from "../kit/motifs.tsx";
import { EnvTag, Mono, StatePill, Tag } from "../kit/status.tsx";
import { Link, navigate } from "../router.tsx";
import type { WorkspaceCounts } from "../Shell.tsx";

interface Workspace {
  id: string;
  name: string;
  type: "production" | "dev";
  triggersPaused: boolean;
}

interface Trigger {
  path: string;
  type: string;
  script?: string;
  target?: string;
  enabled: boolean;
  cron?: string | null;
  timezone?: string | null;
  url?: string | null;
  nextFireAt?: string | null;
  lastFiredAt?: string | null;
}

const TRIGGER_ICON: Record<string, typeof Timer> = {
  schedule: Timer,
  webhook: Webhook,
  event: Radio,
  form: FileInput,
  manual: Hand,
};

/** "in 2m 14s", "3h ago": how far a time is from now, in the largest two units. */
export function fromNow(iso: string, now = Date.now()): string {
  const ms = Date.parse(iso) - now;
  const seconds = Math.round(Math.abs(ms) / 1000);
  const parts =
    seconds < 60
      ? `${seconds}s`
      : seconds < 3600
        ? `${Math.floor(seconds / 60)}m${seconds % 60 ? ` ${seconds % 60}s` : ""}`
        : seconds < 86400
          ? `${Math.floor(seconds / 3600)}h${Math.floor((seconds % 3600) / 60) ? ` ${Math.floor((seconds % 3600) / 60)}m` : ""}`
          : `${Math.floor(seconds / 86400)}d`;
  return ms >= 0 ? `in ${parts}` : `${parts} ago`;
}

export interface RunStats {
  from: string;
  to: string;
  succeeded: number;
  failed: number;
  running: number;
  medianSeconds: number | null;
  hours: { start: string; succeeded: number; failed: number }[];
}

const seconds = (value: number) =>
  value < 1
    ? `${Math.round(value * 1000)} ms`
    : value < 60
      ? `${value.toFixed(1)}s`
      : `${Math.round(value / 60)}m`;

/** Totals as figures, and each hour as one bar of succeeded under failed. */
function RunsCard({ stats, link }: { stats: RunStats; link: string }) {
  const peak = Math.max(1, ...stats.hours.map((hour) => hour.succeeded + hour.failed));
  const hourOf = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
                        className="w-full rounded-t-[3px] bg-danger"
                        style={{ flexGrow: hour.failed }}
                      />
                    ) : null}
                    {hour.succeeded > 0 ? (
                      <span
                        className={`w-full bg-success ${hour.failed > 0 ? "" : "rounded-t-[3px]"}`}
                        style={{ flexGrow: hour.succeeded }}
                      />
                    ) : null}
                  </div>
                )}
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-control border border-line bg-raised px-2 py-1 text-meta shadow-lg group-hover:block">
                  {hourOf(hour.start)} · {hour.succeeded} succeeded · {hour.failed} failed
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between text-meta text-ink-subtle">
          <span>{hourOf(stats.from)}</span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2 rounded-[2px] bg-success" /> Succeeded
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2 rounded-[2px] bg-danger" /> Failed
            </span>
          </span>
          <span>now</span>
        </div>
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
                <td>{hourOf(hour.start)}</td>
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
  const triggers = useLoad<{ items: Trigger[] }>(`${root}/triggers`);
  const stats = useLoad<RunStats>(`${root}/run-stats?hours=24`);
  const counts = summary.data;

  const attention: { key: string; node: ReactNode }[] = [];
  if (counts) {
    const failed = counts.failedRuns.count ?? 0;
    if (failed > 0)
      attention.push({
        key: "failed",
        node: (
          <NextStep
            tone="danger"
            icon={<CircleX aria-hidden="true" size={15} />}
            title={`${failed} run${failed === 1 ? "" : "s"} failed in the last 24 hours`}
            detail="Open the failed runs to see which step and which log line."
            action={
              <Button size="small" onClick={() => navigate(`${link}/runs`)}>
                Open runs
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
            icon={<GitMerge aria-hidden="true" size={15} />}
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
    if (approvals > 0)
      attention.push({
        key: "approvals",
        node: (
          <NextStep
            tone="attention"
            icon={<CirclePause aria-hidden="true" size={15} />}
            title={`${approvals} run${approvals === 1 ? " is" : "s are"} waiting for a person`}
            detail="An approval step pauses a flow until someone decides."
            action={
              <Button
                size="small"
                onClick={() => navigate(link.replace(/\/workspaces\/.*$/, "/approvals"))}
              >
                Decide
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
            icon={<Plug aria-hidden="true" size={15} />}
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
            icon={<GitCompareArrows aria-hidden="true" size={15} />}
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
            icon={<CirclePause aria-hidden="true" size={15} />}
            title="Triggers are paused"
            detail="No schedule, webhook or event starts anything here. Runs started by hand still work."
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
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="Overview"
        title={workspace.name}
        meta={
          <>
            <EnvTag type={workspace.type} />
            {workspace.triggersPaused ? <Tag tone="production">Triggers paused</Tag> : null}
            {counts?.version !== null && counts?.version !== undefined ? (
              <span className="text-ink-muted">
                Running <Mono>v{counts.version}</Mono>
              </span>
            ) : null}
          </>
        }
        actions={primary}
      />

      {summary.error ? <Notice tone="danger">{summary.error.message}</Notice> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-2.5">
            <SectionLabel>Needs attention</SectionLabel>
            <Panel className="divide-y divide-line">
              {!counts ? (
                <p className="m-0 px-4 py-3 text-ink-muted">Checking…</p>
              ) : attention.length === 0 ? (
                <NextStep
                  tone="success"
                  icon={<CircleCheck aria-hidden="true" size={15} />}
                  title="Nothing needs you here"
                  detail="No failed runs in the last 24 hours, nothing waiting, everything bound."
                />
              ) : (
                attention.map((item) => <div key={item.key}>{item.node}</div>)
              )}
            </Panel>
          </section>

          {stats.data ? (
            <section className="flex flex-col gap-2.5">
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
            <section className="flex flex-col gap-2.5">
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
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
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

        <section className="flex flex-col gap-2.5">
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
            <Notice tone="danger">{triggers.error.message}</Notice>
          ) : !triggers.data ? (
            <Panel className="px-4 py-3 text-ink-muted">Loading…</Panel>
          ) : triggers.data.items.length === 0 ? (
            <EmptyCanvas
              title="Nothing starts by itself yet"
              text="A schedule, a webhook or an event in a flow or script starts work here once it is deployed."
            />
          ) : (
            <Panel as="div" className="divide-y divide-line">
              {triggers.data.items.slice(0, 8).map((trigger) => {
                const Icon = TRIGGER_ICON[trigger.type] ?? Radio;
                return (
                  <div key={trigger.path} className="flex items-start gap-3 px-4 py-3">
                    <Icon
                      aria-hidden="true"
                      size={15}
                      strokeWidth={1.75}
                      className="mt-0.5 shrink-0 text-ink-muted"
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-mono text-telemetry">{trigger.path}</span>
                      <span className="truncate text-meta text-ink-subtle">
                        {trigger.type}
                        {(trigger.script ?? trigger.target)
                          ? ` → ${trigger.script ?? trigger.target}`
                          : ""}
                      </span>
                    </div>
                    <span className="shrink-0 text-meta">
                      {!trigger.enabled || workspace.triggersPaused ? (
                        <StatePill state="paused" />
                      ) : trigger.nextFireAt ? (
                        <span className="text-ink-muted">Next {fromNow(trigger.nextFireAt)}</span>
                      ) : trigger.lastFiredAt ? (
                        <span className="text-ink-muted">Last {fromNow(trigger.lastFiredAt)}</span>
                      ) : (
                        <span className="text-ink-subtle">Waiting</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </Panel>
          )}
        </section>
      </div>
    </div>
  );
}

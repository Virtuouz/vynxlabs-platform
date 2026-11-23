import { Button, Closing, JsonView, Menu, Notice, TextField } from "@volvel/ui";
import {
  CircleCheck,
  CirclePause,
  CirclePlay,
  CircleX,
  Pencil,
  Plus,
  ShieldAlert,
  Zap,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { api, useCacheEdit, useLoad } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { REJECTING } from "../kit/approvals.ts";
import { type BatchAnswer, inSlices, useBatch } from "../kit/BatchResult.tsx";
import { type CollectionColumn, CollectionView } from "../kit/CollectionView.tsx";
import { Current } from "../kit/current.ts";
import { DeployMenu } from "../kit/DeployMenu.tsx";
import { ago, stamp } from "../kit/format.ts";
import { FilterChips, HeadNote, Inspector, KeyValues, NextStep } from "../kit/layout.tsx";
import { triggerKey } from "../kit/objects.tsx";
import { LoadMore, usePagedList } from "../kit/paged.tsx";
import { Mono, type RunState, StatePill, stateOf, Tag } from "../kit/status.tsx";
import { Time } from "../kit/Time.tsx";
import { Truncate } from "../kit/Truncate.tsx";
import { ViewsMenu } from "../kit/views.tsx";
import { CopyButton } from "../ListScreen.tsx";
import { Link, navigate, useQueryValue, useUrlParam } from "../router.tsx";
import { NewScheduleSheet } from "./ScheduleForm.tsx";

// ----- Triggers -----

export interface Trigger {
  path: string;
  node: string;
  type: string;
  script: string;
  targetKind: "script" | "flow";
  event: string | null;
  enabled: boolean;
  cron: string | null;
  timezone: string | null;
  /** For a schedule: whether it skips a time while its last run goes. */
  overlap?: "allow" | "skip" | null;
  lastSkippedAt?: string | null;
  lastSkipReason?: "overlap" | "backlog" | null;
  nextFireAt: string | null;
  lastFiredAt: string | null;
  url: string | null;
  paused: { at: string; by: string | null; reason: string } | null;
  /** What holds it, widest first: the instance, the workspace, or its own pause. */
  pausedBy?: "instance" | "workspace" | "trigger" | null;
  lastRun: {
    kind: "script" | "flow";
    id: string;
    status: string;
    state: RunState;
    createdAt: string;
  } | null;
  lastRefusal: { reason: string; problem: string; at: string } | null;
  /** The kind of resource that defines it: a schedule, a trigger, or a flow for a flow's trigger node. */
  resourceKind?: string;
  /** A change made in the console that waits to be deployed. A `new` one has never been deployed and does not fire. */
  draft?: "new" | "changed" | "removed" | null;
}

/** Where a trigger is changed: its own editor, or the flow's for a flow's trigger node. */
const editLink = (link: string, row: Trigger) =>
  row.resourceKind === "flow" || row.node
    ? `${link}/flows/edit/${row.path}`
    : `${link}/resources/edit/${row.resourceKind ?? (row.type === "schedule" ? "schedule" : "trigger")}/${row.path}`;

const TYPE_LABEL: Record<string, string> = {
  schedule: "Schedules",
  webhook: "Webhooks",
  event: "Events",
  form: "Forms",
};
const REFUSED: Record<string, string> = {
  signature: "the signature did not match",
  body: "the body could not be read",
  paused: "the trigger was paused",
  input: "what it was given does not fit what it starts",
  filter: "its filter could not be worked out",
  busy: "its source was still looking",
  error: "its source could not pass on what it gave",
};

/** The page of what a trigger starts. */
const targetLink = (link: string, row: Trigger) =>
  row.targetKind === "flow" ? `${link}/flows/${row.script}` : `${link}/scripts/${row.script}`;
const runLink = (link: string, run: NonNullable<Trigger["lastRun"]>) => `${link}/runs/${run.id}`;

/**
 * When a trigger fires next, in one rule for every place that says so. One that is turned off or
 * paused (its own, or its workspace's) does not fire at its next time: a paused schedule that
 * came due while it was held fires once when it is resumed, and says so instead of a time that
 * has passed.
 */
export function nextFireOf(
  row: Pick<Trigger, "paused" | "enabled" | "nextFireAt" | "draft">,
  workspacePaused: boolean,
  now = Date.now(),
):
  | { kind: "next"; at: string }
  | { kind: "resume" }
  | { kind: "off" }
  | { kind: "paused" }
  | { kind: "none" } {
  if (row.draft === "new")
    return row.nextFireAt ? { kind: "next", at: row.nextFireAt } : { kind: "none" };
  if (!row.enabled) return { kind: "off" };
  if (row.paused || workspacePaused) {
    return row.nextFireAt && Date.parse(row.nextFireAt) <= now
      ? { kind: "resume" }
      : { kind: "paused" };
  }
  return row.nextFireAt ? { kind: "next", at: row.nextFireAt } : { kind: "none" };
}

/**
 * What a trigger will do, in one rule for every place that lists triggers: a draft that was
 * never deployed starts nothing, a pause (its own or the workspace's) stops it, and an
 * enabled one says when it fires next.
 */
export function TriggerState({
  row,
  workspacePaused = false,
  instancePaused = false,
}: {
  row: Pick<Trigger, "paused" | "enabled" | "nextFireAt" | "draft"> &
    Partial<Pick<Trigger, "pausedBy">>;
  /** For a list that was not given what holds each trigger: the server says it as `pausedBy`. */
  workspacePaused?: boolean;
  /** An operator has paused every trigger in the instance. */
  instancePaused?: boolean;
}) {
  if (row.draft === "new") return <StatePill state="draft">Draft, never deployed</StatePill>;
  if (row.draft)
    return (
      <span className="flex flex-wrap items-center gap-2">
        {row.paused ? <StatePill state="paused" /> : null}
        <Tag tone="draft">{row.draft === "removed" ? "Removing" : "Draft"}</Tag>
      </span>
    );
  const next = nextFireOf(row, workspacePaused);
  const held =
    next.kind === "resume" ? (
      <span className="text-meta text-ink-subtle">Fires once when resumed</span>
    ) : null;
  const holding = (pill: ReactNode) => (
    <span className="flex flex-wrap items-center gap-2">
      {pill}
      {held}
    </span>
  );
  if (instancePaused || row.pausedBy === "instance")
    return holding(<StatePill state="paused">Instance paused</StatePill>);
  if (row.paused && row.pausedBy === "workspace")
    return holding(<StatePill state="paused">Workspace paused</StatePill>);
  if (row.paused) return holding(<StatePill state="paused" />);
  if (!row.enabled) return <StatePill state="off" />;
  if (workspacePaused || row.pausedBy === "workspace")
    return holding(<StatePill state="paused">Workspace paused</StatePill>);
  if (next.kind === "next") return <span className="text-ink-muted">Next {ago(next.at)}</span>;
  return <StatePill state="on" />;
}

/**
 * Pause and resume for a trigger, wherever it is listed. A pause asks why (shown to
 * everyone here), and in production asks as a danger. Each shows at once in the list
 * at `listPath`, and is put back if the server refuses.
 */
export function useTriggerPause({
  root,
  production,
  listPath,
}: {
  root: string;
  production: boolean;
  /** The address the list was loaded from, so the cache can show the change at once. */
  listPath: string;
}) {
  const editCache = useCacheEdit();
  const showPaused = (trigger: Pick<Trigger, "path" | "node">, paused: Trigger["paused"]) =>
    editCache<{ items: Trigger[] }>(listPath, (data) => ({
      ...data,
      items: data.items.map((one) =>
        triggerKey(one) === triggerKey(trigger) ? { ...one, paused } : one,
      ),
    }));
  const pauseAt = (trigger: Pick<Trigger, "path" | "node">) =>
    `${root}/trigger-pauses/${trigger.path}${trigger.node ? `?node=${encodeURIComponent(trigger.node)}` : ""}`;
  const pause = async (trigger: Pick<Trigger, "path" | "node">) => {
    const reason = await ask.prompt({
      title: `Pause ${trigger.path}?`,
      label: "Why (shown to everyone here)",
      action: "Pause",
      danger: production,
      required: false,
    });
    if (reason === null) return;
    const undo = showPaused(trigger, {
      at: new Date().toISOString(),
      by: null,
      reason: reason ?? "",
    });
    try {
      await api.put(pauseAt(trigger), reason ? { reason } : {});
      notify.success(`${trigger.path} is paused. Nothing it would start is started.`);
    } catch (caught) {
      undo();
      notify.error(caught);
    }
  };
  const resume = async (trigger: Pick<Trigger, "path" | "node">) => {
    const undo = showPaused(trigger, null);
    try {
      await api.delete(pauseAt(trigger));
      notify.success(`${trigger.path} runs again.`);
    } catch (caught) {
      undo();
      notify.error(caught);
    }
  };
  return { pause, resume };
}

/** What starts work by itself, by kind, with each one's last firing and a way to pause just it. */
export function TriggersWorkbench({
  root,
  link,
  workspacePaused,
  instancePaused = false,
  production,
}: {
  root: string;
  link: string;
  workspacePaused: boolean;
  /** An operator has paused every trigger in the instance. */
  instancePaused?: boolean;
  production: boolean;
}) {
  const list = useLoad<{ items: Trigger[] }>(`${root}/triggers`);
  const { pause, resume } = useTriggerPause({ root, production, listPath: `${root}/triggers` });
  // The kind shown is in the address, so a reload or a link keeps it.
  const [type, setType] = useUrlParam("kind", "all");
  // The chosen trigger lives in the address, so a run can link straight to the trigger
  // that started it.
  const [chosen, choose] = useQueryValue("trigger");
  const items = list.data?.items ?? [];
  const types = [...new Set(items.map((one) => one.type))];
  const rows = items.filter((one) => type === "all" || one.type === type);
  const open = items.find((one) => triggerKey(one) === chosen);
  const pausedCount = items.filter((one) => one.paused).length;
  const [creating, setCreating] = useState(false);
  // Triggers checked, to pause or resume together.
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const batch = useBatch();
  const pauseMany = async (keys: string[], paused: boolean) => {
    // A trigger that is only a draft fires nothing, so there is nothing of it to pause.
    const chosen = items.filter((one) => keys.includes(triggerKey(one)) && one.draft !== "new");
    if (chosen.length === 0) {
      notify.info("A draft starts nothing until it is deployed, so there is nothing to pause.");
      return;
    }
    let reason: string | null | undefined;
    if (paused) {
      reason = await ask.prompt({
        title: `Pause ${chosen.length} trigger${chosen.length === 1 ? "" : "s"}?`,
        text:
          chosen.length > 3
            ? `${chosen
                .slice(0, 3)
                .map((one) => one.path)
                .join(", ")} and ${chosen.length - 3} more.`
            : `${chosen.map((one) => one.path).join(", ")}.`,
        label: "Why (shown to everyone here)",
        action: "Pause",
        danger: production,
        required: false,
      });
      if (reason === null) return;
    }
    const send = (subset: Trigger[]) =>
      inSlices(subset, (slice) =>
        api.post<BatchAnswer>(`${root}/trigger-pauses/batch`, {
          paused,
          ...(reason ? { reason } : {}),
          triggers: slice.map((one) => ({
            path: one.path,
            ...(one.node ? { node: one.node } : {}),
          })),
        }),
      );
    await batch.run(() => send(chosen), {
      title: paused ? "Pausing triggers" : "Resuming triggers",
      done: (count) =>
        `${count} trigger${count === 1 ? "" : "s"} ${paused ? "paused" : "resumed"}.`,
      retry: (ids) => send(chosen.filter((one) => ids.includes(triggerKey(one)))),
    });
    setChecked(new Set());
    list.reload();
  };
  const fireNow = async (row: Trigger) => {
    try {
      const started = await api.post<{ id: string }>(`${root}/schedule-firings`, {
        path: row.path,
        ...(row.node ? { node: row.node } : {}),
      });
      // The run's page is where it goes on.
      navigate(`${link}/runs/${started.id}`);
    } catch (caught) {
      notify.error(caught);
    }
  };
  const newTrigger = production ? (
    <Button
      disabled
      tooltip="Triggers change in a dev workspace and reach production by promotion."
    >
      <Plus aria-hidden="true" size={16} /> New trigger
    </Button>
  ) : (
    <Menu
      label={
        <span className="inline-flex items-center gap-1.5">
          <Plus aria-hidden="true" size={16} /> New trigger
        </span>
      }
      align="end"
      triggerClassName="inline-flex h-9 items-center gap-1.5 rounded-control bg-action px-3 font-medium text-action-ink hover:brightness-110"
      items={[
        { label: "Schedule", onSelect: () => setCreating(true) },
        ...(["webhook", "form", "event"] as const).map((type) => ({
          label: { webhook: "Webhook", form: "Form", event: "Event" }[type],
          onSelect: () => navigate(`${link}/resources/new/trigger?type=${type}`),
        })),
      ]}
    />
  );

  const columns: CollectionColumn<Trigger>[] = [
    {
      header: "Trigger",
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <span className="flex min-w-0 font-mono text-code">
            <Truncate mode="middle">{row.path}</Truncate>
            {row.node ? <span className="shrink-0 text-ink-subtle">#{row.node}</span> : null}
          </span>
          <span className="text-meta text-ink-subtle">
            {row.type}
            {row.type === "event" && row.event ? ` · ${row.event}` : ""}
            {row.type === "schedule" && row.cron ? ` · ${row.cron}` : ""}
          </span>
        </span>
      ),
    },
    {
      header: "Starts",
      priority: 3,
      cell: (row) => (
        <span className="flex flex-col">
          <Link to={targetLink(link, row)} className="font-mono text-code">
            {row.script}
          </Link>
          <span className="text-meta text-ink-subtle">
            {row.targetKind === "flow" ? "Flow" : "Script"}
          </span>
        </span>
      ),
    },
    {
      header: "State",
      cell: (row) => (
        <TriggerState row={row} workspacePaused={workspacePaused} instancePaused={instancePaused} />
      ),
    },
    {
      header: "Last fired",
      priority: 2,
      cell: (row) =>
        row.lastRun ? (
          <span className="flex flex-col">
            <StatePill state={row.lastRun.state} />
            <span className="text-meta text-ink-subtle">{ago(row.lastRun.createdAt)}</span>
          </span>
        ) : row.lastFiredAt ? (
          <span className="text-ink-muted">{ago(row.lastFiredAt)}</span>
        ) : (
          <span
            className="text-ink-subtle"
            title="This trigger has not started anything yet. Runs started by hand are not counted."
          >
            Not fired yet
          </span>
        ),
    },
  ];

  return (
    <>
      <Closing subject={creating}>
        {(_creating, shown) => (
          <NewScheduleSheet
            root={root}
            link={link}
            open={shown}
            onClose={() => {
              setCreating(false);
              list.reload();
            }}
          />
        )}
      </Closing>
      <CollectionView
        actions={newTrigger}
        title="Triggers"
        description="What starts work here without anyone asking. Pause one to stop just it, in any workspace; the pause lasts through deploys until it is resumed."
        state={
          instancePaused ? (
            <HeadNote>
              An operator has paused every trigger in this instance, so nothing here starts until
              they resume them. Only an operator can.
            </HeadNote>
          ) : workspacePaused ? (
            <HeadNote>
              Every trigger here is paused. Resume them under{" "}
              <Link to={`${link}/settings`}>Workspace settings</Link>.
            </HeadNote>
          ) : production && pausedCount > 0 ? (
            <HeadNote>
              {pausedCount} trigger{pausedCount === 1 ? " is" : "s are"} paused in production.
            </HeadNote>
          ) : undefined
        }
        toolbar={
          <div className="flex flex-col gap-3">
            <FilterChips
              label="Kind"
              value={type}
              onChange={setType}
              options={[
                { value: "all", label: "All", count: items.length },
                ...types.map((one) => ({
                  value: one,
                  label: TYPE_LABEL[one] ?? one,
                  count: items.filter((item) => item.type === one).length,
                })),
              ]}
            />
          </div>
        }
        columns={columns}
        rows={list.data ? rows : undefined}
        rowKey={triggerKey}
        selected={chosen ?? undefined}
        onSelect={(row) => choose(triggerKey(row))}
        table={{
          checked,
          onCheck: setChecked,
          batch: (keys) => (
            <>
              <Button
                size="small"
                disabled={batch.busy}
                onClick={() => void pauseMany([...keys], true)}
              >
                <CirclePause aria-hidden="true" size={14} /> Pause
              </Button>
              <Button
                size="small"
                disabled={batch.busy}
                onClick={() => void pauseMany([...keys], false)}
              >
                <CirclePlay aria-hidden="true" size={14} /> Resume
              </Button>
            </>
          ),
        }}
        error={list.error}
        onRetry={list.reload}
        empty={{
          title: "Nothing starts by itself yet",
          text: "A schedule, a webhook, a form or an event in a flow or a script starts work here once it is deployed.",
        }}
        inspector={
          open ? (
            <>
              <Current
                object={{
                  heading: "This trigger",
                  commands: open.paused
                    ? [
                        {
                          key: "resume",
                          label: `Resume ${open.path}`,
                          icon: CirclePlay,
                          run: () => resume(open),
                        },
                      ]
                    : [
                        {
                          key: "pause",
                          label: `Pause ${open.path}…`,
                          icon: CirclePause,
                          run: () => pause(open),
                        },
                        ...(open.type === "schedule" &&
                        !open.node &&
                        !workspacePaused &&
                        !open.pausedBy
                          ? [
                              {
                                key: "fire",
                                label: "Fire it now",
                                icon: Zap,
                                run: () => fireNow(open),
                              },
                            ]
                          : []),
                      ],
                  pin: {
                    kind: open.type === "schedule" ? "schedule" : "trigger",
                    ref: open.path,
                    id: open.path,
                    workspaceId: root.split("/workspaces/")[1] ?? null,
                    title: open.path,
                  },
                }}
              />
              <Inspector
                open
                label="The chosen trigger"
                title={open.path}
                eyebrow={`${open.type} trigger${open.node ? ` · node ${open.node}` : ""}`}
                onClose={() => choose(null)}
                footer={
                  open.draft === "new" ? (
                    <span className="flex flex-wrap gap-2">
                      <Button variant="primary" href={editLink(link, open)}>
                        <Pencil aria-hidden="true" size={16} /> Edit
                      </Button>
                      <DeployMenu
                        root={root}
                        link={link}
                        path={open.path}
                        onDeployed={() => list.reload()}
                      />
                    </span>
                  ) : open.paused ? (
                    <span className="flex flex-wrap gap-2">
                      <Button variant="primary" onClick={() => void resume(open)}>
                        <CirclePlay aria-hidden="true" size={16} /> Resume
                      </Button>
                      {production ? null : (
                        <Button href={editLink(link, open)}>
                          <Pencil aria-hidden="true" size={16} /> Edit
                        </Button>
                      )}
                    </span>
                  ) : (
                    <span className="flex flex-wrap gap-2">
                      {production ? null : (
                        <Button href={editLink(link, open)}>
                          <Pencil aria-hidden="true" size={16} /> Edit
                        </Button>
                      )}
                      {open.type === "schedule" &&
                      !open.node &&
                      !workspacePaused &&
                      !open.pausedBy ? (
                        <Button variant="primary" onClick={() => void fireNow(open)}>
                          <Zap aria-hidden="true" size={16} /> Fire now
                        </Button>
                      ) : null}
                      <Button onClick={() => void pause(open)}>
                        <CirclePause aria-hidden="true" size={16} /> Pause this trigger
                      </Button>
                    </span>
                  )
                }
              >
                <div className="flex flex-col gap-4">
                  {open.draft === "new" ? (
                    <Notice tone="plain">
                      A draft. It starts nothing until it is deployed.{" "}
                      {open.type === "schedule"
                        ? open.nextFireAt
                          ? `Deployed now, it would first fire ${stamp(open.nextFireAt)}.`
                          : ""
                        : open.type === "webhook" || open.type === "form"
                          ? "It is given its address when it is deployed."
                          : ""}
                    </Notice>
                  ) : open.draft ? (
                    <Notice tone="plain">
                      {open.draft === "removed"
                        ? "A draft removes this trigger. It keeps firing until that is deployed."
                        : "A draft changes this trigger. What is shown here is what is deployed, and what fires."}{" "}
                      <Link to={`${link}/release`}>Review the change</Link>
                    </Notice>
                  ) : null}
                  {open.paused ? (
                    <Notice tone="attention">
                      Paused {ago(open.paused.at)}
                      {open.paused.reason ? `: ${open.paused.reason}` : "."} Nothing it would start
                      is started until it is resumed.
                    </Notice>
                  ) : null}
                  {open.lastRefusal ? (
                    <div className="rounded-panel border border-line">
                      <NextStep
                        tone="danger"
                        icon={<ShieldAlert aria-hidden="true" size={16} />}
                        title={`Last refused ${ago(open.lastRefusal.at)}: ${REFUSED[open.lastRefusal.reason] ?? open.lastRefusal.reason}`}
                        detail={open.lastRefusal.problem || undefined}
                      />
                    </div>
                  ) : null}
                  <KeyValues
                    rows={[
                      {
                        label: "Starts",
                        value: (
                          <Link to={targetLink(link, open)}>
                            {open.script} ({open.targetKind})
                          </Link>
                        ),
                        mono: true,
                      },
                      ...(open.cron
                        ? [
                            {
                              label: "Schedule",
                              value: `${open.cron} · ${open.timezone ?? "UTC"}`,
                              mono: true,
                            },
                          ]
                        : []),
                      ...(open.event ? [{ label: "Event", value: open.event, mono: true }] : []),
                      ...(open.overlap === "skip"
                        ? [
                            {
                              label: "Overlap",
                              value:
                                open.lastSkippedAt && open.lastSkipReason !== "backlog"
                                  ? `Skips a time while its last run goes. Last skipped ${ago(open.lastSkippedAt)}.`
                                  : "Skips a time while its last run goes.",
                            },
                          ]
                        : []),
                      ...(open.lastSkipReason === "backlog" && open.lastSkippedAt
                        ? [
                            {
                              label: "Backlog",
                              value: `Skipped ${ago(open.lastSkippedAt)}: the workspace already had too many runs waiting.`,
                            },
                          ]
                        : []),
                      {
                        label: "Next",
                        value: (() => {
                          const next = nextFireOf(open, workspacePaused);
                          if (next.kind === "next") return <Time value={next.at} />;
                          if (next.kind === "resume") return "Fires once when resumed";
                          if (next.kind === "paused") return "Not while it is paused";
                          if (next.kind === "off") return "Not while it is turned off";
                          return "On request";
                        })(),
                      },
                      {
                        label: "Last fired",
                        value: open.lastFiredAt ? (
                          <Time value={open.lastFiredAt} />
                        ) : (
                          "Not fired yet. Runs started by hand are not counted."
                        ),
                      },
                    ]}
                  />
                  {open.lastRun ? (
                    <Link to={runLink(link, open.lastRun)} className="text-meta">
                      Open the last run it started
                    </Link>
                  ) : null}
                  {open.url ? (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-label text-ink-subtle uppercase">
                        {open.type === "form" ? "Form address" : "Webhook address"}
                      </span>
                      <code className="rounded-control bg-code-bg p-2 font-mono text-code break-all select-all">
                        {open.type === "form" ? "" : "POST "}
                        {open.url}
                      </code>
                      <CopyButton value={open.url} label="Copy address" />
                    </div>
                  ) : open.type === "webhook" || open.type === "form" ? (
                    <p className="m-0 text-meta text-ink-subtle">
                      The address is shown to those who manage triggers.
                    </p>
                  ) : null}
                </div>
              </Inspector>
            </>
          ) : null
        }
      />
      {batch.dialog}
    </>
  );
}

// ----- Events -----

interface EventRow {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  source: { type: string; id: string | null };
  occurredAt: string;
  publishedBy: { run: string; script: string } | null;
  started: {
    kind: "script" | "flow";
    id: string;
    target: string;
    status: string;
    state: RunState;
  }[];
  /** Triggers that would start something now. */
  listeners: number;
  /** Triggers that are on and held: paused, or in a paused workspace or instance. */
  pausedListeners?: number;
}

/** What is said of the triggers that listen for an event, in one place for every list of events. */
export function listening(row: Pick<EventRow, "listeners" | "pausedListeners">): string {
  const held = row.pausedListeners ?? 0;
  const some = (count: number) => `${count} trigger${count === 1 ? "" : "s"}`;
  if (held === 0) return some(row.listeners);
  return row.listeners === 0
    ? `${some(held)}, all paused`
    : `${some(row.listeners)}, and ${held} paused`;
}

const SOURCE: Record<string, string> = {
  script: "A script",
  api: "The API",
  platform: "The platform",
};

/** What was published, newest first, with what each one started. */
export function EventsWorkbench({ root, link }: { root: string; link: string }) {
  // The name searched for is in the address, so a reload, a link or a saved view keeps it.
  const [applied, setApplied] = useUrlParam("name", "");
  const [name, setName] = useState(applied);
  // An address that changes from outside (Back, a saved view) is what the box says.
  useEffect(() => setName(applied), [applied]);
  // Newest first, a page at a time: older ones are one "Load more" away.
  const list = usePagedList<EventRow>(
    `${root}/events${applied ? `?name=${encodeURIComponent(applied)}` : ""}`,
    { limit: 100 },
  );
  const [chosen, setChosen] = useUrlParam("item", undefined, { push: true });
  const onPage = list.items?.find((one) => one.id === chosen);
  // A link to an event that the pages loaded do not reach is looked up by its ID.
  const lookup = useLoad<{ items: EventRow[] }>(
    chosen && list.items && !onPage ? `${root}/events?id=${encodeURIComponent(chosen)}` : null,
  );
  const open = onPage ?? lookup.data?.items.find((one) => one.id === chosen);

  return (
    <CollectionView
      title="Events"
      description="What has been published here, newest first. Flows and scripts listen for an event by name."
      toolbar={
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setApplied(name.trim() || undefined);
          }}
        >
          <div className="w-72 max-w-full">
            <TextField
              label="Exact event name"
              labelHidden
              name="event"
              value={name}
              placeholder="An event's name, such as orders/placed"
              onChange={setName}
            />
          </div>
          <Button type="submit">Show</Button>
          {applied ? (
            <Button
              variant="quiet"
              onClick={() => {
                setName("");
                setApplied(undefined);
              }}
            >
              Show every event
            </Button>
          ) : null}
          <span className="ml-auto">
            <ViewsMenu
              tenantId={root.split("/tenants/")[1]?.split("/")[0] ?? ""}
              workspaceId={root.split("/workspaces/")[1]?.split("/")[0]}
              list="events"
              omit={["item"]}
            />
          </span>
        </form>
      }
      columns={[
        {
          header: "When",
          cell: (row) => (
            <span className="whitespace-nowrap text-ink-muted">{ago(row.occurredAt)}</span>
          ),
        },
        { header: "Event", cell: (row) => <Mono>{row.name}</Mono> },
        {
          header: "From",
          priority: 3,
          cell: (row) =>
            row.publishedBy ? (
              <Mono className="text-ink-muted">{row.publishedBy.script}</Mono>
            ) : (
              (SOURCE[row.source.type] ?? row.source.type)
            ),
        },
        {
          header: "Started",
          priority: 2,
          cell: (row) =>
            row.started.length > 0 ? (
              <span>
                {row.started.length} run{row.started.length === 1 ? "" : "s"}
              </span>
            ) : row.listeners === 0 ? (
              <span className="text-attention">
                {(row.pausedListeners ?? 0) > 0 ? "Listeners are paused" : "Nothing listens"}
              </span>
            ) : (
              <span className="text-ink-subtle">Nothing</span>
            ),
        },
      ]}
      rows={list.items}
      rowKey={(row) => row.id}
      selected={chosen}
      onSelect={(row) => setChosen(row.id)}
      error={list.error}
      onRetry={list.reload}
      table={{
        footer: (
          <LoadMore
            shown={list.items?.length ?? 0}
            hasMore={list.hasMore}
            loading={list.loadingMore}
            error={list.moreError}
            noun="events"
            onMore={list.loadMore}
          />
        ),
      }}
      empty={{
        title: applied ? `No ${applied} events yet` : "No events yet",
        text: "Declare an event with defineEvent, and publish it from a script with ctx.events.publish.",
      }}
      inspector={
        chosen && !open && !lookup.loading && (lookup.error || lookup.data) ? (
          <Inspector
            open
            label="The chosen event"
            title="Event not found"
            onClose={() => setChosen(undefined)}
          >
            <p className="m-0 text-ink-muted">
              No event with that ID is in this workspace. It may belong to another workspace, or
              have been removed with the older ones.
            </p>
          </Inspector>
        ) : open ? (
          <Inspector
            open
            label="The chosen event"
            title={open.name}
            eyebrow={stamp(open.occurredAt)}
            onClose={() => setChosen(undefined)}
          >
            <div className="flex flex-col gap-4">
              <KeyValues
                rows={[
                  {
                    label: "Published by",
                    value: open.publishedBy ? (
                      <Link to={`${link}/runs/${open.publishedBy.run}`}>
                        {open.publishedBy.script}
                      </Link>
                    ) : (
                      (SOURCE[open.source.type] ?? open.source.type)
                    ),
                  },
                  {
                    label: "Listening",
                    value: listening(open),
                  },
                  { label: "Event ID", value: open.id, mono: true },
                ]}
              />
              {open.listeners === 0 ? (
                <Notice tone="attention">
                  {(open.pausedListeners ?? 0) > 0
                    ? `Every trigger that listens for ${open.name} here is paused, so none of them started anything.`
                    : `No flow or script listens for ${open.name} here.`}
                </Notice>
              ) : null}
              {open.started.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-label text-ink-subtle uppercase">What it started</span>
                  {open.started.map((one) => (
                    <Link
                      key={one.id}
                      to={one.kind === "flow" ? `${link}/runs/${one.id}` : `${link}/runs/${one.id}`}
                      className="flex items-center justify-between gap-2 no-underline"
                    >
                      <Mono className="text-ink">{one.target}</Mono>
                      <StatePill state={one.state ?? stateOf(one.status)} />
                    </Link>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-col gap-1.5">
                <span className="text-label text-ink-subtle uppercase">Payload</span>
                <JsonView label="Payload" value={open.payload} maxHeight="24rem" />
              </div>
            </div>
          </Inspector>
        ) : null
      }
    />
  );
}

// ----- Approvals -----

interface Waiting {
  flowRunId: string;
  workspaceId: string;
  flow: string;
  node: string;
  title: string;
  detail: unknown;
  waitingSince: string;
  timesOutAt: string | null;
  approvers: { groups: string[]; roles: string[]; text: string } | null;
}

/**
 * What an approval is about, in one line: the first few fields of its detail,
 * so that several waiting approvals of one step can be told apart in the list.
 */
export function detailSummary(detail: unknown, most = 4): string | null {
  if (detail === null || detail === undefined) return null;
  if (typeof detail !== "object") return String(detail);
  if (Array.isArray(detail)) return `${detail.length} items`;
  const words = (key: string) => key.replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());
  const shown = (value: unknown) =>
    value === null || value === undefined
      ? "—"
      : typeof value === "object"
        ? JSON.stringify(value).slice(0, 40)
        : String(value);
  const entries = Object.entries(detail as Record<string, unknown>).slice(0, most);
  return entries.length > 0
    ? entries.map(([key, value]) => `${words(key)}: ${shown(value)}`).join(" · ")
    : null;
}

interface Decided {
  flowRunId: string;
  workspaceId: string;
  flow: string;
  node: string;
  title: string;
  approved: boolean;
  comment: string | null;
  decidedBy: { id: string; label: string } | null;
  decidedAt: string | null;
  /** Where it was decided: the console or the API, or a link in the mail. */
  via?: "console" | "email";
  waitedSeconds: number | null;
}

/**
 * Decisions waiting for this person, the oldest first, and those already made.
 * In a workspace: every approval of that workspace. For the tenant: the ones a
 * flow says to surface there, from every workspace.
 */
export function ApprovalsQueue({
  base,
  tenantId,
  workspaceId,
}: {
  /** The tenant's address in the API. */
  base: string;
  tenantId: string;
  /** Given, the queue is that workspace's own. */
  workspaceId?: string;
}) {
  const [state, setState] = useUrlParam<"waiting" | "others" | "decided">("show", "waiting");
  const from = workspaceId ? `${base}/workspaces/${workspaceId}` : base;
  const waiting = useLoad<{ items: Waiting[] }>(
    `${from}/approvals${workspaceId ? "?mine=true" : ""}`,
  );
  // What waits in this workspace for someone else: everything it can show, less what this
  // person may decide. Read-only: the server refuses a decision from anyone else.
  // For the tenant it is what the flows surfaced there, whoever may decide it.
  const everyone = useLoad<{ items: Waiting[] }>(
    workspaceId ? `${from}/approvals` : `${from}/approvals?all=true`,
  );
  const mineKeys = new Set(
    (waiting.data?.items ?? []).map((row) => `${row.flowRunId}-${row.node}`),
  );
  const others =
    everyone.data && waiting.data
      ? everyone.data.items.filter((row) => !mineKeys.has(`${row.flowRunId}-${row.node}`))
      : undefined;
  const decided = useLoad<{ items: Decided[] }>(
    state === "decided" ? `${from}/approvals/decided` : null,
  );
  const about = workspaceId
    ? `Flows in this workspace that paused for a person's decision, the longest waiting first. Approving lets the flow go on. ${REJECTING}`
    : "Decisions that flows surface to the whole tenant, from every workspace, the longest waiting first. Each workspace lists all of its own under Operate.";
  const workspaces = useLoad<{ items: { id: string; name: string; type: string }[] }>(
    `${base}/workspaces`,
  );
  const [chosen, setChosen] = useUrlParam("item", undefined, { push: true });
  const nameOf = (id: string) => workspaces.data?.items.find((one) => one.id === id)?.name ?? "";
  const key = (row: { flowRunId: string; node: string }) => `${row.flowRunId}-${row.node}`;
  // Approvals checked for one decision, with one comment.
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const batch = useBatch();
  const decideMany = async (keys: string[], decision: "approve" | "reject") => {
    const rows = (waiting.data?.items ?? []).filter((row) => keys.includes(key(row)));
    const names = rows
      .slice(0, 3)
      .map((row) => row.title)
      .join(", ");
    const comment = await ask.prompt({
      title: `${decision === "approve" ? "Approve" : "Reject"} ${rows.length} decision${rows.length === 1 ? "" : "s"}?`,
      text: rows.length > 3 ? `${names} and ${rows.length - 3} more.` : `${names}.`,
      // As for one: a reject says why, and the reason is kept with each decision.
      label:
        decision === "approve"
          ? "Note (optional), kept with each decision"
          : "Why are they rejected? Kept with each decision.",
      action: decision === "approve" ? "Approve" : "Reject",
      danger: decision === "reject",
      required: decision === "reject",
      multiline: true,
    });
    if (comment === null) return;
    const send = (subset: typeof rows) =>
      inSlices(subset, (slice) =>
        api.post<BatchAnswer>(`/tenants/${tenantId}/approvals/batch`, {
          decision,
          ...(comment ? { comment } : {}),
          approvals: slice.map((row) => ({
            workspaceId: row.workspaceId,
            flowRunId: row.flowRunId,
            node: row.node,
          })),
        }),
      );
    const titleOf = (id: string) =>
      rows.find((row) => `${row.flowRunId}/${row.node}` === id)?.title ?? id;
    await batch.run(() => send(rows), {
      title: decision === "approve" ? "Approving" : "Rejecting",
      done: (count) =>
        `${count} decision${count === 1 ? "" : "s"} ${decision === "approve" ? "approved" : "rejected"}.`,
      name: titleOf,
      retry: (ids) => send(rows.filter((row) => ids.includes(`${row.flowRunId}/${row.node}`))),
    });
    setChecked(new Set());
    waiting.reload();
  };
  const open = waiting.data?.items.find((one) => key(one) === chosen);

  const decide = async (row: Waiting, decision: "approve" | "reject") => {
    const comment = await ask.prompt({
      title: decision === "approve" ? `Approve “${row.title}”?` : `Reject “${row.title}”?`,
      label: decision === "approve" ? "Note (optional)" : "Why is it rejected?",
      required: decision === "reject",
      multiline: true,
      action: decision === "approve" ? "Approve" : "Reject",
      danger: decision === "reject",
    });
    if (comment === null) return;
    try {
      await api.post(
        `${base}/workspaces/${row.workspaceId}/flow-runs/${row.flowRunId}/approvals/${row.node}`,
        {
          decision,
          ...(comment ? { comment } : {}),
        },
      );
      notify.success(
        decision === "approve"
          ? `Approved “${row.title}”. The flow goes on.`
          : `Rejected “${row.title}”. ${REJECTING}`,
        {
          link: {
            label: "Open the run",
            href: `/t/${tenantId}/workspaces/${row.workspaceId}/runs/${row.flowRunId}`,
          },
        },
      );
      setChosen(undefined);
      waiting.reload();
    } catch (error) {
      notify.error(error);
    }
  };

  const chips = (
    <FilterChips
      label="Approvals"
      value={state}
      onChange={(next) => {
        setState(next);
        setChosen(undefined);
      }}
      options={[
        { value: "waiting", label: "Waiting for you", count: waiting.data?.items.length ?? null },
        {
          value: "others" as const,
          label: "Waiting for others",
          count: others?.length ?? null,
        },
        { value: "decided", label: "Decided" },
      ]}
    />
  );
  const runLinkOf = (row: { workspaceId: string; flowRunId: string }) =>
    `/t/${tenantId}/workspaces/${row.workspaceId}/runs/${row.flowRunId}`;

  if (state === "others") {
    return (
      <CollectionView<Waiting>
        title="Approvals"
        helpKey="workspace-approvals"
        description="Waiting for people other than you. You can see them but not decide them: the step names who may, or your role does not include approving."
        toolbar={chips}
        columns={[
          {
            header: "Decision",
            cell: (row) => {
              const about = detailSummary(row.detail);
              return (
                <span className="flex flex-col">
                  <span className="font-medium">{row.title}</span>
                  {about ? <span className="text-ink-muted">{about}</span> : null}
                  <span className="text-meta text-ink-subtle">
                    <Mono>{row.flow}</Mono> · {nameOf(row.workspaceId)}
                  </span>
                </span>
              );
            },
          },
          {
            header: "Waiting",
            cell: (row) => (
              <StatePill state="waiting">{ago(row.waitingSince).replace(" ago", "")}</StatePill>
            ),
          },
          {
            header: "Who decides",
            cell: (row) => (
              <span className="text-ink-muted">
                {row.approvers?.text ?? "Anyone who may approve"}
              </span>
            ),
          },
          {
            header: "",
            priority: 2,
            align: "end",
            cell: (row) => <Link to={runLinkOf(row)}>Open the run</Link>,
          },
        ]}
        rows={others}
        rowKey={key}
        error={everyone.error ?? waiting.error}
        onRetry={() => {
          everyone.reload();
          waiting.reload();
        }}
        empty={{ title: "Nothing waits for anyone else" }}
      />
    );
  }

  if (state === "decided") {
    return (
      <CollectionView<Decided>
        title="Approvals"
        helpKey={workspaceId ? "workspace-approvals" : "approvals"}
        description={about}
        toolbar={chips}
        columns={[
          {
            header: "Decision",
            cell: (row) => (
              <span className="flex flex-col">
                <span className="font-medium">{row.title}</span>
                <StatePill state={row.approved ? "approved" : "declined"} />
                {row.comment || row.via === "email" ? (
                  <span className="max-w-[28rem] text-meta text-ink-muted break-words">
                    {row.comment ? `“${row.comment}”` : ""}
                    {row.via === "email" ? (
                      <span className="text-ink-subtle">
                        {row.comment ? " · " : ""}decided from the mail
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </span>
            ),
          },
          {
            header: "Flow",
            priority: 2,
            cell: (row) => (
              <span className="flex flex-col">
                <Mono>{row.flow}</Mono>
                <span className="text-meta text-ink-subtle">{nameOf(row.workspaceId)}</span>
              </span>
            ),
          },
          {
            header: "By",
            priority: 3,
            cell: (row) => (
              <span className="flex min-w-0 flex-col">
                <span>{row.decidedBy?.label ?? "—"}</span>
              </span>
            ),
          },
          {
            header: "When",
            cell: (row) => (
              <Link to={runLinkOf(row)} className="whitespace-nowrap">
                {row.decidedAt ? ago(row.decidedAt) : "—"}
              </Link>
            ),
          },
        ]}
        rows={decided.data?.items}
        rowKey={key}
        error={decided.error}
        onRetry={decided.reload}
        empty={{ title: "Nothing decided yet" }}
      />
    );
  }

  return (
    <>
      {batch.dialog}
      <CollectionView<Waiting>
        title="Approvals"
        helpKey={workspaceId ? "workspace-approvals" : "approvals"}
        description={about}
        toolbar={chips}
        columns={[
          {
            header: "Decision",
            cell: (row) => {
              const about = detailSummary(row.detail);
              return (
                <span className="flex flex-col">
                  <span className="font-medium">{row.title}</span>
                  {about ? <span className="text-ink-muted">{about}</span> : null}
                  <span className="text-meta text-ink-subtle">
                    <Mono>{row.flow}</Mono> · {nameOf(row.workspaceId)}
                  </span>
                </span>
              );
            },
          },
          {
            header: "Waiting",
            cell: (row) => (
              <StatePill state="waiting">{ago(row.waitingSince).replace(" ago", "")}</StatePill>
            ),
          },
          {
            header: "Who decides",
            priority: 3,
            cell: (row) => (
              <span className="text-ink-muted">
                {row.approvers?.text ?? "Anyone who may approve"}
              </span>
            ),
          },
          {
            header: "",
            priority: 2,
            align: "end",
            cell: (row) => (
              <span className="inline-flex gap-2">
                <Button size="small" variant="primary" onClick={() => decide(row, "approve")}>
                  Approve
                </Button>
                <Button size="small" onClick={() => decide(row, "reject")}>
                  Reject
                </Button>
              </span>
            ),
          },
        ]}
        rows={waiting.data?.items}
        rowKey={key}
        selected={chosen}
        onSelect={(row) => setChosen(key(row))}
        table={{
          checked,
          onCheck: setChecked,
          batch: (keys) => (
            <>
              <Button
                size="small"
                variant="primary"
                disabled={batch.busy}
                onClick={() => void decideMany([...keys], "approve")}
              >
                Approve
              </Button>
              <Button
                size="small"
                disabled={batch.busy}
                onClick={() => void decideMany([...keys], "reject")}
              >
                Reject
              </Button>
            </>
          ),
        }}
        error={waiting.error}
        onRetry={waiting.reload}
        empty={{
          title: "Nothing is waiting for you",
          text: "When a flow pauses for a decision you may make, it appears here.",
        }}
        inspector={
          open ? (
            <>
              <Current
                object={{
                  heading: "This approval",
                  commands: [
                    {
                      key: "approve",
                      label: "Approve…",
                      icon: CircleCheck,
                      run: () => decide(open, "approve"),
                    },
                    {
                      key: "reject",
                      label: "Reject…",
                      icon: CircleX,
                      danger: true,
                      run: () => decide(open, "reject"),
                    },
                  ],
                }}
              />
              <Inspector
                open
                label="The chosen approval"
                title={open.title}
                eyebrow={`${open.flow} · ${nameOf(open.workspaceId)}`}
                onClose={() => setChosen(undefined)}
                footer={
                  <>
                    <Button variant="primary" onClick={() => decide(open, "approve")}>
                      Approve
                    </Button>
                    <Button onClick={() => decide(open, "reject")}>Reject</Button>
                  </>
                }
              >
                <div className="flex flex-col gap-4">
                  <KeyValues
                    rows={[
                      {
                        label: "Waiting since",
                        value: <Time value={open.waitingSince} />,
                      },
                      ...(open.timesOutAt
                        ? [
                            {
                              label: "Times out",
                              value: <Time value={open.timesOutAt} />,
                            },
                          ]
                        : []),
                      {
                        label: "Who decides",
                        value: open.approvers?.text ?? "Anyone who may approve",
                      },
                      { label: "Step", value: open.node, mono: true },
                    ]}
                  />
                  <div className="flex flex-col gap-1.5">
                    <span className="text-label text-ink-subtle uppercase">What it asks about</span>
                    <JsonView label="Detail" value={open.detail} maxHeight="24rem" />
                  </div>
                  <Button variant="quiet" onClick={() => navigate(runLinkOf(open))}>
                    Open the run's graph
                  </Button>
                </div>
              </Inspector>
            </>
          ) : null
        }
      />
    </>
  );
}

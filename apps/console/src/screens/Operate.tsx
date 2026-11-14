import { Button, JsonView, Notice, TextField } from "@vynxlabs/ui";
import { CirclePause, CirclePlay, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { api, useLoad } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { type CollectionColumn, CollectionView } from "../kit/CollectionView.tsx";
import { FilterChips, Inspector, KeyValues, NextStep } from "../kit/layout.tsx";
import { Mono, StatePill, stateOf } from "../kit/status.tsx";
import { CopyButton } from "../ListScreen.tsx";
import { Link, navigate } from "../router.tsx";
import { stamp } from "./Execution.tsx";
import { fromNow } from "./Overview.tsx";

// ----- Triggers -----

interface Trigger {
  path: string;
  node: string;
  type: string;
  script: string;
  targetKind: "script" | "flow";
  event: string | null;
  enabled: boolean;
  cron: string | null;
  timezone: string | null;
  nextFireAt: string | null;
  lastFiredAt: string | null;
  url: string | null;
  paused: { at: string; by: string | null; reason: string } | null;
  lastRun: { kind: "script" | "flow"; id: string; status: string; createdAt: string } | null;
  lastRefusal: { reason: string; problem: string; at: string } | null;
}

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
};

const triggerKey = (row: Trigger) => `${row.path}#${row.node}`;
const runLink = (link: string, run: NonNullable<Trigger["lastRun"]>) =>
  run.kind === "flow" ? `${link}/flow-runs/${run.id}` : `${link}/runs/${run.id}`;

/** What starts work by itself, by kind, with each one's last firing and a way to pause just it. */
export function TriggersWorkbench({
  root,
  link,
  workspacePaused,
  production,
}: {
  root: string;
  link: string;
  workspacePaused: boolean;
  production: boolean;
}) {
  const list = useLoad<{ items: Trigger[] }>(`${root}/triggers`);
  const [type, setType] = useState("all");
  const [chosen, setChosen] = useState<string>();
  const items = list.data?.items ?? [];
  const types = [...new Set(items.map((one) => one.type))];
  const rows = items.filter((one) => type === "all" || one.type === type);
  const open = items.find((one) => triggerKey(one) === chosen);
  const pausedCount = items.filter((one) => one.paused).length;

  const columns: CollectionColumn<Trigger>[] = [
    {
      header: "Trigger",
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <Mono className="truncate">
            {row.path}
            {row.node ? <span className="text-ink-subtle">#{row.node}</span> : null}
          </Mono>
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
          <Mono>{row.script}</Mono>
          <span className="text-meta text-ink-subtle">
            {row.targetKind === "flow" ? "Flow" : "Script"}
          </span>
        </span>
      ),
    },
    {
      header: "State",
      cell: (row) =>
        row.paused ? (
          <StatePill state="paused">Paused</StatePill>
        ) : !row.enabled ? (
          <StatePill state="cancelled">Off</StatePill>
        ) : workspacePaused ? (
          <StatePill state="paused">Workspace paused</StatePill>
        ) : row.nextFireAt ? (
          <span className="text-ink-muted">Next {fromNow(row.nextFireAt)}</span>
        ) : (
          <StatePill state="running">Listening</StatePill>
        ),
    },
    {
      header: "Last fired",
      priority: 2,
      cell: (row) =>
        row.lastRun ? (
          <span className="flex flex-col">
            <StatePill state={stateOf(row.lastRun.status)} />
            <span className="text-meta text-ink-subtle">{fromNow(row.lastRun.createdAt)}</span>
          </span>
        ) : row.lastFiredAt ? (
          <span className="text-ink-muted">{fromNow(row.lastFiredAt)}</span>
        ) : (
          <span className="text-ink-subtle">Never</span>
        ),
    },
  ];

  return (
    <CollectionView
      title="Triggers"
      description="What starts work here without anyone asking. Pause one to stop just it, in any workspace; the pause lasts through deploys until it is resumed."
      toolbar={
        <div className="flex flex-col gap-3">
          {workspacePaused ? (
            <Notice tone="attention">
              Every trigger in this workspace is paused. Resume them under Workspace settings.
            </Notice>
          ) : null}
          {production && pausedCount > 0 ? (
            <Notice tone="attention">
              {pausedCount} trigger{pausedCount === 1 ? " is" : "s are"} paused in production.
            </Notice>
          ) : null}
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
      selected={chosen}
      onSelect={(row) => setChosen(triggerKey(row))}
      error={list.error?.message}
      empty={{
        title: "Nothing starts by itself yet",
        text: "A schedule, a webhook, a form or an event in a flow or a script starts work here once it is deployed.",
      }}
      inspector={
        open ? (
          <Inspector
            open
            label="The chosen trigger"
            title={open.path}
            eyebrow={`${open.type} trigger${open.node ? ` · node ${open.node}` : ""}`}
            onClose={() => setChosen(undefined)}
            footer={
              open.paused ? (
                <Button
                  variant="primary"
                  onClick={async () => {
                    try {
                      await api.delete(
                        `${root}/trigger-pauses/${open.path}${open.node ? `?node=${encodeURIComponent(open.node)}` : ""}`,
                      );
                      list.reload();
                    } catch (caught) {
                      notify.error(caught);
                    }
                  }}
                >
                  <CirclePlay aria-hidden="true" size={15} /> Resume
                </Button>
              ) : (
                <Button
                  onClick={async () => {
                    const reason = await ask.prompt({
                      title: `Pause ${open.path}?`,
                      label: "Why (shown to everyone here)",
                      action: "Pause",
                      danger: production,
                      required: false,
                    });
                    if (reason === null) return;
                    try {
                      await api.put(
                        `${root}/trigger-pauses/${open.path}${open.node ? `?node=${encodeURIComponent(open.node)}` : ""}`,
                        reason ? { reason } : {},
                      );
                      list.reload();
                    } catch (caught) {
                      notify.error(caught);
                    }
                  }}
                >
                  <CirclePause aria-hidden="true" size={15} /> Pause this trigger
                </Button>
              )
            }
          >
            <div className="flex flex-col gap-4">
              {open.paused ? (
                <Notice tone="attention">
                  Paused {fromNow(open.paused.at)}
                  {open.paused.reason ? `: ${open.paused.reason}` : "."} Nothing it would start is
                  started until it is resumed.
                </Notice>
              ) : null}
              {open.lastRefusal ? (
                <div className="rounded-panel border border-line">
                  <NextStep
                    tone="danger"
                    icon={<ShieldAlert aria-hidden="true" size={15} />}
                    title={`Last refused ${fromNow(open.lastRefusal.at)}: ${REFUSED[open.lastRefusal.reason] ?? open.lastRefusal.reason}`}
                    detail={open.lastRefusal.problem || undefined}
                  />
                </div>
              ) : null}
              <KeyValues
                rows={[
                  { label: "Starts", value: `${open.script} (${open.targetKind})`, mono: true },
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
                  {
                    label: "Next",
                    value: open.nextFireAt
                      ? `${stamp(open.nextFireAt)} (${fromNow(open.nextFireAt)})`
                      : "On request",
                  },
                  {
                    label: "Last fired",
                    value: open.lastFiredAt
                      ? `${stamp(open.lastFiredAt)} (${fromNow(open.lastFiredAt)})`
                      : "Never",
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
                  <code className="rounded-control bg-code-bg p-2 font-mono text-telemetry break-all select-all">
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
        ) : null
      }
    />
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
  started: { kind: "script" | "flow"; id: string; target: string; status: string }[];
  listeners: number;
}

const SOURCE: Record<string, string> = {
  script: "A script",
  api: "The API",
  platform: "The platform",
};

/** What was published, newest first, with what each one started. */
export function EventsWorkbench({ root, link }: { root: string; link: string }) {
  const [name, setName] = useState("");
  const [applied, setApplied] = useState("");
  const list = useLoad<{ items: EventRow[] }>(
    `${root}/events?limit=100${applied ? `&name=${encodeURIComponent(applied)}` : ""}`,
  );
  const [chosen, setChosen] = useState<string>();
  const open = list.data?.items.find((one) => one.id === chosen);

  return (
    <CollectionView
      title="Events"
      description="What has been published here, newest first. Flows and scripts listen for an event by name."
      toolbar={
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setApplied(name.trim());
          }}
        >
          <div className="w-72 max-w-full">
            <TextField
              label="Event name"
              name="event"
              value={name}
              placeholder="orders/placed"
              required={false}
              onChange={setName}
            />
          </div>
          <Button type="submit">Show</Button>
          {applied ? (
            <Button
              variant="quiet"
              onClick={() => {
                setName("");
                setApplied("");
              }}
            >
              Show every event
            </Button>
          ) : null}
        </form>
      }
      columns={[
        {
          header: "When",
          cell: (row) => (
            <span className="whitespace-nowrap text-ink-muted">{fromNow(row.occurredAt)}</span>
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
              <span className="text-attention">Nothing listens</span>
            ) : (
              <span className="text-ink-subtle">Nothing</span>
            ),
        },
      ]}
      rows={list.data?.items}
      rowKey={(row) => row.id}
      selected={chosen}
      onSelect={(row) => setChosen(row.id)}
      error={list.error?.message}
      empty={{
        title: applied ? `No ${applied} events yet` : "No events yet",
        text: "Declare an event with defineEvent, and publish it from a script with ctx.events.publish.",
      }}
      inspector={
        open ? (
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
                    value: `${open.listeners} trigger${open.listeners === 1 ? "" : "s"}`,
                  },
                  { label: "Event ID", value: open.id, mono: true },
                ]}
              />
              {open.listeners === 0 ? (
                <Notice tone="attention">No flow or script listens for {open.name} here.</Notice>
              ) : null}
              {open.started.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-label text-ink-subtle uppercase">What it started</span>
                  {open.started.map((one) => (
                    <Link
                      key={one.id}
                      to={
                        one.kind === "flow"
                          ? `${link}/flow-runs/${one.id}`
                          : `${link}/runs/${one.id}`
                      }
                      className="flex items-center justify-between gap-2 no-underline"
                    >
                      <Mono className="text-ink">{one.target}</Mono>
                      <StatePill state={stateOf(one.status)} />
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
  waitedSeconds: number | null;
}

/** Decisions waiting for this person, the oldest first, and those already made. */
export function ApprovalsQueue({ base, tenantId }: { base: string; tenantId: string }) {
  const [state, setState] = useState<"waiting" | "decided">("waiting");
  const waiting = useLoad<{ items: Waiting[] }>(`${base}/approvals`);
  const decided = useLoad<{ items: Decided[] }>(
    state === "decided" ? `${base}/approvals/decided` : null,
  );
  const workspaces = useLoad<{ items: { id: string; name: string; type: string }[] }>(
    `${base}/workspaces`,
  );
  const [chosen, setChosen] = useState<string>();
  const nameOf = (id: string) => workspaces.data?.items.find((one) => one.id === id)?.name ?? "";
  const key = (row: { flowRunId: string; node: string }) => `${row.flowRunId}-${row.node}`;
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
        { value: "waiting", label: "Waiting", count: waiting.data?.items.length ?? null },
        { value: "decided", label: "Decided" },
      ]}
    />
  );
  const runLinkOf = (row: { workspaceId: string; flowRunId: string }) =>
    `/t/${tenantId}/workspaces/${row.workspaceId}/flow-runs/${row.flowRunId}`;

  if (state === "decided") {
    return (
      <CollectionView<Decided>
        title="Approvals"
        description="Flows that paused for a person's decision."
        toolbar={chips}
        columns={[
          {
            header: "Decision",
            cell: (row) => (
              <span className="flex flex-col">
                <span className="font-medium">{row.title}</span>
                <StatePill state={row.approved ? "succeeded" : "failed"}>
                  {row.approved ? "Approved" : "Rejected"}
                </StatePill>
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
          { header: "By", priority: 3, cell: (row) => row.decidedBy?.label ?? "—" },
          {
            header: "When",
            cell: (row) => (
              <Link to={runLinkOf(row)} className="whitespace-nowrap">
                {row.decidedAt ? fromNow(row.decidedAt) : "—"}
              </Link>
            ),
          },
        ]}
        rows={decided.data?.items}
        rowKey={key}
        error={decided.error?.message}
        empty={{ title: "Nothing decided yet" }}
      />
    );
  }

  return (
    <CollectionView<Waiting>
      title="Approvals"
      description="Flows that paused for a person's decision, the longest waiting first. Approving lets the flow go on; rejecting fails that step."
      toolbar={chips}
      columns={[
        {
          header: "Decision",
          cell: (row) => (
            <span className="flex flex-col">
              <span className="font-medium">{row.title}</span>
              <span className="text-meta text-ink-subtle">
                <Mono>{row.flow}</Mono> · {nameOf(row.workspaceId)}
              </span>
            </span>
          ),
        },
        {
          header: "Waiting",
          cell: (row) => (
            <StatePill state="waiting">{fromNow(row.waitingSince).replace(" ago", "")}</StatePill>
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
      error={waiting.error?.message}
      empty={{
        title: "Nothing is waiting for you",
        text: "When a flow pauses for a decision you may make, it appears here.",
      }}
      inspector={
        open ? (
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
                    value: `${stamp(open.waitingSince)} (${fromNow(open.waitingSince)})`,
                  },
                  ...(open.timesOutAt
                    ? [
                        {
                          label: "Times out",
                          value: `${stamp(open.timesOutAt)} (${fromNow(open.timesOutAt)})`,
                        },
                      ]
                    : []),
                  { label: "Who decides", value: open.approvers?.text ?? "Anyone who may approve" },
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
        ) : null
      }
    />
  );
}

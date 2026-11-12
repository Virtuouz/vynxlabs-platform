import { Badge, type BadgeTone, Button, EmptyState, Notice, Table } from "@vynxlabs/ui";
import { useEffect, useState } from "preact/hooks";
import { type ApiError, api, useLoad } from "../api.ts";
import { FlowGraph, type GraphEdge, type GraphNode, type Positions } from "../FlowGraph.tsx";
import { ListScreen, Page, when } from "../ListScreen.tsx";
import { Link, navigate } from "../router.tsx";

const code = (text: string) => <code class="font-mono text-[13px]">{text}</code>;

type FlowStatus = "running" | "succeeded" | "failed" | "cancelled";
const STATUS: Record<string, [BadgeTone, string]> = {
  running: ["action", "Running"],
  waiting: ["attention", "Waiting"],
  succeeded: ["success", "Succeeded"],
  failed: ["danger", "Failed"],
  cancelled: ["neutral", "Cancelled"],
  skipped: ["neutral", "Skipped"],
};
const StatusBadge = ({ status }: { status: string }) => (
  <Badge tone={STATUS[status]?.[0] ?? "neutral"}>{STATUS[status]?.[1] ?? status}</Badge>
);

const TRIGGER: Record<string, string> = {
  manual: "By hand",
  schedule: "Schedule",
  webhook: "Webhook",
  event: "Event",
  flow: "Another flow",
};

export function Flows({ root, link }: { root: string; link: string }) {
  return (
    <ListScreen<{
      path: string;
      description: string;
      nodeCount: number;
      triggers: string[];
      lastRun: { id: string; status: FlowStatus; createdAt: string } | null;
    }>
      title="Flows"
      description="A flow is a graph of steps the platform runs in order, remembering where it is. It survives a restart."
      path={`${root}/flows`}
      rowKey={(row) => row.path}
      columns={[
        {
          header: "Flow",
          cell: (row) => (
            <Link to={`${link}/flows/${row.path}`} class="font-medium text-action">
              {row.path}
            </Link>
          ),
        },
        {
          header: "What it does",
          cell: (row) => <span class="text-ink-muted">{row.description}</span>,
        },
        {
          header: "Started by",
          cell: (row) => [...new Set(row.triggers)].map((type) => TRIGGER[type] ?? type).join(", "),
        },
        {
          header: "Last run",
          cell: (row) =>
            row.lastRun ? (
              <Link
                to={`${link}/flow-runs/${row.lastRun.id}`}
                class="inline-flex items-center gap-2 no-underline"
              >
                <StatusBadge status={row.lastRun.status} />
                <span class="text-ink-muted">{when(row.lastRun.createdAt)}</span>
              </Link>
            ) : (
              <span class="text-ink-muted">Never</span>
            ),
        },
      ]}
      empty={{
        title: "No flows yet",
        text: "Define a flow in the tenant's repository with defineFlow, and deploy it.",
      }}
    />
  );
}

interface FlowDetail {
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
  trigger: { type: string };
  createdAt: string;
  finishedAt: string | null;
}

/** One flow: its graph, how it is started, and its recent runs. */
export function FlowView({ root, path, link }: { root: string; path: string; link: string }) {
  const flow = useLoad<FlowDetail>(`${root}/flows/${path}`);
  const runs = useLoad<{ items: FlowRunRow[] }>(
    `${root}/flow-runs?flow=${encodeURIComponent(path)}&limit=20`,
  );
  const [saved, setSaved] = useState<"saving" | "saved" | string>();
  if (flow.error) return <Notice tone="danger">{flow.error.message}</Notice>;
  if (!flow.data) return <p class="text-ink-muted">Loading…</p>;
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
          <Button
            variant="primary"
            onClick={async () => {
              const text = window.prompt(`Input for ${data.path}, as JSON`, "{}");
              if (text === null) return;
              try {
                const started = await api.post<{ id: string }>(`${root}/flow-runs`, {
                  flow: data.path,
                  input: JSON.parse(text),
                });
                navigate(`${link}/flow-runs/${started.id}`);
              } catch (error) {
                window.alert(
                  error instanceof SyntaxError
                    ? "That is not valid JSON."
                    : (error as Error).message,
                );
              }
            }}
          >
            Start flow
          </Button>
        ) : undefined
      }
    >
      <Link to={`${link}/flows`} class="text-action">
        All flows
      </Link>
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
      <p class="m-0 text-[13px] text-ink-muted" aria-live="polite">
        {saved === "saving"
          ? "Saving the arrangement…"
          : saved === "saved"
            ? "Arrangement saved. The flow itself is unchanged."
            : (saved ??
              "Drag a step to arrange the graph. Arranging changes nothing about how the flow runs.")}
      </p>
      {data.triggers.length > 0 ? (
        <section>
          <h2 class="mt-2 mb-2 text-base font-semibold">How it starts</h2>
          <ul class="m-0 flex list-none flex-col gap-1 p-0">
            {data.triggers.map((trigger) => (
              <li key={trigger.node}>
                {code(trigger.node)}{" "}
                {trigger.type === "schedule" && trigger.nextFireAt ? (
                  <span>runs next at {when(trigger.nextFireAt)}</span>
                ) : trigger.type === "webhook" ? (
                  trigger.url ? (
                    <span class="font-mono text-[13px] break-all select-all">
                      POST {trigger.url}
                    </span>
                  ) : (
                    <span class="text-ink-muted">
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
        <h2 class="mt-2 mb-2 text-base font-semibold">Recent runs</h2>
        <Table
          rows={runs.data?.items ?? []}
          rowKey={(row) => row.id}
          empty={<EmptyState title="This flow has not run yet" />}
          columns={[
            {
              header: "Started",
              cell: (row) => (
                <Link to={`${link}/flow-runs/${row.id}`} class="text-action">
                  {when(row.createdAt)}
                </Link>
              ),
            },
            { header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
            { header: "Started by", cell: (row) => TRIGGER[row.trigger.type] ?? row.trigger.type },
          ]}
        />
      </section>
    </Page>
  );
}

interface StepRow {
  node: string;
  item: string;
  status: string;
  outputName: string | null;
  output: unknown;
  error: { message: string } | null;
  handled: boolean;
  runId: string | null;
  childFlowRunId: string | null;
  wakeAt: string | null;
  detail: { title?: string; detail?: unknown };
}
interface FlowRunDetail extends FlowRunRow {
  flow: string;
  triggerNode: string;
  bundleVersion: number;
  error: { message: string } | null;
  input: unknown;
  output: unknown;
  steps: StepRow[];
}

/** One flow run, drawn on the flow's graph and refreshed while it is in progress. */
export function FlowRunView({ root, id, link }: { root: string; id: string; link: string }) {
  const [run, setRun] = useState<FlowRunDetail>();
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const [tick, setTick] = useState(0);
  const flow = useLoad<FlowDetail>(run ? `${root}/flows/${run.flow}` : null);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const current = await api.get<FlowRunDetail>(`${root}/flow-runs/${id}`);
        if (stopped) return;
        setRun(current);
        if (current.status === "running") timer = setTimeout(poll, 1500);
      } catch (caught) {
        if (!stopped) setError((caught as Error).message);
      }
    };
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [root, id, tick]);

  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!run) return <p class="text-ink-muted">Loading…</p>;
  const steps = run.steps.filter((step) => step.item === "");
  const statuses = Object.fromEntries(steps.map((step) => [step.node, step.status]));
  const chosen = steps.find((step) => step.node === selected);
  const items = run.steps.filter((step) => step.node === selected && step.item !== "");
  const waitingApprovals = steps.filter((step) => step.status === "waiting" && step.detail.title);

  const decide = async (node: string, decision: "approve" | "reject") => {
    const comment = window.prompt(
      decision === "approve" ? "Add a note (optional)" : "Why is it rejected?",
      "",
    );
    if (comment === null) return;
    try {
      await api.post(`${root}/flow-runs/${id}/approvals/${node}`, {
        decision,
        ...(comment ? { comment } : {}),
      });
      setTick((value) => value + 1);
    } catch (caught) {
      window.alert((caught as Error).message);
    }
  };

  return (
    <Page
      title={run.flow}
      action={
        run.status === "running" ? (
          <Button
            variant="danger"
            onClick={async () => {
              if (!window.confirm("Cancel this flow run? Steps in progress are cancelled too."))
                return;
              await api
                .post(`${root}/flow-runs/${id}/cancel`)
                .catch((caught) => window.alert((caught as Error).message));
              setTick((value) => value + 1);
            }}
          >
            Cancel flow run
          </Button>
        ) : undefined
      }
    >
      <div class="flex flex-wrap items-center gap-3">
        <Link to={`${link}/flows/${run.flow}`} class="text-action">
          {run.flow}
        </Link>
        <StatusBadge status={run.status} />
        <span class="text-ink-muted">
          Started {when(run.createdAt)} by{" "}
          {(TRIGGER[run.trigger.type] ?? run.trigger.type).toLowerCase()}, on bundle version{" "}
          {run.bundleVersion}
        </span>
      </div>
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
            <span class="flex gap-2">
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
            <span class="ml-2 font-mono text-[13px]">{JSON.stringify(step.detail.detail)}</span>
          ) : null}
        </Notice>
      ))}
      {flow.data ? (
        <FlowGraph
          nodes={flow.data.nodes}
          edges={flow.data.edges}
          layout={flow.data.layout}
          statuses={statuses}
          selected={selected}
          onSelect={setSelected}
        />
      ) : null}
      {chosen ? (
        <section class="rounded-panel border border-line bg-surface p-4">
          <h2 class="mt-0 mb-2 flex items-center gap-2 text-base font-semibold">
            {code(chosen.node)} <StatusBadge status={chosen.status} />
            {chosen.outputName ? (
              <span class="font-normal text-ink-muted">took the case {chosen.outputName}</span>
            ) : null}
          </h2>
          {chosen.error ? (
            <p class="mt-0 text-danger">
              {chosen.error.message}
              {chosen.handled ? (
                <span class="text-ink-muted"> The flow carried on down its error path.</span>
              ) : null}
            </p>
          ) : null}
          {chosen.wakeAt && chosen.status === "waiting" ? (
            <p class="mt-0 text-ink-muted">Waits until {when(chosen.wakeAt)}.</p>
          ) : null}
          {chosen.runId ? (
            <p class="mt-0">
              <Link to={`${link}/runs/${chosen.runId}`} class="text-action">
                See this step's run and its log
              </Link>
            </p>
          ) : null}
          {chosen.childFlowRunId ? (
            <p class="mt-0">
              <Link to={`${link}/flow-runs/${chosen.childFlowRunId}`} class="text-action">
                See the flow run this step started
              </Link>
            </p>
          ) : null}
          {items.length > 0 ? (
            <p class="mt-0 text-ink-muted">
              {items.filter((item) => item.status === "succeeded").length} of {items.length} items
              done.
            </p>
          ) : null}
          {chosen.status === "succeeded" ? (
            <pre class="m-0 max-h-64 overflow-auto rounded-control bg-canvas p-3 font-mono text-[13px]">
              {JSON.stringify(chosen.output, null, 2)}
            </pre>
          ) : null}
        </section>
      ) : (
        <p class="m-0 text-ink-muted">Choose a step to see what it produced.</p>
      )}
    </Page>
  );
}

interface ApprovalRow {
  flowRunId: string;
  workspaceId: string;
  flow: string;
  node: string;
  title: string;
  detail: unknown;
  waitingSince: string;
}

/** Everything in the tenant that is waiting for this person's decision. */
export function Approvals({ base, tenantId }: { base: string; tenantId: string }) {
  return (
    <ListScreen<ApprovalRow>
      title="Approvals"
      description="Flows that have paused for a person. Approving lets the flow continue. Rejecting stops that step."
      path={`${base}/approvals`}
      rowKey={(row) => `${row.flowRunId}-${row.node}`}
      columns={[
        {
          header: "Asks",
          cell: (row) => (
            <Link
              to={`/t/${tenantId}/workspaces/${row.workspaceId}/flow-runs/${row.flowRunId}`}
              class="font-medium text-action"
            >
              {row.title}
            </Link>
          ),
        },
        {
          header: "Details",
          cell: (row) => (
            <span class="font-mono text-[13px] text-ink-muted">
              {row.detail ? JSON.stringify(row.detail) : ""}
            </span>
          ),
        },
        { header: "Flow", cell: (row) => code(row.flow) },
        { header: "Waiting since", cell: (row) => when(row.waitingSince) },
      ]}
      empty={{
        title: "Nothing is waiting for you",
        text: "When a flow pauses for approval, it appears here.",
      }}
      rowActions={(row, reload) => {
        const decide = async (decision: "approve" | "reject") => {
          const comment = window.prompt(
            decision === "approve" ? "Add a note (optional)" : "Why is it rejected?",
            "",
          );
          if (comment === null) return;
          try {
            await api.post(
              `${base}/workspaces/${row.workspaceId}/flow-runs/${row.flowRunId}/approvals/${row.node}`,
              {
                decision,
                ...(comment ? { comment } : {}),
              },
            );
            reload();
          } catch (error) {
            window.alert((error as Error).message);
          }
        };
        return (
          <span class="inline-flex gap-2">
            <Button size="small" variant="primary" onClick={() => decide("approve")}>
              Approve
            </Button>
            <Button size="small" onClick={() => decide("reject")}>
              Reject
            </Button>
          </span>
        );
      }}
    />
  );
}

export function Events({ root }: { root: string }) {
  return (
    <ListScreen<{
      id: string;
      name: string;
      payload: object;
      source: { type: string };
      occurredAt: string;
    }>
      title="Events"
      description="What has been published in this workspace, newest first. Scripts and flows can listen for an event by name."
      path={`${root}/events?limit=100`}
      rowKey={(row) => row.id}
      columns={[
        {
          header: "When",
          cell: (row) => <span class="whitespace-nowrap">{when(row.occurredAt)}</span>,
        },
        { header: "Event", cell: (row) => code(row.name) },
        {
          header: "Published by",
          cell: (row) =>
            ({ script: "A script", api: "The API", platform: "The platform" })[row.source.type] ??
            row.source.type,
        },
        {
          header: "Payload",
          cell: (row) => (
            <span class="font-mono text-[13px] text-ink-muted">{JSON.stringify(row.payload)}</span>
          ),
        },
      ]}
      empty={{
        title: "No events yet",
        text: "Declare an event with defineEvent, and publish it from a script with ctx.events.publish.",
      }}
    />
  );
}

import type { Kernel } from "./kernel.js";
import { currentTrace, newTraceId, spanIdOf, type TraceContext } from "./telemetry.js";

/**
 * What the platform's own work looks like as spans. A run is three: the run,
 * its wait for a worker, and its execution. A flow run is one, with one for
 * each of its steps; a step that starts a run or another flow is the parent
 * of that run or flow run. Each is sent when the work ends, from what the
 * database already keeps of when it started and ended.
 */

/** The span a flow's step is, which what the step starts hangs from. */
export const stepSpan = (flowRunId: string, node: string, item: string | null) =>
  spanIdOf("step", flowRunId, node, item ?? "");

/**
 * The trace something starting now belongs to: its flow run's, when a flow's
 * step starts it; the request's, when a request does; or a new one.
 */
export function traceFor(
  parent: { traceId: string | null; flowRunId: string; node: string; item: string } | undefined,
): { trace_id: string; trace_parent: string | null } {
  if (parent?.traceId) {
    return {
      trace_id: parent.traceId,
      trace_parent: stepSpan(parent.flowRunId, parent.node, parent.item),
    };
  }
  const request = currentTrace();
  return request
    ? { trace_id: request.traceId, trace_parent: request.spanId }
    : { trace_id: newTraceId(), trace_parent: null };
}

interface TracedRun {
  id: string;
  tenant_id: string;
  workspace_id: string;
  script_path: string;
  trigger_type: string;
  attempt: number;
  pool: string | null;
  flow_run_id: string | null;
  trace_id: string | null;
  trace_parent: string | null;
  created_at: Date;
  scheduled_for: Date | null;
  started_at: Date | null;
  finished_at?: Date | null;
}

/** The span a run's execution is, which the worker's own span hangs from. */
export const executionSpan = (runId: string) => spanIdOf("execute", runId);

/** What a worker is given to carry the trace on: the run's execution, as a `traceparent`. */
export function runTraceparent(run: { id: string; trace_id: string | null }): string | undefined {
  return run.trace_id ? `00-${run.trace_id}-${executionSpan(run.id)}-01` : undefined;
}

export function traceRun(
  kernel: Kernel,
  run: TracedRun,
  state: "succeeded" | "failed" | "cancelled",
  error?: string,
): void {
  const { telemetry } = kernel;
  if (!telemetry.tracing || !run.trace_id) return;
  const end = run.finished_at ?? new Date();
  const span = spanIdOf("run", run.id);
  const attributes = {
    "platform.tenant.id": run.tenant_id,
    "platform.workspace.id": run.workspace_id,
    "platform.run.id": run.id,
    "platform.script": run.script_path,
    "platform.trigger": run.trigger_type,
    "platform.run.state": state,
    "platform.run.attempts": run.attempt,
    ...(run.flow_run_id ? { "platform.flow_run.id": run.flow_run_id } : {}),
  };
  telemetry.span({
    traceId: run.trace_id,
    spanId: span,
    parentSpanId: run.trace_parent ?? undefined,
    name: `run ${run.script_path}`,
    start: run.created_at,
    end,
    attributes,
    error: state === "failed" ? (error ?? "The run failed.") : undefined,
  });
  // Its wait is from when it was due to when a worker first took it, or to its end if none did.
  const due = run.scheduled_for ?? run.created_at;
  telemetry.span({
    traceId: run.trace_id,
    spanId: spanIdOf("wait", run.id),
    parentSpanId: span,
    name: "wait for a worker",
    kind: "producer",
    start: due,
    end: run.started_at ?? end,
    attributes: { "platform.run.id": run.id, "platform.pool": run.pool ?? "default" },
  });
  if (run.started_at) {
    telemetry.span({
      traceId: run.trace_id,
      spanId: executionSpan(run.id),
      parentSpanId: span,
      name: `execute ${run.script_path}`,
      kind: "consumer",
      start: run.started_at,
      end,
      attributes: { "platform.run.id": run.id, "platform.run.attempts": run.attempt },
      error: state === "failed" ? (error ?? "The run failed.") : undefined,
    });
  }
}

interface TracedFlowRun {
  id: string;
  tenant_id: string;
  workspace_id: string;
  flow_path: string;
  trace_id?: string | null;
  trace_parent?: string | null;
  created_at?: Date;
}

interface TracedStep {
  node_id: string;
  item_key: string;
  status: string;
  started_at?: Date;
  finished_at?: Date | null;
  error?: { message: string } | null;
}

export function traceFlowRun(
  kernel: Kernel,
  flowRun: TracedFlowRun,
  steps: Iterable<TracedStep>,
  state: "succeeded" | "failed" | "cancelled",
  error?: string,
): void {
  const { telemetry } = kernel;
  if (!telemetry.tracing || !flowRun.trace_id) return;
  const end = new Date();
  const span = spanIdOf("flow", flowRun.id);
  const context: TraceContext = { traceId: flowRun.trace_id, spanId: span };
  telemetry.span({
    ...context,
    parentSpanId: flowRun.trace_parent ?? undefined,
    name: `flow ${flowRun.flow_path}`,
    start: flowRun.created_at ?? end,
    end,
    attributes: {
      "platform.tenant.id": flowRun.tenant_id,
      "platform.workspace.id": flowRun.workspace_id,
      "platform.flow_run.id": flowRun.id,
      "platform.flow": flowRun.flow_path,
      "platform.flow_run.state": state,
    },
    error: state === "failed" ? (error ?? "The flow run failed.") : undefined,
  });
  for (const step of steps) {
    telemetry.span({
      traceId: flowRun.trace_id,
      spanId: stepSpan(flowRun.id, step.node_id, step.item_key),
      parentSpanId: span,
      name: `step ${step.node_id}${step.item_key ? ` [${step.item_key}]` : ""}`,
      start: step.started_at ?? flowRun.created_at ?? end,
      end: step.finished_at ?? end,
      attributes: {
        "platform.flow_run.id": flowRun.id,
        "platform.step": step.node_id,
        "platform.step.state": step.status,
        ...(step.item_key ? { "platform.step.item": step.item_key } : {}),
      },
      error: step.status === "failed" ? (step.error?.message ?? "The step failed.") : undefined,
    });
  }
}

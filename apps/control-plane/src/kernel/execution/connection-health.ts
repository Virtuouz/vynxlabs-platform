import { recordHealth } from "../data/health.js";
import { onTaskEnded } from "./tasks.js";

/** What a worker found when it tried a connection. */
interface Tried {
  ok?: boolean;
  status?: number;
  message?: string;
  latencyMs?: number;
}

/**
 * A connection's Test is kept as its health: what the list shows until the
 * next Test, or until its settings change.
 */
onTaskEnded("test-connection", async (kernel, task, outcome) => {
  if (!task.subject) return;
  let problem: string | null;
  let latencyMs: number | null = null;
  if ("result" in outcome) {
    const tried = (outcome.result ?? {}) as Tried;
    latencyMs = typeof tried.latencyMs === "number" ? tried.latencyMs : null;
    problem = tried.ok
      ? null
      : [typeof tried.status === "number" ? `HTTP ${tried.status}` : null, tried.message]
          .filter(Boolean)
          .join(": ") || "It could not be reached.";
  } else {
    // A worker that could not read the connection says which call failed; the reason is enough.
    problem =
      outcome.error.message.replace(/^(GET|POST) \S+ answered \d+: /, "") || "No worker answered.";
  }
  await recordHealth(kernel.db, {
    tenantId: task.tenant_id,
    workspaceId: task.workspace_id,
    kind: "connection",
    path: task.subject,
    problem,
    latencyMs,
  });
});

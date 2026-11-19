import { createHash } from "node:crypto";

/**
 * A worker's own part of a trace: one span for each attempt it executes, sent
 * by OTLP over HTTP as JSON. A worker sends nothing unless it is told where
 * to: one inside a client's network reaches only what it was configured to.
 */

export interface WorkerTelemetry {
  /** Where OTLP goes, without `/v1/traces`. */
  endpoint: string;
  headers?: Record<string, string>;
  serviceName?: string;
}

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;

/** Reads the worker's telemetry from the names OpenTelemetry gives its own settings. */
export function telemetryFromEnv(env: NodeJS.ProcessEnv): WorkerTelemetry | undefined {
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.replace(/\/+$/, "");
  if (!endpoint || !/^https?:\/\//.test(endpoint) || env.OTEL_TRACES_EXPORTER === "none") {
    return undefined;
  }
  const headers: Record<string, string> = {};
  for (const pair of (env.OTEL_EXPORTER_OTLP_HEADERS ?? "").split(",")) {
    const at = pair.indexOf("=");
    if (at > 0) headers[pair.slice(0, at).trim().toLowerCase()] = pair.slice(at + 1).trim();
  }
  return { endpoint, headers, serviceName: env.OTEL_SERVICE_NAME ?? "volvel-worker" };
}

/** The span of one attempt, as OTLP's JSON has it, or nothing when the job carries no trace. */
export function attemptSpan(
  telemetry: WorkerTelemetry,
  job: { runId: string; attempt: number; script: { path: string }; traceparent?: string },
  workerId: string,
  start: number,
  end: number,
  error: string | undefined,
): object | undefined {
  const found = TRACEPARENT.exec(job.traceparent ?? "");
  if (!found) return undefined;
  const text = (key: string, value: string) => ({ key, value: { stringValue: value } });
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [text("service.name", telemetry.serviceName ?? "volvel-worker")],
        },
        scopeSpans: [
          {
            scope: { name: "volvel-worker" },
            spans: [
              {
                traceId: found[1],
                spanId: createHash("sha256")
                  .update(`worker\u0000${job.runId}\u0000${job.attempt}`)
                  .digest("hex")
                  .slice(0, 16),
                parentSpanId: found[2],
                name: `attempt ${job.attempt} of ${job.script.path}`,
                kind: 1,
                startTimeUnixNano: `${Math.round(start)}000000`,
                endTimeUnixNano: `${Math.round(end)}000000`,
                attributes: [
                  text("platform.run.id", job.runId),
                  text("platform.script", job.script.path),
                  text("platform.worker.id", workerId),
                  { key: "platform.run.attempt", value: { intValue: String(job.attempt) } },
                ],
                status: error ? { code: 2, message: error.slice(0, 500) } : { code: 1 },
              },
            ],
          },
        ],
      },
    ],
  };
}

/** Sends one attempt's span. A span that cannot be sent is let go: the run is what matters. */
export async function sendAttemptSpan(telemetry: WorkerTelemetry, body: object): Promise<void> {
  await fetch(`${telemetry.endpoint}/v1/traces`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(telemetry.headers ?? {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}

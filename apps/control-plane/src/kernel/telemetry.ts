import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomBytes } from "node:crypto";

/**
 * Traces and metrics in OpenTelemetry's own format, sent by OTLP over HTTP as
 * JSON to whatever endpoint the operator names. Nothing is sent, and nothing is
 * kept to send, when none is named. The platform ships no collector and uses
 * no OpenTelemetry package: the format is a few shapes of JSON, written here.
 *
 * A trace follows one piece of work from the request that began it: the HTTP
 * request, the run or flow run it started, the wait for a worker, the
 * execution, and each step of a flow. A trace's ID is kept on the run and the
 * flow run whether or not anything is sent, so it can be read off a run and
 * looked for in the logs. Every other span's ID is worked out from what it is
 * a span of, so nothing else needs keeping.
 */

export interface TraceContext {
  /** 32 hex digits. */
  traceId: string;
  /** The span that work begun now is a child of: 16 hex digits. */
  spanId: string;
}

export interface TelemetryConfig {
  /** Where OTLP goes, without `/v1/traces`. Undefined sends nothing. */
  endpoint: string | undefined;
  headers: Record<string, string>;
  serviceName: string;
  traces: boolean;
  metrics: boolean;
  /** How often metrics are sent, in milliseconds. */
  metricsIntervalMs: number;
}

export const TELEMETRY_OFF: TelemetryConfig = {
  endpoint: undefined,
  headers: {},
  serviceName: "platform",
  traces: false,
  metrics: false,
  metricsIntervalMs: 60_000,
};

type AttributeValue = string | number | boolean | null | undefined;
export type Attributes = Record<string, AttributeValue>;

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string | undefined;
  name: string;
  kind?: "server" | "internal" | "producer" | "consumer";
  start: Date | number;
  end: Date | number;
  attributes?: Attributes;
  /** A message makes it an error. */
  error?: string | undefined;
}

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;
const ZERO_TRACE = "0".repeat(32);
const ZERO_SPAN = "0".repeat(16);

export const newTraceId = () => randomBytes(16).toString("hex");
export const newSpanId = () => randomBytes(8).toString("hex");

/** A span's ID from what it is a span of: the same wherever and whenever it is asked for. */
export function spanIdOf(...parts: (string | number | null | undefined)[]): string {
  return createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("\u0000"))
    .digest("hex")
    .slice(0, 16);
}

/** What a W3C `traceparent` header carries, or nothing when it is not one. */
export function parseTraceparent(header: unknown): TraceContext | undefined {
  if (typeof header !== "string") return undefined;
  const found = TRACEPARENT.exec(header.trim().toLowerCase());
  if (!found || found[1] === ZERO_TRACE || found[2] === ZERO_SPAN) return undefined;
  return { traceId: found[1] as string, spanId: found[2] as string };
}

export const traceparentOf = (context: TraceContext) =>
  `00-${context.traceId}-${context.spanId}-01`;

const current = new AsyncLocalStorage<TraceContext>();

/** The trace the code running now is part of: the request's, when a request is being answered. */
export const currentTrace = (): TraceContext | undefined => current.getStore();

/** Runs `work` as part of a trace, so what it starts is found to belong to it. */
export const withTrace = <T>(context: TraceContext, work: () => T): T => current.run(context, work);

const nanos = (at: Date | number) => {
  const ms = typeof at === "number" ? at : at.getTime();
  // A whole number of milliseconds, then six zeros: no precision is lost to a float.
  return `${Math.round(ms)}000000`;
};

function attributesOf(attributes: Attributes | undefined) {
  const list: { key: string; value: object }[] = [];
  for (const [key, value] of Object.entries(attributes ?? {})) {
    if (value === undefined || value === null) continue;
    list.push({
      key,
      value:
        typeof value === "boolean"
          ? { boolValue: value }
          : typeof value === "number"
            ? Number.isInteger(value)
              ? { intValue: String(value) }
              : { doubleValue: value }
            : { stringValue: value },
    });
  }
  return list;
}

const KINDS = { internal: 1, server: 2, producer: 4, consumer: 5 } as const;

/** One span as OTLP's JSON has it. */
export function otlpSpan(span: Span): object {
  return {
    traceId: span.traceId,
    spanId: span.spanId,
    ...(span.parentSpanId ? { parentSpanId: span.parentSpanId } : {}),
    name: span.name,
    kind: KINDS[span.kind ?? "internal"],
    startTimeUnixNano: nanos(span.start),
    endTimeUnixNano: nanos(span.end),
    attributes: attributesOf(span.attributes),
    status: span.error ? { code: 2, message: span.error.slice(0, 500) } : { code: 1 },
  };
}

interface Family {
  name: string;
  help: string;
  type: "counter" | "gauge" | "histogram";
  series: Map<
    string,
    {
      labels: Record<string, string>;
      value?: number;
      buckets: { le: number; count: number }[];
      sum?: number;
      count?: number;
    }
  >;
}

const SAMPLE = /^([A-Za-z_:][\w:]*)(?:\{(.*)\})?\s+(\S+)$/;
const LABEL = /([A-Za-z_]\w*)="((?:[^"\\]|\\.)*)"/g;
const unescapeLabel = (text: string) =>
  text.replace(/\\(.)/g, (_, char: string) => (char === "n" ? "\n" : char));

/**
 * Reads the Prometheus text the metrics endpoint writes back into series, so
 * what is sent by OTLP is the same series under the same names, whatever is
 * added to the endpoint later.
 */
export function readPrometheus(text: string): Family[] {
  const families = new Map<string, Family>();
  for (const line of text.split("\n")) {
    if (line.startsWith("# HELP ")) {
      const [, name, help] = /^# HELP (\S+) (.*)$/.exec(line) ?? [];
      if (name) families.set(name, { name, help: help ?? "", type: "gauge", series: new Map() });
      continue;
    }
    if (line.startsWith("# TYPE ")) {
      const [, name, type] = /^# TYPE (\S+) (\S+)$/.exec(line) ?? [];
      const family = name ? families.get(name) : undefined;
      if (family && (type === "counter" || type === "gauge" || type === "histogram")) {
        family.type = type;
      }
      continue;
    }
    const sample = SAMPLE.exec(line);
    if (!sample) continue;
    const [, written, labelText, number] = sample as unknown as [string, string, string, string];
    const value = Number(number);
    const labels: Record<string, string> = {};
    for (const found of (labelText ?? "").matchAll(LABEL)) {
      labels[found[1] as string] = unescapeLabel(found[2] as string);
    }
    // A histogram's samples are written under its name with an ending.
    const ending = /_(bucket|sum|count)$/.exec(written)?.[1];
    const base = ending ? written.slice(0, -ending.length - 1) : written;
    const histogram = ending && families.get(base)?.type === "histogram";
    const family = families.get(histogram ? base : written);
    if (!family) continue;
    const { le, ...rest } = labels;
    const own = histogram ? rest : labels;
    const key = JSON.stringify(Object.entries(own).sort());
    const series = family.series.get(key) ?? { labels: own, buckets: [] };
    family.series.set(key, series);
    if (!histogram) series.value = value;
    else if (ending === "sum") series.sum = value;
    else if (ending === "count") series.count = value;
    else if (le !== undefined && le !== "+Inf")
      series.buckets.push({ le: Number(le), count: value });
  }
  return [...families.values()];
}

/** Prometheus text as the metrics OTLP's JSON has, cumulative since `since`. */
export function otlpMetrics(text: string, since: Date, now: Date): object[] {
  const start = nanos(since);
  const time = nanos(now);
  return readPrometheus(text)
    .filter((family) => family.series.size > 0)
    .map((family) => {
      const points = [...family.series.values()];
      if (family.type === "histogram") {
        return {
          name: family.name,
          description: family.help,
          histogram: {
            aggregationTemporality: 2,
            dataPoints: points.map((series) => {
              const buckets = [...series.buckets].sort((a, b) => a.le - b.le);
              // Prometheus counts everything at or under a bound; OTLP counts each bucket's own.
              const counts = buckets.map(
                (bucket, index) => bucket.count - (buckets[index - 1]?.count ?? 0),
              );
              counts.push((series.count ?? 0) - (buckets.at(-1)?.count ?? 0));
              return {
                attributes: attributesOf(series.labels),
                startTimeUnixNano: start,
                timeUnixNano: time,
                count: String(series.count ?? 0),
                sum: series.sum ?? 0,
                bucketCounts: counts.map(String),
                explicitBounds: buckets.map((bucket) => bucket.le),
              };
            }),
          },
        };
      }
      const dataPoints = points.map((series) => ({
        attributes: attributesOf(series.labels),
        ...(family.type === "counter" ? { startTimeUnixNano: start } : {}),
        timeUnixNano: time,
        asDouble: series.value ?? 0,
      }));
      return {
        name: family.name,
        description: family.help,
        ...(family.type === "counter"
          ? { sum: { aggregationTemporality: 2, isMonotonic: true, dataPoints } }
          : { gauge: { dataPoints } }),
      };
    });
}

/** The most spans kept while the endpoint is not answering. Older ones are dropped. */
const MAX_HELD = 2000;
const BATCH = 200;
const FLUSH_MS = 2000;

type Log = { warn(details: object, message: string): void };

export class Telemetry {
  readonly #config: TelemetryConfig;
  readonly #version: string;
  readonly #log: Log | undefined;
  readonly #since = new Date();
  #held: Span[] = [];
  #timer: NodeJS.Timeout | undefined;
  #metricsTimer: NodeJS.Timeout | undefined;
  #sending: Promise<void> = Promise.resolve();
  #warned = 0;
  /** Spans dropped because the endpoint did not take them. */
  dropped = 0;

  constructor(config: TelemetryConfig, version: string, log?: Log) {
    this.#config = config;
    this.#version = version;
    this.#log = log;
  }

  /** Whether spans go anywhere. Work done only to make a span is skipped when not. */
  get tracing(): boolean {
    return this.#config.endpoint !== undefined && this.#config.traces;
  }

  get #resource() {
    return {
      attributes: attributesOf({
        "service.name": this.#config.serviceName,
        "service.version": this.#version,
      }),
    };
  }

  get #scope() {
    return { name: "platform", version: this.#version };
  }

  /** Keeps a finished span to send. It costs nothing when nothing is sent. */
  span(span: Span): void {
    if (!this.tracing) return;
    this.#held.push(span);
    if (this.#held.length > MAX_HELD) {
      this.dropped += this.#held.length - MAX_HELD;
      this.#held = this.#held.slice(-MAX_HELD);
    }
    if (this.#held.length >= BATCH) void this.flush();
    else if (!this.#timer) {
      this.#timer = setTimeout(() => void this.flush(), FLUSH_MS);
      this.#timer.unref();
    }
  }

  async #post(path: string, body: object): Promise<boolean> {
    try {
      const response = await fetch(`${this.#config.endpoint}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...this.#config.headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) return true;
      this.#warn({ path, status: response.status });
    } catch (error) {
      this.#warn({ path, problem: (error as Error).message });
    }
    return false;
  }

  /** Said once a minute at most: an endpoint that is down must not fill the log. */
  #warn(details: object) {
    if (Date.now() - this.#warned < 60_000) return;
    this.#warned = Date.now();
    this.#log?.warn(details, "telemetry could not be sent");
  }

  /** Sends what is held. Spans the endpoint does not take are dropped, never sent twice. */
  flush(): Promise<void> {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#sending = this.#sending.then(async () => {
      while (this.#held.length > 0) {
        const batch = this.#held.splice(0, BATCH);
        const sent = await this.#post("/v1/traces", {
          resourceSpans: [
            {
              resource: this.#resource,
              scopeSpans: [{ scope: this.#scope, spans: batch.map(otlpSpan) }],
            },
          ],
        });
        if (!sent) {
          this.dropped += batch.length;
          return;
        }
      }
    });
    return this.#sending;
  }

  /** Sends the metrics endpoint's series now. */
  async sendMetrics(text: string): Promise<boolean> {
    if (this.#config.endpoint === undefined || !this.#config.metrics) return false;
    const metrics = otlpMetrics(text, this.#since, new Date());
    if (metrics.length === 0) return true;
    return this.#post("/v1/metrics", {
      resourceMetrics: [
        { resource: this.#resource, scopeMetrics: [{ scope: this.#scope, metrics }] },
      ],
    });
  }

  /** Sends the metrics every so often, read from `text` each time. */
  startMetrics(text: () => Promise<string>): void {
    if (this.#config.endpoint === undefined || !this.#config.metrics || this.#metricsTimer) return;
    this.#metricsTimer = setInterval(() => {
      void text()
        .then((written) => this.sendMetrics(written))
        .catch((error) => this.#warn({ problem: (error as Error).message }));
    }, this.#config.metricsIntervalMs);
    this.#metricsTimer.unref();
  }

  async close(): Promise<void> {
    if (this.#metricsTimer) clearInterval(this.#metricsTimer);
    this.#metricsTimer = undefined;
    await this.flush();
  }
}

/** Reads `a=b,c=d`, as `OTEL_EXPORTER_OTLP_HEADERS` is written. */
export function readHeaders(text: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const pair of (text ?? "").split(",")) {
    const at = pair.indexOf("=");
    if (at < 1) continue;
    headers[pair.slice(0, at).trim().toLowerCase()] = decodeURIComponent(pair.slice(at + 1).trim());
  }
  return headers;
}

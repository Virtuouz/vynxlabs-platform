---
title: Send traces and metrics with OpenTelemetry
description: "Name an OTLP endpoint so the instance sends traces and metrics to a collector, and what is and is not traced."
subjects: [monitoring]
---

## Send traces and metrics with OpenTelemetry

By the end the instance sends traces and metrics by OTLP to a collector or a vendor you name. Volvel ships no collector, no Prometheus and no dashboards. With no endpoint named it sends nothing and keeps nothing to send.

## Before you start

- An endpoint that takes OTLP over HTTP as JSON (`http/json`), such as an OpenTelemetry Collector on port 4318. The instance does not speak gRPC or protobuf.
- If you scrape the Prometheus endpoint too, pick one for metrics, or a series is counted twice.

## Set it up

:::steps
1. In `.env`, set the endpoint, and the headers if your vendor needs a key:

   ```bash
   OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318
   OTEL_EXPORTER_OTLP_HEADERS=x-api-key=<key>
   ```

   `/v1/traces` and `/v1/metrics` are added to the endpoint. Headers are `name=value` pairs, comma separated, with a value percent-encoded (write a literal `%` as `%25`).
2. Optionally set `OTEL_SERVICE_NAME` (default `volvel`), `OTEL_METRIC_EXPORT_INTERVAL` (milliseconds, 60000 by default, 1000 or more), and `OTEL_TRACES_EXPORTER=none` or `OTEL_METRICS_EXPORTER=none` to send only the other. `OTEL_EXPORTER_OTLP_PROTOCOL` takes `http/json` only.
3. Restart. A setting that is wrong is listed with the others when the instance starts.
:::

## The result

**A trace** follows one piece of work: the HTTP request, the run or flow run it started, the run's wait for a worker, its execution, and each step of a flow, with the runs and flows a step starts hanging from that step. A request that carries a W3C `traceparent` header joins its caller's trace. A run started by a schedule, a webhook or an event begins a trace of its own. Spans are sent when the work ends. Probes, scrapes and the worker protocol's requests are not traced.

Every response carries its trace in `x-trace-id`. A run and a flow run say theirs as `traceId`, and on their pages in the console. The ID is kept whether or not anything is sent.

**Metrics** are the series of the Prometheus endpoint under the same names, cumulative since the replica started.

**A worker** sends one span for each attempt it executes, and only when its own environment has `OTEL_EXPORTER_OTLP_ENDPOINT`. A worker in another network that is given none sends nothing anywhere but the control plane. Workers the instance starts are not given the instance's settings, so a run's spans come from the control plane alone.

## If it does not work

- **Nothing arrives.** If the endpoint does not answer, spans are dropped, never held back for long or sent twice: at most 2,000 wait, in batches of 200, flushed every 2 seconds with a 10 second timeout. The log says so once a minute.
- **"OTEL_EXPORTER_OTLP_ENDPOINT must be an http or https address."** Give a full address.
- **"OTEL_EXPORTER_OTLP_PROTOCOL must be http/json: the only one the platform speaks."** Remove the setting or use `http/json`.

Related: [Monitor an instance](monitor-an-instance), [Settings](../../reference/settings).

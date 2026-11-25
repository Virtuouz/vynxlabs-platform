#!/usr/bin/env node
// Watches a Volvel instance during a load test: its metrics, its readiness and, over `fly ssh`,
// the machines under it. One JSON line per tick, and a summary when it is stopped.
// See OBSERVE.md or README.md ("Observing a run"). Plain Node, no dependencies.
import { execFile } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---------- Prometheus text ----------

/** Reads Prometheus text into `{ name, labels, value }` samples. Comment lines are skipped. */
export function parsePrometheus(text) {
  const samples = [];
  for (const raw of String(text).split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    let i = 0;
    while (i < line.length && line[i] !== "{" && line[i] !== " " && line[i] !== "\t") i++;
    const name = line.slice(0, i);
    const labels = {};
    if (line[i] === "{") {
      i++;
      while (i < line.length && line[i] !== "}") {
        let j = i;
        while (j < line.length && line[j] !== "=") j++;
        const key = line.slice(i, j).trim();
        j++; // =
        if (line[j] !== '"') break;
        j++;
        let value = "";
        while (j < line.length && line[j] !== '"') {
          if (line[j] === "\\" && j + 1 < line.length) {
            const next = line[j + 1];
            value += next === "n" ? "\n" : next;
            j += 2;
          } else value += line[j++];
        }
        j++; // closing quote
        labels[key] = value;
        while (line[j] === "," || line[j] === " ") j++;
        i = j;
      }
      i++; // }
    }
    const value = Number(line.slice(i).trim().split(/\s+/)[0]);
    if (name && !Number.isNaN(value)) samples.push({ name, labels, value });
  }
  return samples;
}

/**
 * The q-quantile of a histogram, from cumulative buckets `[{ le, count }]` (le may be Infinity),
 * interpolated linearly inside the bucket that holds it. Null when nothing was observed.
 * A quantile that falls in the +Inf bucket is reported as the highest finite bound.
 */
export function histogramQuantile(q, buckets) {
  const sorted = [...buckets].sort((a, b) => a.le - b.le);
  const total = sorted.length ? sorted[sorted.length - 1].count : 0;
  if (!(total > 0)) return null;
  const rank = q * total;
  let prevLe = 0;
  let prevCount = 0;
  for (const bucket of sorted) {
    if (bucket.count >= rank) {
      if (bucket.le === Infinity) return prevLe;
      const span = bucket.count - prevCount;
      if (span <= 0) return bucket.le;
      return prevLe + (bucket.le - prevLe) * ((rank - prevCount) / span);
    }
    prevLe = bucket.le === Infinity ? prevLe : bucket.le;
    prevCount = bucket.count;
  }
  return prevLe;
}

// ---------- Reading one scrape ----------

const GAUGES = [
  ["volvel_runs_queued", "runs_queued"],
  ["volvel_runs_running", "runs_running"],
  ["volvel_queue_oldest_seconds", "queue_oldest_s"],
  ["volvel_database_size_bytes", "db_size_bytes"],
  ["volvel_database_read_only", "db_read_only"],
  ["volvel_memory_available_bytes", "memory_available_bytes"],
  ["volvel_memory_total_bytes", "memory_total_bytes"],
];

const sum = (list) => list.reduce((a, s) => a + s.value, 0);

/** The gauges we keep, flat: `{ runs_queued, workers_managed, db_pool_main_waiting, ... }`. */
export function readGauges(samples) {
  const out = {};
  const by = (name) => samples.filter((s) => s.name === name);
  for (const [metric, key] of GAUGES) {
    const found = by(metric);
    if (found.length) out[key] = sum(found);
  }
  const workers = by("volvel_workers");
  for (const s of workers) out[`workers_${s.labels.kind}`] = s.value;
  if (workers.length) out.workers = sum(workers);
  for (const s of by("volvel_tasks_queued")) out[`tasks_queued_${s.labels.kind}`] = s.value;
  out.tasks_queued = sum(by("volvel_tasks_queued"));
  for (const s of by("volvel_machine_running"))
    out[`machine_running_${s.labels.machine}`] = s.value;
  out.machine_running = sum(by("volvel_machine_running"));
  for (const s of by("volvel_flow_runs")) out[`flow_runs_${s.labels.state}`] = s.value;
  out.flow_runs = sum(by("volvel_flow_runs"));
  const pool = by("volvel_db_pool");
  for (const s of pool) out[`db_pool_${s.labels.pool}_${s.labels.state}`] = s.value;
  for (const state of ["total", "idle", "waiting"]) {
    const found = pool.filter((s) => s.labels.state === state);
    if (found.length) out[`db_pool_${state}`] = sum(found);
  }
  return out;
}

const statusClass = (status) => `${String(status)[0] ?? "?"}xx`;

/** Cumulative counter values this scrape, by the dimension we report: `{ "runs_finished.failed": 3 }`. */
export function readCounters(samples) {
  const out = {};
  const add = (key, value) => {
    out[key] = (out[key] ?? 0) + value;
  };
  for (const s of samples) {
    if (s.name === "volvel_runs_finished_total") add(`runs_finished.${s.labels.state}`, s.value);
    else if (s.name === "volvel_http_requests_total")
      add(`http_requests.${statusClass(s.labels.status)}`, s.value);
    else if (s.name === "volvel_webhook_refusals_total") add("webhook_refusals", s.value);
    else if (s.name === "volvel_alerts_total") add("alerts", s.value);
  }
  return out;
}

/** Cumulative buckets of a histogram summed over every label set: `Map<le, count>`. */
/** Routes that wait on purpose: a worker's claim holds for 20 s, a stream stays open. They are not how long a request takes. */
const WAITS_ON_PURPOSE = /^\/api\/v1\/(worker\/|worker-host\/|tenants\/:t\/stream$|metrics$)/;

export function readBuckets(samples, metric) {
  const map = new Map();
  for (const s of samples) {
    if (s.name !== `${metric}_bucket`) continue;
    if (s.labels.route && WAITS_ON_PURPOSE.test(s.labels.route)) continue;
    const le = s.labels.le === "+Inf" ? Infinity : Number(s.labels.le);
    map.set(le, (map.get(le) ?? 0) + s.value);
  }
  return map;
}

/** What a counter or a bucket gained since the last scrape. A drop means the replica restarted: take what it has now. */
export function delta(now, before) {
  if (before === undefined) return null;
  return now >= before ? now - before : now;
}

function bucketQuantiles(now, before) {
  if (!before || now.size === 0) return { p50: null, p95: null, count: null };
  const buckets = [...now].map(([le, count]) => ({ le, count: delta(count, before.get(le) ?? 0) }));
  buckets.sort((a, b) => a.le - b.le);
  // A restart can leave buckets out of order; make them cumulative again.
  for (let i = 1; i < buckets.length; i++)
    buckets[i].count = Math.max(buckets[i].count, buckets[i - 1].count);
  const count = buckets.length ? buckets[buckets.length - 1].count : 0;
  return {
    p50: histogramQuantile(0.5, buckets),
    p95: histogramQuantile(0.95, buckets),
    count,
  };
}

// ---------- Machines over fly ssh ----------

// No single quotes inside: these go inside `sh -c '...'` on the machine.
const SYS_SCRIPT = [
  "echo LOAD $(cat /proc/loadavg)",
  "echo CPU $(grep -m1 ^cpu /proc/stat)",
  'grep -E "^(MemAvailable|MemFree|SwapTotal|SwapFree):" /proc/meminfo',
  'echo NODES $(grep -lE "^Name:[[:space:]]+node$" /proc/[0-9]*/status 2>/dev/null | wc -l)',
].join("; ");
const DISK_SCRIPT = "echo DISK $(df -k /data | tail -1)";

/** Memory, load and cpu counters from the machine script's output. */
export function parseSys(text) {
  const out = {};
  for (const line of String(text).split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === "LOAD") {
      out.load1 = Number(parts[1]);
      out.load5 = Number(parts[2]);
      out.load15 = Number(parts[3]);
    } else if (parts[0] === "CPU") {
      out.cpu = parts.slice(2).map(Number); // user nice system idle iowait irq softirq steal
    } else if (/^(MemAvailable|MemFree|SwapTotal|SwapFree):$/.test(parts[0])) {
      out[`${parts[0].slice(0, -1)}_kb`] = Number(parts[1]);
    } else if (parts[0] === "NODES") out.node_processes = Number(parts[1]);
    else if (parts[0] === "DISK") {
      // Filesystem 1K-blocks Used Available Use% Mounted
      out.disk_total_kb = Number(parts[2]);
      out.disk_used_kb = Number(parts[3]);
      out.disk_avail_kb = Number(parts[4]);
      out.disk_use_pct = Number.parseFloat(parts[5]);
    }
  }
  return out;
}

/** user/system/iowait/steal percentages between two `cpu` lines. */
export function cpuPercent(before, now) {
  if (!before || !now || before.length < 8 || now.length < 8) return null;
  const d = now.map((v, i) => v - before[i]);
  const total = d.slice(0, 8).reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  const pct = (n) => Math.round((n / total) * 1000) / 10;
  return {
    user_pct: pct(d[0] + d[1]),
    system_pct: pct(d[2] + d[5] + d[6]),
    iowait_pct: pct(d[4]),
    steal_pct: pct(d[7]),
    idle_pct: pct(d[3]),
  };
}

/** `state|count|longest age` lines from pg_stat_activity. */
export function parsePg(text) {
  const out = { by_state: {}, longest_active_s: 0, total: 0 };
  for (const line of String(text).split("\n")) {
    const [state, count, age] = line.trim().split("|");
    if (count === undefined || Number.isNaN(Number(count))) continue;
    const name = state === "" ? "none" : state;
    out.by_state[name] = Number(count);
    out.total += Number(count);
    if (name === "active") out.longest_active_s = Math.round(Number(age || 0) * 10) / 10;
  }
  return out;
}

const PG_SQL =
  "select state, count(*), max(extract(epoch from now() - query_start)) from pg_stat_activity where datname = current_database() group by state";

/** No single quotes in the SQL, so the bash -c quoting holds. The password is read on the machine. */
export function pgCommand(dbName) {
  return `bash -c 'PGPASSWORD=$OPERATOR_PASSWORD psql -h localhost -p 5433 -U postgres -d ${dbName} -Atc "${PG_SQL}"'`;
}

function ssh(flyBin, app, command, timeoutMs = 20_000) {
  return new Promise((resolveRun, reject) => {
    execFile(
      flyBin,
      ["ssh", "console", "-a", app, "-C", command],
      { timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 1 << 20 },
      (error, stdout, stderr) => {
        if (error)
          reject(
            new Error(error.killed ? "timed out" : String(stderr || error.message).split("\n")[0]),
          );
        else resolveRun(stdout);
      },
    );
  });
}

// ---------- Stats ----------

class Stat {
  n = 0;
  min = Number.POSITIVE_INFINITY;
  max = Number.NEGATIVE_INFINITY;
  total = 0;
  add(v) {
    if (typeof v !== "number" || Number.isNaN(v)) return;
    this.n++;
    this.total += v;
    if (v < this.min) this.min = v;
    if (v > this.max) this.max = v;
  }
  out() {
    return this.n
      ? {
          min: this.min,
          max: this.max,
          mean: Math.round((this.total / this.n) * 100) / 100,
          samples: this.n,
        }
      : null;
  }
}

const round = (v, digits = 3) =>
  v === null || v === undefined ? v : Math.round(v * 10 ** digits) / 10 ** digits;

// ---------- Main ----------

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const next = argv[i + 1];
    args[argv[i].slice(2)] = next === undefined || next.startsWith("--") ? "true" : argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const need = ["url", "metrics-token-file", "out"].filter((k) => !args[k]);
  if (need.length) {
    console.error(
      `Missing --${need.join(", --")}.\nUsage: node scripts/load/observe.mjs --url <base> --metrics-token-file <path> --out <dir> [--every 5] [--fly-app <app>] [--fly-db <db app>] [--fly-bin ~/.fly/bin/fly] [--db-name <name>] [--label <text>]`,
    );
    process.exit(2);
  }
  const base = args.url.replace(/\/+$/, "");
  const token = readFileSync(args["metrics-token-file"], "utf8").trim();
  const every = Math.max(1, Number(args.every ?? 5));
  const flyBin = (args["fly-bin"] ?? join(homedir(), ".fly/bin/fly")).replace(/^~/, homedir());
  const label = (args.label ?? "run").replace(/[^A-Za-z0-9._-]+/g, "-");
  const maxTicks = args.ticks ? Number(args.ticks) : Number.POSITIVE_INFINITY;
  const out = resolve(args.out);
  mkdirSync(out, { recursive: true });
  const started = new Date();
  const stem = join(out, `observe-${label}-${started.toISOString().replace(/:/g, "-")}`);
  const ndjson = `${stem}.ndjson`;
  writeFileSync(ndjson, "");

  const stats = new Map();
  const stat = (key, v) => {
    if (!stats.has(key)) stats.set(key, new Stat());
    stats.get(key).add(v);
  };
  const totals = {};
  const summary = {
    label,
    url: base,
    started: started.toISOString(),
    ticks: 0,
    scrape_failures: 0,
    scrape_failure_log: [],
    readyz_worst_ms: null,
    readyz_not_200: 0,
    readyz_not_200_log: [],
    lowest_free_memory_mb: null,
    highest_queue_age_s: null,
    highest_steal_pct: null,
  };
  const track = (key, fn) => {
    summary[key] = fn(summary[key]);
  };

  let prev = null; // the last scrape's counters and buckets
  const cpuPrev = {};
  const slow = { app: null, db: null, pg: null }; // in-flight promises
  let ready = []; // finished slow samples waiting for the next tick
  let stopping = false;
  let tickNo = 0;
  let inTick = false;
  let latestSteal = null;
  const errors = [];

  const slowSample = (kind, fn) => {
    if (slow[kind]) return; // the last one is still running
    slow[kind] = fn()
      .then((value) => ready.push([kind, value]))
      .catch((e) => ready.push([kind, { error: e.message }]))
      .finally(() => {
        slow[kind] = null;
      });
  };

  async function scrape(record) {
    const t0 = performance.now();
    try {
      const res = await fetch(`${base}/api/v1/metrics`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(Math.max(10_000, every * 1000)),
      });
      const text = await res.text();
      record.metrics_ms = Math.round(performance.now() - t0);
      if (res.status !== 200)
        throw Object.assign(new Error(`status ${res.status}`), { status: res.status });
      const samples = parsePrometheus(text);
      const gauges = readGauges(samples);
      const counters = readCounters(samples);
      const httpBuckets = readBuckets(samples, "volvel_http_request_duration_seconds");
      const waitBuckets = readBuckets(samples, "volvel_run_queue_wait_seconds");
      record.gauges = gauges;
      if (prev) {
        record.deltas = {};
        for (const [k, v] of Object.entries(counters))
          record.deltas[k] = delta(v, prev.counters[k] ?? 0);
        const http = bucketQuantiles(httpBuckets, prev.http);
        const wait = bucketQuantiles(waitBuckets, prev.wait);
        record.http = { p50_s: round(http.p50), p95_s: round(http.p95), count: http.count };
        record.queue_wait = { p50_s: round(wait.p50), p95_s: round(wait.p95), count: wait.count };
        for (const [k, v] of Object.entries(record.deltas)) totals[k] = (totals[k] ?? 0) + v;
        stat("http_p95_s", record.http.p95_s);
        stat("queue_wait_p95_s", record.queue_wait.p95_s);
      }
      prev = { counters, http: httpBuckets, wait: waitBuckets };
      for (const [k, v] of Object.entries(gauges)) stat(k, v);
      if (typeof gauges.memory_available_bytes === "number") {
        const mb = gauges.memory_available_bytes / 1048576;
        track("lowest_free_memory_mb", (v) => (v === null ? mb : Math.min(v, mb)));
      }
      if (typeof gauges.queue_oldest_s === "number")
        track("highest_queue_age_s", (v) =>
          v === null ? gauges.queue_oldest_s : Math.max(v, gauges.queue_oldest_s),
        );
    } catch (e) {
      record.metrics_ms ??= Math.round(performance.now() - t0);
      record.scrape_error = {
        status: e.status ?? null,
        error: e.status ? null : (e.cause?.code ?? e.message),
      };
      summary.scrape_failures++;
      summary.scrape_failure_log.push({ at: record.t, ...record.scrape_error });
    }
  }

  async function readyz(record) {
    const t0 = performance.now();
    try {
      const res = await fetch(`${base}/api/v1/readyz`, { signal: AbortSignal.timeout(10_000) });
      const body = await res.json().catch(() => ({}));
      const ms = Math.round(performance.now() - t0);
      record.readyz = {
        status: res.status,
        ms,
        db_latency_ms: body?.checks?.database?.latencyMs ?? null,
        read_only: body?.checks?.database?.readOnly ?? null,
      };
      if (res.status !== 200) {
        summary.readyz_not_200++;
        summary.readyz_not_200_log.push({ at: record.t, status: res.status });
      }
      track("readyz_worst_ms", (v) => (v === null ? ms : Math.max(v, ms)));
      stat("readyz_ms", ms);
      stat("readyz_db_latency_ms", record.readyz.db_latency_ms);
    } catch (e) {
      const ms = Math.round(performance.now() - t0);
      record.readyz = { status: null, ms, error: e.cause?.code ?? e.message };
      summary.readyz_not_200++;
      summary.readyz_not_200_log.push({ at: record.t, error: record.readyz.error });
      track("readyz_worst_ms", (v) => (v === null ? ms : Math.max(v, ms)));
    }
  }

  // Started, never awaited: a slow ssh must not hold the tick.
  function startSlow() {
    if (args["fly-app"]) {
      slowSample("app", async () =>
        parseSys(await ssh(flyBin, args["fly-app"], `sh -c '${SYS_SCRIPT}'`)),
      );
    }
    if (args["fly-db"]) {
      slowSample("db", async () =>
        parseSys(await ssh(flyBin, args["fly-db"], `sh -c '${SYS_SCRIPT}; ${DISK_SCRIPT}'`)),
      );
      if (args["db-name"])
        slowSample("pg", async () =>
          parsePg(await ssh(flyBin, args["fly-db"], pgCommand(args["db-name"]))),
        );
    }
  }

  function takeSlow(record) {
    const taken = ready;
    ready = [];
    for (const [kind, value] of taken) {
      if (value.error) {
        record[kind] = { error: value.error };
        errors.push(`${kind}: ${value.error}`);
        continue;
      }
      if (value.cpu) {
        const pct = cpuPercent(cpuPrev[kind], value.cpu);
        cpuPrev[kind] = value.cpu;
        value.cpu = undefined;
        if (pct) {
          Object.assign(value, pct);
          if (kind === "app") latestSteal = pct.steal_pct;
          track("highest_steal_pct", (v) =>
            v === null ? pct.steal_pct : Math.max(v, pct.steal_pct),
          );
        }
      }
      record[kind] = value;
      for (const [k, v] of Object.entries(value))
        if (typeof v === "number") stat(`${kind}.${k}`, v);
      if (kind === "pg")
        for (const [s, n] of Object.entries(value.by_state)) stat(`pg.state_${s}`, n);
    }
  }

  const f = (v, d = 0) => (typeof v === "number" ? v.toFixed(d) : "-");

  async function tick() {
    if (inTick) return; // the last tick has not finished: do not pile up
    inTick = true;
    const record = { t: new Date().toISOString(), tick: tickNo };
    if (tickNo % 3 === 0) startSlow();
    tickNo++;
    await Promise.all([scrape(record), readyz(record)]);
    takeSlow(record);
    summary.ticks++;
    appendFileSync(ndjson, `${JSON.stringify(record)}\n`);
    const g = record.gauges ?? {};
    const mem =
      g.memory_available_bytes !== undefined
        ? g.memory_available_bytes / 1048576
        : record.app?.MemAvailable_kb === undefined
          ? undefined
          : record.app.MemAvailable_kb / 1024;
    const p95 = record.http?.p95_s;
    console.log(
      [
        record.t.slice(11, 19),
        record.scrape_error
          ? `SCRAPE-FAILED(${record.scrape_error.status ?? record.scrape_error.error})`
          : "",
        `queued=${f(g.runs_queued)}`,
        `running=${f(g.runs_running)}`,
        `oldest=${f(g.queue_oldest_s)}s`,
        `workers=${f(g.workers)}`,
        `freeMB=${f(mem)}`,
        `poolWait=${f(g.db_pool_waiting)}`,
        `readyz=${record.readyz.status ?? "ERR"}/${record.readyz.ms}ms`,
        `httpP95=${typeof p95 === "number" ? `${f(p95 * 1000)}ms` : "-"}`,
        `steal=${latestSteal === null ? "-" : `${latestSteal}%`}`,
      ]
        .filter(Boolean)
        .join(" "),
    );
    inTick = false;
  }

  function writeSummary() {
    const gauges = {};
    for (const [k, s] of stats) gauges[k] = s.out();
    const doc = {
      ...summary,
      stopped: new Date().toISOString(),
      every_s: every,
      gauges,
      counter_totals: Object.fromEntries(Object.entries(totals).sort()),
      slow_sample_errors: [...new Set(errors)].slice(0, 20),
    };
    writeFileSync(`${stem}.summary.json`, `${JSON.stringify(doc, null, 2)}\n`);
    console.log(`summary: ${stem}.summary.json`);
  }

  let timer;
  const finish = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    for (let i = 0; i < 100 && inTick; i++) await new Promise((r) => setTimeout(r, 100));
    writeSummary();
    process.exit(0);
  };
  process.on("SIGINT", finish);
  process.on("SIGTERM", finish);

  console.log(`observing ${base} every ${every}s -> ${ndjson}`);
  timer = setInterval(async () => {
    if (stopping) return;
    await tick();
    if (tickNo >= maxTicks) finish();
  }, every * 1000);
  await tick();
  if (tickNo >= maxTicks) finish();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

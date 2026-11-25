// The load generator. See scripts/load/README.md.
//
//   node scripts/load/run.mjs <scenario> --url <base> --creds <file.json> --out <dir> [options]
//
// Closed loop by default: a number of virtual users, each sending one request after another.
// The number goes up a step at a time until a stage is over the p95 or the error limit.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/** The answers that are the product's own back-pressure, not failures. */
const REFUSED = new Set([503, 429, 422]);
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_OPEN_LOOP_INFLIGHT = 5000;

// ----- Pure helpers (tested in run.test.mjs) -----

/** The p-th percentile (0 to 100) of an ascending array, by the nearest-rank method. */
export function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

/** p50, p95, p99 and max of unsorted milliseconds, rounded to a tenth. */
export function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const round = (n) => Math.round(n * 10) / 10;
  return {
    p50: round(percentile(sorted, 50)),
    p95: round(percentile(sorted, 95)),
    p99: round(percentile(sorted, 99)),
    max: round(sorted.length ? sorted[sorted.length - 1] : 0),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** After one of these segments comes a name or a token that is not worth a row of its own. */
const IDENTIFIED_BY_PREVIOUS = new Set(["tenants", "workspaces", "hooks", "apps"]);

/** `METHOD /path` with the ids of one request replaced by `:id`, so requests group by route. */
export function labelRoute(method, path) {
  const bare = path.replace(/^https?:\/\/[^/]+/, "").split(/[?#]/)[0];
  const segments = bare.split("/");
  const out = segments.map((segment, index) => {
    if (segment === "") return segment;
    if (UUID.test(segment) || /^\d+$/.test(segment) || /^[0-9a-f]{12,}$/i.test(segment)) {
      return ":id";
    }
    const before = segments[index - 1];
    if (IDENTIFIED_BY_PREVIOUS.has(before)) return ":id";
    // `/apps/:tenant/:workspace/...`: the second name after `apps` is a workspace.
    if (segments[index - 2] === "apps" && segments[index - 3] === "") return ":id";
    return segment;
  });
  return `${method.toUpperCase()} ${out.join("/")}`;
}

/** Whether a result counts as a failure: no answer, or a 5xx that is not the designed 503. */
export function isError(status) {
  return status === 0 || (status >= 500 && status !== 503);
}

/** One stage's numbers from its collected results. */
export function summarizeStage({ users, seconds, results, extra = {} }) {
  const real = results.filter((r) => !r.synthetic);
  const statuses = {};
  const routes = {};
  let errors = 0;
  let refused = 0;
  let retryAfterMissing = 0;
  for (const r of results) {
    const route = (routes[r.route] ??= { ms: [], statuses: {} });
    route.ms.push(r.ms);
    route.statuses[r.status] = (route.statuses[r.status] ?? 0) + 1;
    if (r.synthetic) continue;
    statuses[r.status] = (statuses[r.status] ?? 0) + 1;
    if (isError(r.status)) errors++;
    if (REFUSED.has(r.status)) refused++;
    if ((r.status === 503 || r.status === 429) && r.retryAfter === false) retryAfterMissing++;
  }
  const n = real.length;
  return {
    users,
    seconds: Math.round(seconds * 10) / 10,
    requests: n,
    rps: Math.round((n / Math.max(seconds, 0.001)) * 10) / 10,
    errorShare: n ? errors / n : 0,
    refusedShare: n ? refused / n : 0,
    statuses,
    retryAfterMissing,
    overall: summarize(real.map((r) => r.ms)),
    routes: Object.fromEntries(
      Object.entries(routes).map(([route, one]) => [
        route,
        { n: one.ms.length, ...summarize(one.ms), statuses: one.statuses },
      ]),
    ),
    ...extra,
  };
}

/** Whether a stage is inside both limits. */
export function withinLimits(stage, { p95LimitMs, errorLimit }) {
  return stage.overall.p95 <= p95LimitMs && stage.errorShare <= errorLimit;
}

/** Why a stage is outside the limits, in words. */
export function breach(stage, { p95LimitMs, errorLimit }) {
  const why = [];
  if (stage.overall.p95 > p95LimitMs) why.push(`p95 ${stage.overall.p95} ms over ${p95LimitMs} ms`);
  if (stage.errorShare > errorLimit) {
    why.push(
      `errors ${(stage.errorShare * 100).toFixed(2)}% over ${(errorLimit * 100).toFixed(2)}%`,
    );
  }
  return `${why.join(" and ")} at ${stage.users} users`;
}

/**
 * The knee: the last stage that stayed inside both limits, counting from the first stage
 * and stopping at the first that did not. Null when even the first was outside.
 */
export function decideKnee(stages, limits) {
  let last = null;
  for (const stage of stages) {
    if (!withinLimits(stage, limits)) {
      return last ? { users: last.users, rps: last.rps, reason: breach(stage, limits) } : null;
    }
    last = stage;
  }
  return last
    ? { users: last.users, rps: last.rps, reason: "no stage went outside the limits" }
    : null;
}

// ----- The context a scenario sees -----

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    // A Streamable HTTP answer may come as one server-sent event.
    const data = text
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("");
    try {
      return data ? JSON.parse(data) : undefined;
    } catch {
      return undefined;
    }
  }
}

export function authHeaders(user, base) {
  const headers = {};
  if (user.apiKey) headers.authorization = `Bearer ${user.apiKey}`;
  else if (user.cookie) {
    headers.cookie = user.cookie;
    headers.origin = new URL(base).origin;
  }
  return headers;
}

/** Makes `ctx.call` and `ctx.open` for one base URL. */
export function makeClient(base) {
  const root = base.replace(/\/+$/, "");
  const target = (path) => (/^https?:\/\//.test(path) ? path : `${root}${path}`);

  /**
   * One timed request. Never throws: a network failure is status 0. An absolute `path` is
   * sent without credentials, unless `opts.auth` is true.
   */
  async function call(user, method, path, body, opts = {}) {
    const absolute = /^https?:\/\//.test(path);
    const headers = {
      accept: "application/json",
      ...(absolute && !opts.auth ? {} : authHeaders(user, root)),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...opts.headers,
    };
    const route = labelRoute(method, path);
    const started = performance.now();
    let status = 0;
    let retryAfter;
    let text = "";
    try {
      const response = await fetch(target(path), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(opts.timeoutMs ?? REQUEST_TIMEOUT_MS),
        redirect: "manual",
      });
      status = response.status;
      retryAfter = response.headers.has("retry-after");
      text = await response.text();
    } catch {
      status = 0;
    }
    const ms = performance.now() - started;
    let parsed;
    return {
      route,
      status,
      ms,
      retryAfter,
      text,
      get json() {
        parsed ??= { value: parseJson(text) };
        return parsed.value;
      },
    };
  }

  /**
   * Opens a stream and answers once the headers are in: `{ route, status, ms, close }`.
   * The body is left unread until `close()`.
   */
  async function open(user, path, opts = {}) {
    const route = labelRoute("GET", path);
    const controller = new AbortController();
    const started = performance.now();
    let status = 0;
    let retryAfter;
    let response;
    try {
      response = await fetch(target(path), {
        headers: { accept: "text/event-stream", ...authHeaders(user, root), ...opts.headers },
        signal: controller.signal,
      });
      status = response.status;
      retryAfter = response.headers.has("retry-after");
    } catch {
      status = 0;
    }
    const ms = performance.now() - started;
    if (response && status !== 200) await response.text().catch(() => "");
    return {
      route,
      status,
      ms,
      retryAfter,
      close: () => controller.abort(),
    };
  }
  return { call, open, url: root };
}

// ----- Arguments -----

const NUMBERS = {
  start: 5,
  step: 5,
  max: 50,
  "stage-seconds": 60,
  "p95-limit-ms": 1000,
  "error-limit": 0.01,
  fixed: undefined,
  seconds: undefined,
  rate: undefined,
};

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      const value = argv[++i];
      if (value === undefined) throw new Error(`--${name} needs a value.`);
      args[name] = name in NUMBERS ? Number(value) : value;
      if (name in NUMBERS && !Number.isFinite(args[name])) {
        throw new Error(`--${name} must be a number.`);
      }
    } else args._.push(arg);
  }
  for (const [name, fallback] of Object.entries(NUMBERS)) {
    if (args[name] === undefined) args[name] = fallback;
  }
  return args;
}

function loadScenario(name) {
  return import(pathToFileURL(join(HERE, "scenarios", `${name}.mjs`)).href);
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function pickWeighted(actions) {
  const total = actions.reduce((sum, a) => sum + a.weight, 0);
  let roll = Math.random() * total;
  for (const action of actions) {
    roll -= action.weight;
    if (roll <= 0) return action;
  }
  return actions[actions.length - 1];
}

// ----- The run -----

/**
 * Runs a scenario and returns the result object. `options` is what `parseArgs` gives, with
 * `scenario` (the module's export), `users` (the credentials) and `log`.
 */
export async function execute({ scenario, users, args, log = console.log, signal }) {
  const client = makeClient(args.url);
  const ctx = {
    ...client,
    users,
    args,
    state: {},
    log,
  };
  for (const user of users) user.state = {};
  const result = {
    scenario: scenario.name,
    url: client.url,
    startedAt: new Date().toISOString(),
    endedAt: null,
    args: Object.fromEntries(
      Object.entries(args).filter(([k]) => !["_", "creds", "file", "ramp"].includes(k)),
    ),
    stages: [],
    knee: null,
  };
  const limits = { p95LimitMs: args["p95-limit-ms"], errorLimit: args["error-limit"] };
  const save = () => {
    result.endedAt = new Date().toISOString();
    result.knee = args.ramp ? decideKnee(result.stages, limits) : null;
    if (args.file) writeFileSync(args.file, `${JSON.stringify(result, null, 2)}\n`);
  };

  if (scenario.setup) await scenario.setup(ctx);

  let collector;
  const newCollector = (label) => ({ label, results: [], inflight: 0 });

  const record = (c, out) => {
    if (out === undefined || out === null) return;
    for (const r of Array.isArray(out) ? out : [out]) {
      if (!r) continue;
      c.results.push({
        route: r.route,
        status: r.status,
        ms: r.ms,
        retryAfter: r.retryAfter,
        synthetic: r.synthetic === true,
      });
    }
  };

  /** One action, with its failure kept: a scenario that throws is a status 0, not a crash. */
  const perform = async (c, action, user) => {
    c.inflight++;
    try {
      record(c, await action.run(ctx, user));
    } catch (error) {
      record(c, { route: `ACTION ${action.name}`, status: 0, ms: 0 });
      c.lastError = String(error?.message ?? error);
    } finally {
      c.inflight--;
    }
  };

  let running = true;
  let vus = 0;
  let finishedVus = 0;
  const loops = [];
  const startVu = () => {
    const user = users[vus % users.length];
    vus++;
    loops.push(
      (async () => {
        if (scenario.once) {
          for (const action of scenario.actions) {
            if (!running) break;
            await perform(collector, action, user);
          }
          finishedVus++;
          return;
        }
        while (running) {
          await perform(collector, pickWeighted(scenario.actions), user);
          if (scenario.thinkMs) await sleep(scenario.thinkMs);
          // Every action refused at once should not spin a core.
          else await sleep(0);
        }
      })(),
    );
  };

  /** Waits for the stage's time, or for everyone to finish a `once` scenario. */
  const hold = async (seconds) => {
    const until = performance.now() + seconds * 1000;
    while (performance.now() < until && !signal.aborted) {
      if (scenario.once && finishedVus >= vus) break;
      await sleep(Math.min(200, Math.max(1, until - performance.now())));
    }
  };

  const drain = async (c) => {
    const until = performance.now() + REQUEST_TIMEOUT_MS + 2000;
    while (c.inflight > 0 && performance.now() < until) await sleep(50);
  };

  const finishStage = async (c, usersNow, started, extra) => {
    collector = newCollector();
    await drain(c);
    const seconds = (performance.now() - started) / 1000;
    const stage = summarizeStage({ users: usersNow, seconds, results: c.results, extra });
    result.stages.push(stage);
    log(progressLine(stage, c.lastError));
    save();
    return stage;
  };

  try {
    if (args.rate !== undefined) {
      // Open loop: R requests a second, however slowly they are answered.
      const seconds = args.seconds ?? args["stage-seconds"];
      collector = newCollector();
      const c = collector;
      const began = performance.now();
      let sent = 0;
      let dropped = 0;
      let next = 0;
      while (!signal.aborted && performance.now() - began < seconds * 1000) {
        const due = Math.floor(((performance.now() - began) / 1000) * args.rate);
        while (sent < due) {
          if (c.inflight >= MAX_OPEN_LOOP_INFLIGHT) dropped++;
          else {
            const user = users[next++ % users.length];
            void perform(c, pickWeighted(scenario.actions), user);
          }
          sent++;
        }
        await sleep(5);
      }
      await finishStage(c, users.length, began, { rateTarget: args.rate, dropped });
    } else if (args.fixed !== undefined) {
      const seconds = args.seconds ?? args["stage-seconds"];
      const slice = Math.min(args["stage-seconds"], seconds);
      collector = newCollector();
      for (let i = 0; i < args.fixed; i++) startVu();
      let left = seconds;
      while (left > 0 && !signal.aborted) {
        const c = collector;
        const began = performance.now();
        await hold(Math.min(slice, left));
        left -= slice;
        await finishStage(c, args.fixed, began);
        if (scenario.once && finishedVus >= vus) break;
      }
    } else {
      let target = args.start;
      collector = newCollector();
      while (!signal.aborted) {
        while (vus < target) startVu();
        const c = collector;
        const began = performance.now();
        await hold(args["stage-seconds"]);
        const stage = await finishStage(c, target, began);
        if (!withinLimits(stage, limits)) {
          log(`Stopping: ${breach(stage, limits)}.`);
          break;
        }
        if (target >= args.max) break;
        target = Math.min(args.max, target + args.step);
      }
    }
  } finally {
    running = false;
    await Promise.allSettled(loops);
    if (scenario.teardown) await scenario.teardown(ctx).catch(() => {});
    save();
  }
  return result;
}

export function progressLine(stage, lastError) {
  const statuses = Object.entries(stage.statuses)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([code, n]) => `${code}:${n}`)
    .join(" ");
  return (
    `users=${stage.users} rps=${stage.rps} p50=${stage.overall.p50} p95=${stage.overall.p95} ` +
    `p99=${stage.overall.p99} err=${(stage.errorShare * 100).toFixed(2)}% ` +
    `refused=${(stage.refusedShare * 100).toFixed(2)}% [${statuses}]` +
    (stage.retryAfterMissing ? ` retry-after-missing=${stage.retryAfterMissing}` : "") +
    (lastError ? ` last-error="${lastError}"` : "")
  );
}

function validateCreds(file) {
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(parsed.users) || parsed.users.length === 0) {
    throw new Error("The credentials file needs a non-empty `users` array.");
  }
  for (const user of parsed.users) {
    if (!user.apiKey && !user.cookie) {
      throw new Error(`User ${user.label ?? "?"} has neither apiKey nor cookie.`);
    }
    if (!user.tenant || !user.workspace) {
      throw new Error(`User ${user.label ?? "?"} needs tenant and workspace.`);
    }
    user.extra ??= {};
  }
  return parsed.users;
}

export async function main(argv) {
  const args = parseArgs(argv);
  const [name] = args._;
  if (!name || !args.url || !args.creds || !args.out) {
    console.error(
      "Usage: node scripts/load/run.mjs <scenario> --url <base> --creds <file.json> --out <dir>\n" +
        "  [--start N] [--step N] [--max N] [--stage-seconds N] [--p95-limit-ms N] [--error-limit F]\n" +
        "  [--fixed N --seconds S] [--rate R [--seconds S]]",
    );
    return 2;
  }
  const scenario = (await loadScenario(name)).default;
  const users = validateCreds(resolve(args.creds));
  args.ramp = args.rate === undefined && args.fixed === undefined;
  mkdirSync(resolve(args.out), { recursive: true });
  args.file = join(
    resolve(args.out),
    `${scenario.name}-${new Date().toISOString().replace(/:/g, "-")}.json`,
  );

  const controller = new AbortController();
  process.on("SIGINT", () => {
    if (controller.signal.aborted) process.exit(130);
    console.error("Interrupted: finishing the stage and saving what there is.");
    controller.abort();
  });
  const result = await execute({ scenario, users, args, signal: controller.signal });
  console.log(
    result.knee
      ? `Knee: ${result.knee.users} users, ${result.knee.rps} rps (${result.knee.reason}).`
      : "No knee decided.",
  );
  console.log(`Wrote ${args.file}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error?.stack ?? error);
      process.exit(1);
    },
  );
}

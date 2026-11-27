# Load tests

Tooling for the load test of phase 11 and its re-runs. It uses Node 24 and no packages. Run it
only against an instance made for it.

## Files

- `run.mjs` is the generator. It ramps virtual users, or holds a fixed number, or holds a rate,
  and writes one JSON file per run.
- `report.mjs` prints a result file as a markdown table.
- `run.test.mjs` tests the percentile, route labelling and knee decision against a local server.
- `scenarios/<name>.mjs` is one scenario each. `scenarios/_lib.mjs` holds the helpers they share.

## Credentials file

The generator never signs in (sign-in is limited to 20 a minute per address). It is given
sessions and keys:

```json
{
  "users": [
    {
      "label": "member-1",
      "tenant": "<slug or id>",
      "workspace": "<id>",
      "cookie": "<Cookie header value>",
      "apiKey": null,
      "extra": {}
    }
  ]
}
```

A user with `apiKey` sends `Authorization: Bearer <key>`. One with `cookie` sends it as `Cookie`
with an `Origin` equal to `--url`. `extra` is read by scenarios: `scripts` (`[{ path, input }]`)
and `pollSample` for `run-start`, `webhookUrl` and `webhookBurst` for `limits`, `streams` for
`streams` and `limits`. Virtual users take the listed users in turn.

## Options

```
node scripts/load/run.mjs <scenario> --url <base> --creds <file.json> --out <dir>
  [--start 5] [--step 5] [--max 50] [--stage-seconds 60]
  [--p95-limit-ms 1000] [--error-limit 0.01]
  [--fixed N --seconds S]        constant users for S seconds, in stages of --stage-seconds
  [--rate R [--seconds S]]       open loop, R requests a second over the users
```

The ramp holds each stage for `--stage-seconds`, then adds `--step` users up to `--max`. It stops
when a stage's p95 (all routes) or error share is over its limit. The knee is the last stage
inside both limits.

An error is status 0 (no answer) or a 5xx other than 503. A 503, 429 or 422 is counted as
refused, because those are the product's designed answers when busy; a 503 or 429 without a
`Retry-After` header is counted in `retryAfterMissing`. Other 4xx answers are only in `statuses`.

The result is `<out>/<scenario>-<time>.json`, rewritten after every stage, so Ctrl-C keeps what
was measured. Routes named `RUN ...` or `STREAM ...` are measurements a scenario made itself
(its "ms" is a duration or a count, as each scenario's file says) and are left out of the
totals.

## Report

```
node scripts/load/report.mjs <result.json> [more.json ...] [--routes]
```

`--routes` adds the five slowest routes by p95 at the knee (or the last stage).

## Adding a scenario

Make `scenarios/<name>.mjs` with a default export:

```js
export default {
  name: "mine",
  description: "What it measures.",
  thinkMs: 0,        // optional pause between actions
  once: false,       // optional: run each action once per user, then stop
  async setup(ctx) {}, // optional: find ids; keep them on user.state
  actions: [
    { name: "list", weight: 1, run: (ctx, user) => ctx.call(user, "GET", "/api/v1/healthz") },
  ],
  async teardown(ctx) {}, // optional
};
```

`ctx.call(user, method, path, body?, { headers, timeoutMs, auth })` times one request. It never
throws; a network failure is status 0. It returns `{ route, status, ms, retryAfter, text, json }`
with ids in `route` replaced by `:id`. A `run` returns one such result, or an array of them. A
result with `synthetic: true` is kept per route but not counted in the totals.
`ctx.open(user, path)` opens a stream and returns after the headers, with `close()`.
`scenarios/_lib.mjs` has the path helpers and `discoverOnce`.

## One example per scenario

```
node scripts/load/run.mjs baseline    --url $URL --creds creds.json --out out
node scripts/load/run.mjs console-read --url $URL --creds creds.json --out out --start 5 --step 5 --max 60
node scripts/load/run.mjs table-read  --url $URL --creds creds.json --out out --start 4 --step 4 --max 40
node scripts/load/run.mjs run-start   --url $URL --creds creds.json --out out --rate 20 --seconds 300
node scripts/load/run.mjs new-surfaces --url $URL --creds creds.json --out out --fixed 10 --seconds 600
node scripts/load/run.mjs streams     --url $URL --creds creds.json --out out --fixed 1 --seconds 10
node scripts/load/run.mjs limits      --url $URL --creds creds.json --out out --fixed 1 --seconds 10
```

`streams` and `limits` use users that are one principal each: streams of two cookies for the same
member count together against the limit of five.

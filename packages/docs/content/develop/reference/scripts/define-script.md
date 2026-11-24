---
title: Scripts in code
description: "defineScript: every option, its default and limit, what a script must be safe against, and which other definitions start one."
subjects: [scripts, sdk]
---

A script in a tenant's repository is made with `defineScript` from `@volvel/sdk` and exported from the file the repository's build reads. A deploy sends it to the workspace, where it is a resource of kind `script` managed in the repository. The console shows it and runs it; it changes it only through the repository. A script written in the console is a different thing, with a default export: see [The script editor](../../../console/reference/screens/build/script-editor).

```ts title="src/scripts.ts"
import { defineScript, z } from "@volvel/sdk";

export const unpaidTotal = defineScript({
  path: "invoices/unpaid-total",
  description: "Adds up what a clinic is owed.",
  input: z.object({ clinic: z.string() }),
  output: z.object({ count: z.number(), cents: z.number() }),
  tables: ["invoices"],
  timeoutSeconds: 60,
  retries: { limit: 2, delaySeconds: 20 },
  async run(input, ctx) {
    const unpaid = await ctx.table("invoices").find({
      filter: {
        and: [
          { column: "clinic", value: input.clinic },
          { column: "status", value: "unpaid" },
        ],
      },
      limit: 1000,
    });
    const cents = unpaid.reduce((sum, row) => sum + Number(row.total), 0);
    ctx.log.info("Added up", { clinic: input.clinic, count: unpaid.length });
    return { count: unpaid.length, cents };
  },
});
```

The build refuses a definition that is not exported.

## Options

| Option | Takes | Default and limits |
| --- | --- | --- |
| `path` | A string. Unique in the workspace, such as `orders/sync`. | Required. |
| `key` | The resource's identity. Say it only to keep the identity of a script moved to a new path: the path it had. | The path. |
| `title` | What people read in lists. | None. |
| `description` | Plain text. | None. At most 500 characters in the manifest. |
| `mcp` | `{ name }`: the name of the tool an agent sees. | `run_` and the path with `/` as `__`, so it changes when the path does. Choose one for anything an agent is set up to call: lowercase letters, digits and underscores, starting with a letter, at most 64. |
| `input` | A zod schema. | Required. Becomes the script's input JSON Schema. |
| `output` | A zod schema. | Required. |
| `run(input, ctx)` | The function. `input` is the parsed input; the return value must match `output`. | Required. |
| `connections` | Connections it reads, by path or by definition. | None. |
| `connectionGroups` | Connection groups it may pick a member of. | None. |
| `secrets` | Names of the workspace secrets it reads. | None. |
| `variables` | Variables it reads. | None. |
| `events` | Events it publishes, by path or definition. | None. |
| `tables` | Tables it reads or writes. | None. |
| `sources` | Data sources it reads or writes. | None. |
| `timeoutSeconds` | How long one attempt may run. | 300. 1 to 3600. |
| `memoryMb` | The most memory one attempt may use. | 512 when omitted. 64 to 4096. |
| `retries` | `{ limit, delaySeconds?, backoff? }`. | `limit` 0 to 10, default 0. `delaySeconds` 0 to 3600, default 30. `backoff` default true: the wait doubles with each try. |
| `concurrency` | A number, or `{ key, limit }`. | A number is 1 to 64 runs of the script at once. `key` is `input.` and one to five field names, such as `input.customerId`; `limit` is 1 to 64 for each value of the key. |
| `worker` | The worker pool. | The default pool. Lowercase letters, digits and hyphens, at most 40. |
| `onFailure` | `{ script?, notify? }`. | None. |
| `node` | `{ label, icon?, category?, takes? }`. | Makes the script a step in the flow editor. `label` 1 to 60 characters, `category` at most 40. `takes` is any of `connection`, `table`, `event`. |

The `key` of `concurrency` is checked against the input type, so a field that is not in the input is a type error. A run whose input has no value at the key shares one lane with the others that have none.

## What Volvel checks

- **Input and output.** The input is checked against `input` before `run`, and the return value against `output` after it. A mismatch fails the run with a `SchemaError`: "The script's input does not match its schema:" or "The script's output does not match its schema:", then the reasons. Defaults, coercion and transforms of the zod schema apply to what `run` receives.
- **What it declares.** A script that asks `ctx` for a connection, secret, variable, table, source or event it did not declare is refused. A deploy to production, and a promotion, refuse a script whose declared connections, secrets, variables without a default, or sources are not set up in the workspace; a deploy to a dev workspace warns. Connection groups need nothing set up.
- **A failure handler.** `onFailure.notify` must name an HTTP connection.

## At least once

A run is delivered at least once, even with `retries.limit` of 0. A retry runs the whole function again, and a worker lost mid-run counts as an attempt. Write `run` so that doing it twice is safe: pass `ctx.run.idempotencyKey`, which stays the same across attempts of one run, to the systems you call.

```ts title="src/scripts.ts" ts/2
const response = await erp.post("/import/orders", order, {
  headers: { "idempotency-key": `order-${order.id}` },
  allowFailure: true,
});
```

## When it fails for the last time

When the last attempt of a run fails, `onFailure.script` is started with `{ run: { id, script, attempt, error } }` as its input, and `onFailure.notify` is posted a summary. A script's own `onFailure` replaces the workspace's default alert as a whole: a script that names only `notify` does not also start the default's script. One alert is sent per script every 10 minutes; failures within the window are counted on it. A failure of the handler starts nothing. The handler reads the script as deployed now, not the version the failed run used.

## What starts a script

A script has no schedule or trigger option of its own. These resources name a script and start it. Each is a file, `<path>.schedule.yaml` and so on, or the `define*` call in TypeScript:

| Definition | Starts the script |
| --- | --- |
| `defineSchedule` | At times given by a cron line, with a time zone and an input. |
| `defineWebhook` | When a request arrives at its address. |
| `defineForm` | When a form is submitted. |
| `defineEventTrigger` | When an event is published. |
| A flow | As a step. |
| A person, a service account or an agent | By hand, through the console, the API or an offered tool. |

## What is not there

`defineScript` has no `schedule`, `cron` or `trigger` option. Its context has no `ctx.query`, `ctx.rows`, `ctx.sources`, `ctx.http`, `ctx.smtp`, `ctx.oauth2`, `ctx.state`, `ctx.idempotency` or `ctx.logging`. See [The script context](script-context) for what replaces each.

## Related

- [The script context](script-context)
- [Test scripts in code](../../how-to/scripts/test-scripts-in-code)
- [How scripts run](../../explanation/scripts/how-scripts-run)
- [The script kind](../kinds/script)
- [Script settings in the console](../../../console/reference/screens/build/script-settings)

---
title: Test scripts in code
description: Run a script from your repository against stand-ins in a test with @volvel/sdk/testing, or on your machine with volvel run.
subjects: [scripts, sdk]
---

## Test scripts in code

By the end a test in your repository will run a script with fake connections and tables, and check what it returned, logged and published.

## Before you start

- A repository with `@volvel/sdk` installed and a test runner of your choice. The example uses Vitest.
- A script made with `defineScript`: see [Scripts in code](../../reference/scripts/define-script).

## Write the test

:::steps
1. Import the script and the helpers. `@volvel/sdk/testing` is a separate entry point of the SDK, so nothing of it is in a deployed script.

   ```ts title="src/scripts.test.ts"
   import { expect, test } from "vitest";
   import { memoryTable, runScript } from "@volvel/sdk/testing";
   import { unpaidTotal } from "./scripts.js";
   ```

2. Give the script a stand-in for each thing it declared. A table can be an array of rows to start from, or `memoryTable(rows)` when you want to read the rows afterwards.

   ```ts title="src/scripts.test.ts"
   test("adds up what a clinic is owed", async () => {
     const invoices = memoryTable([
       { clinic: "Northside", status: "unpaid", total: 4200 },
       { clinic: "Northside", status: "unpaid", total: 800 },
     ]);
     const { output, logs } = await runScript(
       unpaidTotal,
       { clinic: "Northside" },
       { tables: { invoices } },
     );
     expect(output).toEqual({ count: 2, cents: 5000 });
     expect(logs).toEqual([
       { level: "info", message: "Added up", fields: { clinic: "Northside", count: 2 } },
     ]);
   });
   ```

3. Run the tests with your runner. The test passes when `output` and `logs` are what you wrote.
:::

`runScript(script, input, options?)` runs the script in the test's own process. Nothing leaves it. It returns `{ output, logs, events, tags, files }`: what the script returned, and what it logged, published, tagged and stored.

## What you can give it

All of the options are optional. Each is keyed by the path the script declared.

| Option | Stands in for |
| --- | --- |
| `connections` | `ctx.connection(path)`: the client the script gets, a fake object of your own. |
| `groups` | `ctx.connections(group)`: `{ groupPath: { memberKey: { client, label? } } }`. |
| `secrets`, `variables` | `ctx.secret(name)` and `ctx.variable(path)`: strings. |
| `tables` | `ctx.table(path)`: an array of rows, or an object that implements the table client, such as `memoryTable(rows)`. |
| `sources` | `ctx.source(path).table(name)`: `{ sourcePath: { tableName: rows or a client } }`. |
| `startedBy`, `trigger`, `attempt` | What `ctx.run` reports. By default the system, a trigger of type `test`, and attempt 1. |
| `signal` | The run's `AbortSignal`, to test a script that is canceled. |

`runScript` holds the script to what a deploy holds it to:

- Input and output are checked against the script's schemas. A mismatch throws "The script's input does not match its schema" (or "output").
- A connection, secret, variable, table, source or event the script did not declare is refused: `The script did not declare the secret "other". Add it to the script's definition.`
- One it declared and you did not give is said to be missing: `The table "invoices" has no stand-in in this test. Give one under tables.`

For a test of something other than a whole script, `testContext(options, declared?)` makes just the context, with `recorded` on it. `memoryTable` finds, gets, inserts, updates and deletes rows in memory, and its `aggregate` only counts: it gives one item with `count` and ignores the options. Its `find` ignores `filter` and `sort`, and returns rows by `offset` and `limit`.

## Run it on your machine

The command line has its own guides: [Run a script locally](../cli/run-a-script-locally) and [Run a script on the instance](../cli/run-a-script-on-the-instance). What matters to a test is what a local run cannot give a script. `volvel run <script path>` builds the repository and runs one script in your terminal, with no instance.

```bash
volvel run invoices/unpaid-total --input '{"clinic":"Northside"}'
```

It takes `--input <json>`, `--dir`, `--entry` and `--resources`. Connections, secrets and variables come from `.platform/local.json`, under `connections`, `groups`, `secrets` and `variables`. A variable falls back to the default its definition has.

A local run cannot give a script what lives in a workspace. Tables, data sources and files are refused: "Tables live in a workspace, so they are not available to a local run. Deploy to a dev workspace to try this script." Mail connections are refused. `ctx.events.publish` prints the event and delivers nothing, and `ctx.run.tag` prints the tags and keeps none. Use `@volvel/sdk/testing` for a script that reads a table.

To run a script on an instance without deploying it, `volvel run <script> --remote --tenant <slug> --workspace <slug>` uploads a build to a dev workspace.

## The result

The script is tested without a worker and without a workspace, so a test is fast and runs in a pipeline. It does not test how the instance runs the script: limits, retries and masking belong to the instance. See [How scripts run](../../explanation/scripts/how-scripts-run).

## If it does not work

- **`The script did not declare the … "…"`.** The script asks for something its definition does not name. Add it to `connections`, `secrets`, `variables`, `tables`, `sources` or `events`.
- **`… has no stand-in in this test.`** Give it under the option the message names.
- **`The script's input does not match its schema`.** The input you passed is not what `input` accepts. The reasons follow the message.
- **`There is no script "…". This repository has: …`.** From `volvel run`: the path is not one the repository defines.

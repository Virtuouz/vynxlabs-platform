---
title: Test a script without an instance
description: Run a script in a unit test with fakes for its connections, secrets, variables and tables, using @volvel/sdk/testing.
subjects: [cli, scripts]
---

## Test a script without an instance

By the end a test runs a script with the same checks a worker applies, against fakes you give it, and reads what the script returned, logged, published and tagged.

## Before you start

- The repository's dependencies are installed, so `@volvel/sdk` resolves. The testing tools are a subpath of it: `@volvel/sdk/testing`.
- A test runner. The SDK does not bring one. This page uses Node's own, which on Node 24 runs TypeScript files as they are.
- This is separate from `volvel run`. `volvel run` runs your script with your real connections and secrets from `.platform/local.json`, and has no tables. A test runs with fakes, offline.

## Write the test

:::steps
1. Make `test/hello.test.ts` next to `src/`. Import the script from `src/index.ts` and `runScript` from the testing subpath:

   ```ts title="test/hello.test.ts"
   import assert from "node:assert/strict";
   import { test } from "node:test";
   import { runScript } from "@volvel/sdk/testing";
   import { hello } from "../src/index.ts";

   test("hello opens with the workspace's greeting", async () => {
     const { output, logs } = await runScript(
       hello,
       { name: "Ada" },
       { variables: { greeting: "Good evening" } },
     );
     assert.deepEqual(output, { greeting: "Good evening, Ada" });
     assert.equal(logs[0]?.message, "Saying hello");
   });

   test("hello refuses input that is not a name", async () => {
     await assert.rejects(runScript(hello, { name: 7 }), /does not match its schema/);
   });

   test("a variable the test gives no value for is said to be missing", async () => {
     await assert.rejects(runScript(hello, {}), /no stand-in/);
   });
   ```

   `runScript(script, input, options)` checks the input against the script's `input` schema and the output against its `output` schema. It holds the script to what its definition declares: a connection, secret, variable, table, source or event the script did not list is refused, as `The script did not declare the secret "other". Add it to the script's definition.` One it listed and the test gave no fake for is `The variable "greeting" has no stand-in in this test. Give one under variables.`
2. Run it:

   ```bash
   node --test "test/**/*.test.ts"
   ```

   ```text
   ✔ hello opens with the workspace's greeting (3.6064ms)
   ✔ hello refuses input that is not a name (1.1158ms)
   ✔ a variable the test gives no value for is said to be missing (0.4228ms)
   ℹ tests 3
   ℹ pass 3
   ℹ fail 0
   ```

   The quotation marks stop the shell from expanding the pattern; Node does.
3. Give a script more to talk to. `options` takes, all optional:

   | Option | What it is |
   | --- | --- |
   | `connections` | A fake client for each connection, by the connection's path. |
   | `groups` | The members of each connection group: the group's path, then each member's key, with `client` and `label`. |
   | `secrets`, `variables` | Values, by name and by path. |
   | `tables` | A table by its path: either an object that stands in for it, or an array of rows to start from. |
   | `sources` | A data source's tables, by the source's path and then the table's name, as for `tables`. |
   | `startedBy`, `trigger`, `attempt`, `signal` | What `ctx.run` and `ctx.signal` say. The defaults are the system, a trigger of type `test`, attempt 1 and a signal that is not aborted. |

   `memoryTable(rows)` makes a table that holds its rows in memory. It is the fake for `tables`, and its `rows` list is what the script left in it, to assert on. `testContext(options, declared)` makes the context alone, for code that you call with a context of your own.
:::

## The result

`runScript` returns `{ output, logs, events, tags, files }`: what the script returned, each log line with its level and fields, each event it published, the tags it set and the files it stored. Nothing leaves the process.

## If it does not work

- **Node cannot find `@volvel/sdk`.** The repository's dependencies are not installed. Run `npm install` in it; see [Install the command line](install-the-cli) for the tarballs until there is a release.
- **`The script's input does not match its schema`.** The test's input is not what the script's `input` accepts.
- **A test of a script that calls a connector's real API.** The connection's fake is yours to write: an object with the methods the script calls. `runScript` does not call the network for you.
- **The test passes, and the deployed script fails.** A fake agrees with what you wrote, not with the instance. Try the script in a dev workspace with [Run a script on the instance](run-a-script-on-the-instance).

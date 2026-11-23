# Lane scr2: fixed

No migration. No change to `schemas/` or a worker route. Rows not done: SCR-08 (the missing Settings fields are tier 3; only the broken part, SCR-15's fields, is done), SCR-09 (lane flw2), SCR-16.

## SCR-05
- `packages/compose/src/index.ts` `describer`: a script's entry is `exports.__vx_wrap(default, module)`, which parses the `input` and `output` exports and throws the SDK's `SchemaError`, as `defineScript` does. Connectors and trigger sources export no schemas and are unchanged.
- "Total some numbers" starter (`apps/console/src/screens/starters.ts`) reads `given.amounts` and relies on the default.
- Test: `compose.test.ts` "a console script's input and output are parsed". Failed before (`NaN`).

## SCR-06 (and the 413 in mask.md "Found")
- `kernel/execution/diagnose.ts` rewritten as one ordered table: platform texts first (limit, memory, worker stopped, declared-use 403, not-found 404 by secret/variable/connection, worker's 413, output too large), then service answers by `answered NNN`. Addresses are removed before matching, so a URL with "timeout" is no timeout. "schema" alone no longer matches.
- Test: `operations.test.ts` "diagnosis reads the texts the platform itself writes". Failed before. Left out: structured fields from the run (matching is on the fixed texts).

## SCR-07
- `kernel/authoring.ts` `describeIn` uses `draft.key`. `packages/nodes` makes entries from a core node's path, which is also its key: nothing to change.
- Test: `authoring.test.ts` "after a rename, a script's schemas are still read from its code". Failed before.

## SCR-10 (D42)
- New `poolOfConnection` (`kernel/execution/tasks.ts`): the pool of a script that uses the connection. Used by the connection test (`routes/execution.ts`), the test alert (`routes/alerts.ts`) and a failure alert's delivery (`kernel/execution/alerts.ts`: the failed run's own pool, else that). Describe goes to the draft's `worker` pool.
- Tests: `environments.test.ts` "a test of a connection, and a test alert, go to the pool of the script that uses it"; `authoring.test.ts` "a schema is read in the pool of the script that has it". Both failed before.
- Siblings: flow failure alerts have no run, so they use the connection's pool; trigger-source runs pass their run row (pool included).

## SCR-12
- `OfferButton` takes `deployed`; editor and list pass their own state (`Authoring.tsx`, `Execution.tsx`). Flows page offers only for a manual flow, which is deployed by existence: looked at, unchanged.
- Test: `Authoring.test.tsx` "the list's inspector offers a script to an agent only when it is deployed (SCR-12)". Failed before.

## SCR-13
- `editor/nodeTypes.ts` (`declare module "node:*"`, `process`, `Buffer`), added as an extra lib in `editor/monaco.ts`, with `allowSyntheticDefaultImports`.
- Test: `editor/nodeTypes.test.ts` runs `tsc` with the editor's options. Not walked in a browser.

## SCR-14
- `config-vars.ts` EGRESS_ALLOW says it guards the control plane's own calls; scripts follow the worker host's firewall (as `docs/self-hosting.md` does).
- `packages/docs/generators/schema.mjs` prints `Minimum`, `Maximum`, `Default` in the field table. Test: `scripts/docs-limits.test.mjs`. `timeoutSeconds` has no default in the manifest, so none prints.
- Not done: the generated pages under `packages/docs/content` need `pnpm --filter @volvel/docs generate`, and the lines for `build/scripts.md` and `build/script-editor.md` below.

## SCR-15 (D43)
- New console script: delay 30 s, backoff on, timeout stays 60 s. Settings shows "Wait between tries (seconds)" and "Wait longer after each failed try". Test: `Authoring.test.tsx` (SCR-15). Failed before.

## SCR-19
- `packages/cli/src/local.ts`: `ctx.connections` says "Connection groups ... not available to a local run"; a non-http connection is named by its kind. Test: `packages/cli/src/local.test.ts`. Failed before.

## Found
- Console Settings still lacks memory, concurrency, pool, uses of tables/sources/events/groups, `onFailure` (MP-1, tier 3).
- The `Totals` starter test regex in `starters.test.ts` only checks the old shape.

## Lines for packages/docs/content and CHANGELOG
- `build/scripts.md`: the list's inspector has Open editor, Run and Offer; Offer shows only for a deployed script. In the editor, a script drafted for removal says so and has "Keep this script".
- `build/script-editor.md`: Settings holds timeout, tries, wait between tries and backoff; a new script waits 30 s and backs off; scripts' `input` and `output` exports are parsed.
- `operate`: failure advice reads the platform's own texts; Test and alerts run in the pool of the script that uses the connection.
- CHANGELOG: console scripts parse their `input`/`output`; wait between tries is editable.

## Screens to walk
- Scripts list (inspector on a drafted script and a deployed one), script editor Settings (new script, existing), run page diagnosis, at 1440/768/390, light/dark, keyboard, reload.
- Polish gate: states: Offer hidden for a draft; lifecycle: delay and backoff persist on save; keyboard: new fields are plain fields in tab order; copy: "Wait between tries (seconds)", "Wait longer after each failed try".

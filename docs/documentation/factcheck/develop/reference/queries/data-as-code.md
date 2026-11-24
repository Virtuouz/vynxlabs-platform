# Fact-check record: develop/reference/queries/data-as-code

Checked by: second agent, 2026-11-23.

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. `Q` = `apps/console/src/screens/Queries.tsx`, `Data` = `apps/console/src/screens/Data.tsx`, `DB` = `apps/console/src/screens/Dashboards.tsx`, `RI` = `apps/console/src/screens/ResourceIdentity.tsx`, `RD` = `apps/console/src/kit/RemoveDraftButton.tsx`, `rq` = `apps/control-plane/src/routes/queries.ts`, `rs` = `apps/control-plane/src/routes/sources.ts`, `rd` = `apps/control-plane/src/routes/dashboards.ts`, `qry` = `apps/control-plane/src/kernel/data/query/`, `src` = `apps/control-plane/src/kernel/data/sources.ts`. The second agent's column is left for the second agent; "writer, run" means the writer saw it on the throwaway instance, "writer, code" that it was read from the code only.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| defineQuery, defineDataSource, defineDashboard and their bodies | `packages/sdk/src/index.ts:660-700,1086-1118,1286-1330` | writer, run | holds (run: manifests printed) |
| Query file shape and the query kind | `packages/manifest/src/kinds.ts:1238-1291` | writer, code | holds |
| Data source kind: connector postgres only | kinds.ts:1588-1600 | writer, code | holds |
| Dashboard schemaVersion 3 | `packages/manifest/src/page.ts:628-632` | writer, code | holds |
| Files named <path>.<kind>.yaml in platform or volvel.yaml resources; a path defined twice is refused | `packages/cli/src/build.ts:225-285`; `packages/cli/src/schemas.ts:22-33` | writer, code | holds |
| Example dashboard YAML | `examples/higher-ed-devices/platform/reports/lending.dashboard.yaml` | writer, code | holds |
| ctx.source(path).table(name); TableClient methods; sources option | `packages/sdk/src/context.ts:61`; `packages/sdk/src/tables.ts:73-87`; sdk index.ts:192 | writer, code | holds |
| Dashboard limits and source forms | manifest page.ts:63-175,522; kinds | writer, code | holds |

## Second check (2026-11-23, second agent)

Labels, quoted messages and limits of the page were swept against the console and control-plane source (every bold label and quoted refusal found; messages built from parts checked at their template).

- The three SDK snippets (`defineQuery`, `defineDataSource`, `defineDashboard`) were typechecked against `packages/sdk` with tsc and passed. The lending YAML is an excerpt of `examples/higher-ed-devices/platform/reports/lending.dashboard.yaml`: the page now says it is shortened.

## Phase 34, A7 (YAML first), 2026-11-24

Commit `d619bfbd` plus the working tree. Written by the A7 writer; second agent checked 2026-11-24 (a7r). Run on the throwaway instance of lane a7 (http://localhost:8712, Fernhill seeded).

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Query, data source and dashboard YAML deploy as shown. | run: the page's three files, with the table and query the dashboard names, deployed to `walk3` | writer, 2026-11-24 | holds as run |
| Files are Files, `define*` are Code; a draft takes a Code resource over. | `apps/console/src/kit/ownership.ts`; `Queries.tsx:657` | writer, 2026-11-24 | holds as read |

### Second check (a7r), 2026-11-24, second agent

Lane a7r build (a7 merged), throwaway instance http://localhost:8722 (database a7r34, Fernhill seeded), lane CLI `packages/cli/dist/bin.js`. `pnpm docs:check` passes. The query, data source and dashboard files validate; the TypeScript query and dashboard build.

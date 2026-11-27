# Fact-check record: develop/explanation/cli/definitions-in-code

Lines are current at commit `d619bfbd` plus the working tree (branch p34-a7, with lane a5 merged), 2026-11-24. Paths are from the repository root. Written by the A7 writer. Checked by: second agent (pending).

Run: instance on lane a7's build, database a734, port 8712, Fernhill seeded by `examples/fernhill/setup/setup.mjs` and its tenant `fernhill`; workspaces made for the run (`walk1` to `walk6`, `try-it`, `apps-docs`, `cli-start-dev`, `cli-start-live`). The CLI is `packages/cli/dist/bin.js` of the lane. Repositories made for the run are in `examples/a7*` (untracked, deleted at the end).

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The same table builds from the file and the definition. | `volvel convert` output of the fixture (`examples/a7walk`), manifests compared by `packages/cli/src/convert.ts:1230-1245` | writer, 2026-11-24 | holds as run: convert converted the TypeScript table and the rebuilt manifests matched |
| A list of definitions that is not exported by name is refused: `stock/northside (table) is defined, but src/index.ts does not export it, so it would not be deployed`. | run: `volvel build` of `src/family.ts`; `export const [northside, riverside, hilltop] = stock;` builds | writer, 2026-11-24 | holds as run |
| Script, connector, trigger source, widget are code; a page is Markdown. | `packages/cli/src/convert.ts:567-573` | writer, 2026-11-24 | holds as read |
| The reasons a definition stays: computed `KINDS`, spread, loop-made. | run: `volvel convert --dry-run` on `examples/a7walk` | writer, 2026-11-24 | holds as run |
| **Managed in** words are Files and Code. | `apps/console/src/kit/ownership.ts:11` | writer, 2026-11-24 | holds as read |
| Table take-over: notice text, button **Take over in the console**, confirmation text, production has no button. | `apps/console/src/screens/Data.tsx:2768-2790,2905-2925`; `apps/console/src/kit/ownership.ts:30` | writer, 2026-11-24 | holds as read; API run: `PUT resources/notes` with `takeOver: true` made the table `ownership: ui`, without the flag it answered 409 `notes is code-managed` |
| Flow, query, dashboard: notice says saving a draft takes it over; app: taking it over, next publish. | `apps/console/src/screens/FlowEditor.tsx:2554`, `Queries.tsx:657`, `Dashboards.tsx:854`, `builder/AppBuilder.tsx:562`; `kit/ownership.ts` `takeOverNotice` | writer, 2026-11-24 | holds as read |
| A script in code cannot be taken over. | `apps/console/src/screens/Authoring.tsx:1022-1029` | writer, 2026-11-24 | holds as read |
| After a take-over a deploy that still defines the resource takes it back, and is refused only if the console changed it since. | `apps/control-plane/src/routes/workspaces.ts:806-815` (basis set at take-over); run: take-over then deploy gave `updated table notes` and `column author retired. Its values are kept.` | writer, 2026-11-24 | holds as run |
| `examples/higher-ed-devices` holds `KINDS` and `Kind` in `src/model.ts` used by tables, events, scripts. | `examples/higher-ed-devices/src/model.ts:17-18,162-166` | writer, 2026-11-24 | holds as read |

### Second check (a7r), 2026-11-24, second agent

Lane a7r build (a7 merged), throwaway instance http://localhost:8722 (database a7r34, Fernhill seeded), lane CLI `packages/cli/dist/bin.js`. `pnpm docs:check` passes. Built both snippets in a scratch repository: the table file validates (`schemas/files/table.v1.schema.json`) and builds the same table as the definition; the family example builds, and the exported-as-a-list refusal names the entry file as quoted. Browser take-over run (see how-tables-work). A deploy of the repository after a take-over with no console change takes the table back without a refusal; after a console change (a column added) it is refused with `console_changed`; both as the page says. CORRECTED the 'To keep it in the repository, run `volvel pull`' sentence (pull writes no file for a taken-over table; a deploy after the pull silently retired the console's column).

### Fix check (a9), 2026-11-24

Lane a9 build, throwaway instance http://localhost:8729 (database a934), lane CLI `packages/cli/dist/bin.js`. The page now describes the fixed behaviour, run as written: a table in code deployed, taken over in the console with a column added in the same save (`PUT resources/desk`, `takeOver: true`); `volvel deploy` without a pull refused (`desk: changed in the console since the repository last had it`); `volvel pull` wrote `platform/desk.table.yaml` with the column, and printed `desk (table) was taken over in the console, and is still defined in code, by the name desk. Remove it from the TypeScript: until you do, a deploy is refused as defined twice, in the code and in platform/.`; `volvel deploy` then failed at the build with `desk is defined in src/index.ts and again in platform/desk.table.yaml`; with the definition removed from the code the deploy passed and the table kept the column (read). CORRECTED the passages that said a pull brings nothing in for a table (product bug fixed by lane a9).

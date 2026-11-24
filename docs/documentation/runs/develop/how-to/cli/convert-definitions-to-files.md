# Run log: develop/how-to/cli/convert-definitions-to-files

- Instance: http://localhost:8712 (throwaway, lane a7's build, commit `d619bfbd` plus the working tree), Fernhill seeded, 2026-11-24. Signed in as Maya Brooks with API keys made for the run. Terminal only; no browser width applies.

## The steps as followed
- `examples/a7conv` (a table, a variable, a script using both by identifier) deployed to `walk3`; `volvel convert --dry-run`, `volvel convert`, `volvel build`, `volvel deploy --preview` (`0 created, 3 updated`), `volvel deploy` (version 2), `--preview` again (`3 unchanged`), `volvel convert` again (`Converted 0 definitions`). All as the page shows, except the first draft of the page said the preview was all unchanged: the owner change makes each `updated`.
- `--only table --dry-run`, `--keep-references --dry-run`: as the reference page says.

## Not run
A convert that is put back by a failing check (covered by `packages/cli/src/convert.test.ts`).

## Second check (a7r), 2026-11-24

A copy of `examples/higher-ed-devices` (`node_modules` linked): `volvel convert --dry-run` (8 to convert, 26 left with reasons, 12 references), `volvel convert`, a second `convert` (`Converted 0 definitions to files.`), `volvel build`, `--only table --dry-run`. A scratch repository with a `defineTable` and a script: `volvel convert` wrote `resources/visits.table.yaml`, `volvel.yaml` and rewrote two references. Take-over by the console in a browser: see the fact-check of how-tables-work.

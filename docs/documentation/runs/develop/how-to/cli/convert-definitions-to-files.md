# Run log: develop/how-to/cli/convert-definitions-to-files

- Instance: http://localhost:8712 (throwaway, lane a7's build, commit `d619bfbd` plus the working tree), Fernhill seeded, 2026-11-24. Signed in as Maya Brooks with API keys made for the run. Terminal only; no browser width applies.

## The steps as followed
- `examples/a7conv` (a table, a variable, a script using both by identifier) deployed to `walk3`; `volvel convert --dry-run`, `volvel convert`, `volvel build`, `volvel deploy --preview` (`0 created, 3 updated`), `volvel deploy` (version 2), `--preview` again (`3 unchanged`), `volvel convert` again (`Converted 0 definitions`). All as the page shows, except the first draft of the page said the preview was all unchanged: the owner change makes each `updated`.
- `--only table --dry-run`, `--keep-references --dry-run`: as the reference page says.

## Not run
A convert that is put back by a failing check (covered by `packages/cli/src/convert.test.ts`).

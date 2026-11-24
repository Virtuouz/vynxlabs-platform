# Run log: develop/how-to/cli/keep-in-step

- Instance: http://localhost:8712 (throwaway, lane a7's build, commit `d619bfbd` plus the working tree), Fernhill seeded, 2026-11-24. Signed in as Maya Brooks with API keys made for the run. Terminal only; no browser width applies.

## The steps as followed
- Repository `examples/a7walk`: converted by `volvel convert`, deployed to `walk2` (`Deployed version 1 ... 8 created`).
- Console change of the variable `greeting` through `PUT drafts/greeting` and `POST changes/deploy`, then `volvel deploy`: refused with the page's text, exit 1. `volvel pull`: kept the file edited here (exit 1), deploy still refused; `pull --force`: `updated`, deploy passed. A second console change: `volvel pull` updated the untouched file, deploy passed.
- `volvel deploy --force` after a console change: `Deployed version 4 ... updated variable greeting`, and the audit entry `deployment.forced` with `{"paths":[{"path":"greeting","change":"changed"}],...}`.

## The page got wrong
- First draft showed a pull that updated and kept the file at once. Corrected: two outputs, one for a file untouched here and one for a file changed here.

## Not run
Git sync (no remote); the console's **Roll back anyway** dialog (read from the code and a2's walk).

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

## Second check (a7r), 2026-11-24

Instance http://localhost:8722 (throwaway, lane a7r, Fernhill seeded). Repository from `volvel init`, workspace `cli-start-dev`. Console change (API draft and deploy), refused deploy, `--preview`, `pull` (kept file, exit 1), `pull --force`, deploy, `--force` and its audit entry: as the page shows. In a browser (Playwright, 1440 and 390 px dark), **Roll back to this version** with a console change asked "Roll back CLI start dev anyway?" and **Roll back anyway** rolled back and wrote `deployment.forced`. The page got wrong: a taken-over table is not brought in by `volvel pull` (see the fact-check of how-tables-work). Not run: Git sync.

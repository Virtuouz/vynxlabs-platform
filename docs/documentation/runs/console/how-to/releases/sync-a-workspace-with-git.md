# Run log: console/how-to/releases/sync-a-workspace-with-git.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch phase-31-write-the-docs). Playwright, headless, 1440 px, light theme. No other width or theme was run.
- Names made for this run start with `rel`: workspaces Rel dev (slug `rel-dev`, later renamed Rel dev two and back) and Rel prod (`rel-prod`, production, the target of Rel dev), a clone `rel-clone` (deleted again), variables `rel-greeting`, `rel-farewell`, `rel-region` and a connection `rel-courier`. Fernhill was not changed.

## Not run: no remote repository
A remote Git repository cannot be connected without the internet. The instance accepts an `http://127.0.0.1` address, but no git server was set up for this run. Every step on this page is written from the code (`GitSync.tsx`, `Git.tsx`, `kernel/git.ts`, `routes/git.ts`) and has not been seen working.

## What was run
- Dev workspace **Git sync** with no repository: "No repository is connected", "Connect the tenant's repository below, then choose a branch for this workspace." and the panel **Repository** with the link.
- Production workspace **Git sync** with no repository: "A production workspace changes by promotion, so it follows no branch. After each promotion, what it runs is committed to its release branch." and "No repository is connected" with **Connect the tenant's repository**.
- A connect with an address that does not exist: "The repository could not be reached: fetch failed".

## The page is not final until
A walk against a real or a local git server covers: follow a branch, push, pull, conflict, push with drafts, change and stop following, a failed release commit and its retry.

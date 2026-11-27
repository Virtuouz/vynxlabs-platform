# Fact-check record: console/explanation/releases/how-changes-move

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-24. Written by the page's writer. Checked by: second agent, 2026-11-23. Every quoted label, message and permission of the page was matched against the console and control-plane source at HEAD (`87000022`) by script and by hand, and what depends on the screen was run on the instance http://localhost:8091 (see `packages/docs/records/runs/...`). Other pages of the area hold the line-by-line records of every label: `console/reference/screens/operate/releases`, `console/reference/screens/operate/git-sync`, `administer/reference/screens/repository`, `administer/reference/screens/workspaces`, `console/reference/screens/configure/settings`. `Dep` = `apps/control-plane/src/kernel/execution/deploy.ts`, `Auth` = `apps/control-plane/src/kernel/authoring.ts`, `CPgit` = `apps/control-plane/src/kernel/git.ts`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| A deploy composes drafts with the workspace's bundle into the next version, atomically | `apps/control-plane/src/routes/authoring.ts:1117-1125` | writer | holds |
| A promotion gives the target the same bundle by digest, nothing rebuilt | `apps/control-plane/src/routes/execution.ts:985-990`, `Release.tsx:760-765` | writer, run | holds |
| Version numbers per workspace; "Running in" found by digest | `Release.tsx:612-660`, run (dev v1 tagged Running in Rel prod) | writer, run | holds |
| Data, secrets, variable values, bindings stay per workspace | `Dep:32-135` (bindings checked in the target), `clone.ts` (values are per workspace) | writer | holds |
| Dev deploy warns, promotion and production deploy refuse | `Dep:630-650` | writer | holds |
| A console resource no bundle carried is left alone by every deploy | `Dep:300-312` | writer | holds |
| Production direct writes refused unless promotion:write and console-made | `Auth:91-131` | writer | holds |
| Developer holds no promotion:write; request replaces earlier pending | `release.test.ts:161-195`, `promotion-requests.ts:236-245` | writer | holds |
| A rollback is a deploy; adds a row; runs finish on their version | `Exec:647-705`, run | writer, run | holds |
| Rename matched by key; rename_suspected; drafts do not stop for it | `Dep:340-372`, `Auth:695` | writer | holds |
| Push writes deployed state; pull deploys; permissions | `CProu/git.ts:300-330,535-590` | writer | holds |
| Release branch `<branch>/<slug>`; failure leaves promotion standing; commit again | `CPgit:1654-1658`, `Release.tsx:790-810` | writer | holds (not run) |
| Take over from code, deploy from the repository takes it back | `Release.tsx:420-430` | writer | holds |
| No webhooks and no scheduled sync; no workspace lock | `CPgit:71-79`, `Git:228`; absence | writer | holds (absence) |

## Second check (2026-11-23)

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Claims about Git: the release branch as a mirror, volvel.yaml wins over Folder | `git.ts:1641-1700` | second agent, 2026-11-23 | checked; the release branch reads volvel.yaml from its own branch |

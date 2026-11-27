# Fact-check record: administer/how-to/releases/connect-the-repository

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-24. Written by the page's writer. Checked by: second agent, 2026-11-23. Every quoted label, message and permission of the page was matched against the console and control-plane source at HEAD (`87000022`) by script and by hand, and what depends on the screen was run on the instance http://localhost:8091 (see `docs/documentation/runs/...`). Other pages of the area hold the line-by-line records of every label: `console/reference/screens/operate/releases`, `console/reference/screens/operate/git-sync`, `administer/reference/screens/repository`, `administer/reference/screens/workspaces`, `console/reference/screens/configure/settings`. `Dep` = `apps/control-plane/src/kernel/execution/deploy.ts`, `Auth` = `apps/control-plane/src/kernel/authoring.ts`, `CPgit` = `apps/control-plane/src/kernel/git.ts`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Every label, message and permission on this page is the one recorded for the screen it uses | the screen records named above | writer | holds, as recorded there |
| The steps were run on the throwaway instance | `docs/documentation/runs/administer/how-to/releases/connect-the-repository.md` | writer | see the run log for what was and was not run |

## Second check (2026-11-23)

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The page was walked against the same local git server: connect (success), each refusal, check, host change, disconnect | run log | second agent, 2026-11-23 | checked, run |

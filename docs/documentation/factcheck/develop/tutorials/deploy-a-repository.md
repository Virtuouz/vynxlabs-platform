# Fact-check record: develop/tutorials/deploy-a-repository

Code as of commit `5ebf1c80`, 2026-11-23. Written by the page's writer; run 2026-11-23 (run log). "Checked by" is left for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The commands `login`, `whoami`, `status`, `tenant plan`, `tenant release`, `deploy --preview`, `deploy --message`, `promote --preview`, `runs` exist | `packages/cli/src/commands.ts`; `volvel --help` | writer, run | holds |
| `status` exits 1 when not ready | `volvel --help` text | writer | holds (text) |
| The example does not make its tenant or workspaces | `examples/higher-ed-devices/setup/setup.mjs:65`; README | writer, run | holds |
| The outputs quoted for each command | run (run log 3-9, 13) | writer, run | holds |
| `setup.mjs` needs `VOLVEL_URL`, `VOLVEL_EMAIL`, `VOLVEL_PASSWORD`; students' password | `setup/setup.mjs:1-30,100` | writer, run | holds |
| The review flow asks the group `tech-desk` and a laptop waits | `examples/higher-ed-devices/src/flows.ts:12-52` | writer, run | holds |
| The Tech Desk is mailed a link `/approve/<token>` | run (mail capture) | writer, run | holds |
| `@volvel/*` is not on npm | `docs/documentation/inventory/tutorials-and-style.md` section 2; D62 | writer | holds |
| Account's API keys screen is `/account/api-keys` | `apps/console/src/App.tsx:200` | writer, run | holds |

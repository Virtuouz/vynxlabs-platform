# Fact-check: self-host/how-to/running/stop-triggers-and-clear-a-backlog.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `PUT /instance/triggers` `{paused}`; needs `instance:write`; `GET` needs `instance:read`. | openapi; run: pause 200 `paused:true`, resume 200 | writer, 2026-11-23 | holds |
| `TRIGGERS_PAUSED` cannot be undone from the console; notice text. | `packages/docs/content/self-host/reference/console/triggers.md` | writer, 2026-11-23 | holds as cited |
| Webhook 503; schedules fire once on resuming. | same page | writer, 2026-11-23 | holds as cited |
| `SCHEDULE_BACKLOG_LIMIT` 200, 0 is off. | `config.ts:352` | writer, 2026-11-23 | holds |
| `volvel runs cancel --tenant --workspace [--queued|--all] [--older-than]`. | `packages/cli/src/commands.ts:187` | writer, 2026-11-23 | holds; not run |
| **Cancel N queued** on Runs. | `apps/console/src/screens/Runs.tsx:875` | writer, 2026-11-23 | holds |

## Second check (2026-11-23)

Run: CLI `volvel instance triggers`, `pause --reason`, `resume`; with TRIGGERS_PAUSED=true the API keeps answering paused/byEnvironment true; `volvel runs cancel --queued` canceled 3 queued runs, `--older-than` 0, `--all` 0 and 0 flow runs. Console buttons exist (`InstanceTriggers.tsx`, `Runs.tsx:410`). A refused webhook was not run.

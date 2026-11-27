# Run log: develop/how-to/api/read-and-export-rows.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23.
- Signed in as Maya Brooks (tenant admin) for the sign-in call; every other call used an API key made for the run, `api-docs-run` (member key), sent with curl and node 22 from `/home/gplascencia/.local/share/volvel-walk/scratch-docs/api/` (`env.sh`, `page.mjs`, `sign.mjs`). Names made for the run start `api-docs` / `api-visits`: the table `api-visits` and the workspace `api-docs` (dev, triggers not paused) with the script `hooks/echo`, the trigger `hooks/orders`, the secret `HOOK_SECRET`, the service account `api-docs-agent`. The keys were revoked at the end of the work (step 8 of the run log of `call-the-api-with-a-key`).
- No browser. The console steps named on the page were not run; they are copied from the component (`apps/console/src/screens/Account.tsx`, `AgentAccess.tsx`).

## Steps as followed
- Made the table `api-visits` with `PUT …/resources/api-visits` (kind table, ownership ui, `create: true`), the way the console's **Create table** does; inserted 6 rows with `POST rows/api-visits` `{rows:[…]}`: 201, rows with `id`, `created_at`, `updated_at`.
- `GET rows/api-visits?limit=2&sort=pet`: Biscuit, Juno and a `nextCursor`.
- `not_contains` `o` on `pet`: Biscuit, Pickle. `and`(`in` dog/cat, `seen` `is_null`): Olive. `not_contains` on a number column: 400 "\"not_contains\" works on text columns, with text to look for". Unknown operator `like`, unknown column `nope`, `value` "abc" on a number: 400 with the messages on the page. `as=<Maya's id>`: 400 "`as` is not an end user of this tenant."
- `aggregate`: `group=species&measure=count,sum:weight_kg,avg:weight_kg&sort=-count` gave dog 3/74.7/24.900000000000002, cat 2/9.3/4.65, rabbit 1/1.5/1.5, `truncated` false. No group: `{by:{}, values:{count:6}}`. `group=seen:month`: `2026-03-01` 5 and `null` 1.
- `rows-export` with `species eq dog`, `sort=pet`: `text/csv`, `content-disposition: attachment; filename="api-visits.csv"`, header `id,created_at,updated_at,pet,species,weight_kg,seen`, 3 rows.
- A row `Temp` added, patched (`weight_kg` 3.5, 200), deleted by `row-deletions` with a fake id (`deleted` 1, `missing` ["not-a-row"]); `Temp2` deleted by `DELETE row/<id>` 204.

## The page got wrong (and was corrected)
- None found in this run.

## Second check (2026-11-23, second agent)

The instance was http://localhost:8091 (a tenant of my own, `api-check2`, with a workspace `agent-ws`; keys and tokens revoked at the end).

- Run now: `expand`, `has`, `in` over 200 values, `min`/`max`/`count:<column>`, a CSV over 100,000 rows.
- Not run: `asGroup`, a row policy that hides rows, an `aggregate` over 5 seconds.

The console key screen, the Agent tools tab and Members & access were walked at 1440 px, at 390 px and in dark (the key screen: create, one-time key, revoke; Agent tools: workspace choice, address, settings, Tools offered, Try): no overflow at 390 px, the settings block scrolls inside itself, dark has no contrast fault.

## Not run (before the second check)

`expand`, `asGroup`, a row policy that hides rows, a CSV over 100,000 rows, an `aggregate` over 5 seconds, `min`/`max`/`count:<column>`, `has`, `in` over 200 values.

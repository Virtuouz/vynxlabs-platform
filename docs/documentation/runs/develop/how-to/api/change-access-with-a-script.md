# Run log: develop/how-to/api/change-access-with-a-script.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23.
- Signed in as Maya Brooks (tenant admin) for the sign-in call; every other call used an API key made for the run, `api-docs-run` (member key), sent with curl and node 22 from `/home/gplascencia/.local/share/volvel-walk/scratch-docs/api/` (`env.sh`, `page.mjs`, `sign.mjs`). Names made for the run start `api-docs` / `api-visits`: the table `api-visits` and the workspace `api-docs` (dev, triggers not paused) with the script `hooks/echo`, the trigger `hooks/orders`, the secret `HOOK_SECRET`, the service account `api-docs-agent`. The keys were revoked at the end of the work (step 8 of the run log of `call-the-api-with-a-key`).
- No browser. The console steps named on the page were not run; they are copied from the component (`apps/console/src/screens/Account.tsx`, `AgentAccess.tsx`).

## Steps as followed
- `GET /tenants/<t>/access`: `folder` `tenant`, `approval` false, `mayChange` true, 8 resources (2 groups, 4 end-user groups, 2 service accounts), `files` such as `groups/billing.group.yaml`.
- Added the group `api-docs-readers` to the set: `POST access/plan` `possible: true`, `created: 1`, `unchanged: 8`, `waits: false`; `POST access/releases`: 201, number 9, `applied`.
- The same set without the group, with no `allowDelete`: 409 `delete_not_allowed`, `errors[0]` `group/api-docs-readers`. With `allowDelete: ["group/api-docs-readers"]`: plan `deleted: 1`; apply 201, number 10.
- `GET access/releases`: 10 `cli` `full`, 9 `cli` `full`, 8 `console` `partial` ("Made the service account api-docs-agent").
- `PUT access/approval {required: true}`: 409 `approval_needs_two` (the tenant has one holder of `access:write`). `POST access/plan` with the service account's key: 403 "This needs the access:read permission."

## The page got wrong (and was corrected)
- None found in this run.

## Not run
A change that waits (202), a decision, `own_release`, `release_stale`, rollback (read or apply), `volvel tenant plan`/`release`.

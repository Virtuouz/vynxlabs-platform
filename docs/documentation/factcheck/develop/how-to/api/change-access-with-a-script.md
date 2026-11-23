# Fact-check record: develop/how-to/api/change-access-with-a-script.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), under `apps/control-plane/src/` unless a path says otherwise. Written by the writer 2026-11-23; "Checked by" and "Result" are for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `GET /tenants/:t/access` answers `folder`, `approval`, `mayChange`, `resources`, `files`; needs `access:read`. | `routes/access-releases.ts:126-170`; run | second agent, 2026-11-23 | checked |
| `POST …/access/plan` answers `possible`, `refusal`, `summary`, `waits`; changes nothing; needs `access:read`. | `routes/access-releases.ts:228-300`; run | second agent, 2026-11-23 | checked |
| `POST …/access/releases` applies the whole set: 201 `{id, number, status, summary}`; 202 with `waiting` when approval is on; needs `access:write`. | `routes/access-releases.ts:305-355`; run (201) | second agent, 2026-11-23 | checked |
| `resources` up to 5,000; `message` up to 500; `allowDelete` up to 500 entries `<kind>/<key>`. | `routes/access-releases.ts:56-66,216-222` | second agent, 2026-11-23 | checked |
| Leaving out what the tenant has is refused 409 `delete_not_allowed` with that text, and `errors` name `group/<key>`. | `routes/access-releases.ts:62-66`; run | second agent, 2026-11-23 | checked |
| `GET …/access/releases` lists newest first, 200 at most; an applied change has scope `full`, `origin` `cli` for a member. | `routes/access-releases.ts:80-110,357-388`; run | second agent, 2026-11-23 | checked |
| YAML is the form of `files`; `volvel tenant pull` writes them. | `routes/access-releases.ts:168`; `fixed/t3-cli-docs.md` (inventory) | second agent, 2026-11-23 | checked |
| `PUT …/access/approval` `{required}`; turning on needs two holders of `access:write`: 409 `approval_needs_two`. | `routes/access-releases.ts:172-215`; run (409) | second agent, 2026-11-23 | checked |
| With approval on, an access change and each change to a group, service account or role waits. | `routes/access-releases.ts:176-182` | second agent, 2026-11-23 | checked |
| Decision route: `{decision: approve|decline|withdraw, comment}`; approving needs someone other than the asker (409 `own_release`); a service account's key may not approve or decline (403); withdrawing needs only being the asker. | `routes/access-releases.ts:390-448`; `kernel/tenant/releases.ts:1100-1114` | second agent, 2026-11-23 | checked |
| `release_stale` when the access changed since the request. | `kernel/tenant/releases.ts:1150-1162` | second agent, 2026-11-23 | checked |
| A role given to a member or to everyone applies at once; to a group, service account or end-user group at tenant or workspace scope it waits. | `routes/permissions.ts:431-520,1005-1050` | second agent, 2026-11-23 | checked |
| Rollback: `GET` shows, `POST` does, at `…/releases/<id>/rollback`; needs `access:write`. | `routes/access-releases.ts:450-523` | second agent, 2026-11-23 | checked |
| A service account created through the API is itself an access change (number 8, origin console). | run | second agent, 2026-11-23 | checked |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23.

- Run on the instance in a tenant of my own (`api-check2`, two members with `tenant_admin`): read, plan, apply (201), list, plan of a removal (`delete_not_allowed` 409, then `allowDelete`), approval on (`approval_needs_two` 409 with one writer, 200 with two), apply while on (202), `own_release` 409, approval by the second member, decline, withdraw (only by who asked; another gets 409 "Only whoever asked for an access change can withdraw it."), a decision on a change no longer waiting (409 `conflict`, "…withdrawn already."), a service account's key (403 on approve/decline, may withdraw its own), rollback GET and POST (applies at once when it changes nothing, waits when it changes something, needs a JSON body), `volvel tenant pull|plan|release|approve|releases|approval`.
- Corrected: a waiting change whose access moved is marked **superseded** when another change applies, and approving it answers 409 `conflict` "This access change was superseded already."; `release_stale` could not be reached through the API (every route that changes access goes through a change that supersedes first). Kept on the page as the code states it (`kernel/tenant/releases.ts:1150-1162`).
- Corrected: the 202 body (id, number, status, summary, detail) and the other shape from `POST bindings`/`service-accounts` (`release` object).
- Added: rollback body, rollback `origin`, the CLI commands.
- fault fixed (fa): one 202 shape `{waiting, release:{id,number,status,summary}, detail}` for releases, rollback, bindings and service accounts (`routes/access-releases.ts`), confirmed in the code; the sentence now describes the one shape.

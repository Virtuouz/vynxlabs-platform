# Fact-check record: develop/how-to/api/change-access-with-a-script.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), under `apps/control-plane/src/` unless a path says otherwise. Written by the writer 2026-11-23; "Checked by" and "Result" are for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `GET /tenants/:t/access` answers `folder`, `approval`, `mayChange`, `resources`, `files`; needs `access:read`. | `routes/access-releases.ts:126-170`; run | pending | pending |
| `POST …/access/plan` answers `possible`, `refusal`, `summary`, `waits`; changes nothing; needs `access:read`. | `routes/access-releases.ts:228-300`; run | pending | pending |
| `POST …/access/releases` applies the whole set: 201 `{id, number, status, summary}`; 202 with `waiting` when approval is on; needs `access:write`. | `routes/access-releases.ts:305-355`; run (201) | pending | pending |
| `resources` up to 5,000; `message` up to 500; `allowDelete` up to 500 entries `<kind>/<key>`. | `routes/access-releases.ts:56-66,216-222` | pending | pending |
| Leaving out what the tenant has is refused 409 `delete_not_allowed` with that text, and `errors` name `group/<key>`. | `routes/access-releases.ts:62-66`; run | pending | pending |
| `GET …/access/releases` lists newest first, 200 at most; an applied change has scope `full`, `origin` `cli` for a member. | `routes/access-releases.ts:80-110,357-388`; run | pending | pending |
| YAML is the form of `files`; `volvel tenant pull` writes them. | `routes/access-releases.ts:168`; `fixed/t3-cli-docs.md` (inventory) | pending | pending |
| `PUT …/access/approval` `{required}`; turning on needs two holders of `access:write`: 409 `approval_needs_two`. | `routes/access-releases.ts:172-215`; run (409) | pending | pending |
| With approval on, an access change and each change to a group, service account or role waits. | `routes/access-releases.ts:176-182` | pending | pending |
| Decision route: `{decision: approve|decline|withdraw, comment}`; approving needs someone other than the asker (409 `own_release`); a service account's key may not approve or decline (403); withdrawing needs only being the asker. | `routes/access-releases.ts:390-448`; `kernel/tenant/releases.ts:1100-1114` | pending | pending |
| `release_stale` when the access changed since the request. | `kernel/tenant/releases.ts:1150-1162` | pending | pending |
| A role given to a member or to everyone applies at once; to a group, service account or end-user group at tenant or workspace scope it waits. | `routes/permissions.ts:431-520,1005-1050` | pending | pending |
| Rollback: `GET` shows, `POST` does, at `…/releases/<id>/rollback`; needs `access:write`. | `routes/access-releases.ts:450-523` | pending | pending |
| A service account created through the API is itself an access change (number 8, origin console). | run | pending | pending |

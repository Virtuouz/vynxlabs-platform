---
title: Change a tenant's access with a script
description: Read a tenant's access as resources, plan a change, apply it, take part of it away on purpose, and see what happens when the tenant asks for a second person.
subjects: [api, access]
---

## Change a tenant's access with a script

By the end you will have read a tenant's access, added a group to it through the API, seen the change in the history, and taken the group away again.

## Before you start

- A key and the instance's address, as in [Call the API with an API key](call-the-api-with-a-key).
- `access:read` on the tenant to read and to plan. `access:write` to change. A tenant admin has both. A service account's key can read and apply once it holds these, but cannot approve or decline a change that waits.
- What an access change holds: member groups, groups of end users, service accounts, the tenant's own roles, and what each group or service account is given. Who is in a group is not part of it. Groups an identity provider made are left out. See the [access changes screen](../../../administer/reference/screens/access-changes).
- The access change you send is the whole set. What the tenant has and your set leaves out is removed only when you allow it by name.

## Read, plan and apply

:::steps
1. Read the tenant's access.

   ```bash
   curl -s -H "authorization: Bearer $VOLVEL_KEY" "$VOLVEL_URL/api/v1/tenants/$TENANT/access" > access.json
   ```

   The answer has `resources` (each `{kind, key, body}`), `approval` (whether a change waits for a second person), `mayChange`, and `files`. `files` are the same resources as the YAML files that `volvel tenant pull` writes, such as `groups/billing.group.yaml`. YAML is the only file form. The API takes the resources, not the files.
2. Add what you want to the `resources` and send the whole set to plan. This adds a group.

   ```bash
   node -e '
   const a = require("./access.json");
   const next = [...a.resources, { kind: "group", key: "api-docs-readers",
     body: { title: "API docs readers", description: "Made by a script." } }];
   require("fs").writeFileSync("set.json", JSON.stringify({ resources: next, message: "Add the readers group" }));'

   curl -s -X POST -H "authorization: Bearer $VOLVEL_KEY" -H 'content-type: application/json' \
     "$VOLVEL_URL/api/v1/tenants/$TENANT/access/plan" -d @set.json
   ```

   ```json
   {
     "possible": true,
     "refusal": null,
     "summary": { "created": 1, "updated": 0, "deleted": 0, "unchanged": 8,
       "changes": [{ "change": "created", "kind": "group", "key": "api-docs-readers", "label": "API docs readers" }],
       "warnings": [] },
     "waits": false
   }
   ```

   A plan changes nothing. It is made by carrying the change out and taking it all back, so it is what the change would do, including why it would be refused: `possible` is `false` and `refusal` gives the `code`, `detail` and `errors`.
3. Apply it with the same body.

   ```bash
   curl -s -X POST -H "authorization: Bearer $VOLVEL_KEY" -H 'content-type: application/json' \
     "$VOLVEL_URL/api/v1/tenants/$TENANT/access/releases" -d @set.json
   ```

   The answer is 201 with the change's `id`, its `number`, `"status": "applied"` and the summary.
4. List the changes, newest first: `GET /api/v1/tenants/$TENANT/access/releases`. The one you made has the `message` you sent, and `scope` `full`.
:::

The routes and codes in this guide keep the word "release" (`/access/releases`, `release_stale`, `own_release`): it is the same thing as an access change.

## Take something away

Send the set without the group, naming what may go.

```bash
node -e '
const a = require("./access.json");
require("fs").writeFileSync("remove.json", JSON.stringify({
  resources: a.resources.filter((r) => r.key !== "api-docs-readers"),
  allowDelete: ["group/api-docs-readers"] }));'
```

Without `allowDelete` the same body is refused:

```text
409 delete_not_allowed
"This access change would remove what the tenant has and the repository does not. If it was made in the console, pull it into the repository first. To remove it, ask again allowing each by name."
```

Each entry in `errors` says which one, as `group/api-docs-readers`. With `allowDelete` (up to 500 entries, each `<kind>/<key>`) the plan says `"deleted": 1` and the change applies.

## When the tenant asks for a second person

`PUT /api/v1/tenants/<t>/access/approval` with `{"required": true}` turns it on; it needs two people who hold `access:write`, and otherwise answers 409 `approval_needs_two`. With it on, an access change and every change to a group, a service account or a role waits.

- Applying answers **202** with `"waiting": true`, the `number` and a `detail`. Nothing has changed. A plan says `"waits": true`.
- Someone other than whoever asked decides it: `POST …/access/releases/<id>/decision` with `{"decision": "approve"}` or `"decline"`, and an optional `comment`. Approving your own change is refused with 409 `own_release`. A service account's key may not approve or decline: it is refused with 403.
- Whoever asked can withdraw it with `"withdraw"`, with no permission but being the one who asked.
- If the tenant's access changed after the request was made, approving it is refused with 409 `release_stale`: the change is no longer the one that was shown. Withdraw it and ask again.
- With approval on, a role given straight to a member, or to every end user, applies at once and the screen says so. A role given to a group, a service account or a group of end users, at the tenant or a workspace, waits.

The same history serves the console's **Access changes** tab. `GET …/access/releases/<id>/rollback` shows what going back to a change would do, and `POST` to the same address does it.

## The result

The group is in the tenant's access, in the console under its groups, and the history has a numbered change for adding it and one for taking it away.

## If it does not work

- **403 "This needs the access:read permission."** The key's owner may not read the tenant's access. A service account needs a role that holds it.
- **409 `delete_not_allowed`.** Your set leaves out something the tenant has. Add it back, or name it in `allowDelete`.
- **400 or `possible: false`, with `errors`.** A resource is not valid. `path` and `message` say which.
- **202 and nothing changed.** The tenant asks for a second person. Ask someone else who holds `access:write` to approve it.

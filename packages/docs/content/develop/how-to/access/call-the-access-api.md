---
title: Call the access API
description: "Change a tenant's access from your own script with the plan and release routes, as volvel tenant release does."
subjects: [access, api]
---

## Call the access API

You make a tenant's groups, roles, service accounts and bindings match a set you hold, without the CLI. It is what `volvel tenant plan` and `volvel tenant release` do.

### Before you start

- An API key of a member who holds `access:write` (plan needs `access:read`). A service account's key may make a change, and it cannot approve one.
- The tenant's ID. Set `VOLVEL_URL`, `VOLVEL_TENANT` and `VOLVEL_TOKEN`.

:::steps
1. Build the whole set as a list of `{ kind, key, body }`. The kinds are `group`, `end_user_group`, `service_account`, `tenant_role` and `tenant_binding`. Their bodies are in the [tenant files reference](../../reference/access/tenant-files).
2. `POST /api/v1/tenants/<id>/access/plan` with `{ resources }`. The answer has `possible`, the `summary` of changes, `waits` and, when it would be refused, `refusal`.
3. `POST /api/v1/tenants/<id>/access/releases` with `{ resources, message, allowDelete }`. It answers 201 with the number, or 202 when the change waits for a second person.
:::

```js title=release.mjs
const base = process.env.VOLVEL_URL;
const tenant = process.env.VOLVEL_TENANT;
const headers = {
  authorization: `Bearer ${process.env.VOLVEL_TOKEN}`,
  "content-type": "application/json",
};

const resources = [
  { kind: "group", key: "acc-support", body: { title: "Acc Support", description: "Support staff." } },
  { kind: "tenant_role", key: "acc_ticket_reader", body: { description: "Reads tables.", permissions: ["table:read", "data:read"] } },
  { kind: "tenant_binding", key: "support-reads", body: { role: "acc_ticket_reader", principal: { type: "group", key: "acc-support" } } },
];

const post = async (path, body) => {
  const response = await fetch(`${base}/api/v1/tenants/${tenant}/access/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

const plan = await post("plan", { resources });
if (!plan.body.possible) {
  console.error(plan.body.refusal.detail, plan.body.refusal.errors);
  process.exit(1);
}
const made = await post("releases", { resources, message: "From a script" });
console.log(made.status, made.body.number ?? made.body.detail);
```

### The result

The route answers 201 with the access change's `number`, `status` and `summary`. The change is on the **Access changes** tab marked **Through the API**. With approval on, it answers 202 with `waiting: true`, a `detail` and the change under `release` (`id`, `number`, `status`, `summary`), and someone else approves with `POST /access/releases/<id>/decision` and `{ "decision": "approve" }`.

### Things to know

- The set is the whole set. Anything the tenant has and the set lacks is refused with `delete_not_allowed` unless it is named in `allowDelete`, each as `<kind>/<key>` (500 names at most). A set holds 5,000 resources at most. A message is 500 characters at most.
- `GET /access/releases` lists the changes. `GET` and `POST /access/releases/<id>/rollback` read and make a going back. `PUT /access/approval` with `{ "required": true }` turns approval on.
- The routes are in the [API reference](../../reference/api/access).

### If it does not work

A refusal on plan names every file or resource at fault and the code: `delete_not_allowed`, `approval_needs_two`, `own_release` or `release_stale`.

## Related

- [Keep access in a repository](keep-access-in-a-repository).
- [Access changes](../../../administer/reference/screens/access-changes).

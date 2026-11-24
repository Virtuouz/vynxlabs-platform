---
title: Set up a workspace from a script
description: "Set a workspace's connections, secrets and variables through the API, so that a new or copied workspace is ready without the console."
subjects: [connections, secrets, variables]
---

## Set up a workspace from a script

By the end you will have a short Node script that sets a connection, a secret and a variable in one workspace, and that you can run again for another workspace.

The CLI has no command for this. The console does it by hand; the API does it from a script. Fernhill's own setup does the same with `examples/fernhill/setup/setup.mjs`.

## Before you start

- A tenant and a workspace, and code deployed to the workspace that declares what you set. This page uses the connection `stock-orders`, the secret `SUPPLIER_ACCOUNT` and the variable `stock/reorder-quantity` of [Call an API from a script](../../../start/how-to/configure/call-an-api). A connection can be set up before the code that declares it is deployed.
- An API key whose owner holds `connection:write`, `secret:write` and `variable:write` in the workspace. A Developer and a Workspace admin have all three. Make a key under **Account**, in **API keys**, or from a service account's page. See [Who can change what in Configure](../../../administer/reference/configure/who-can-change-what).
- Node 24 or later, for `fetch` and top-level `await`.
- The instance's address, and the credential and values to set. Fernhill's stand-in is at `http://127.0.0.1:4020`.
- Fernhill is set up: see [Set up the Fernhill example](../../../start/how-to/example/set-up-the-fernhill-example).

## Write the script

:::steps
1. Save this as `bind.mjs`. It reads the instance's address and the key from the environment, finds the tenant and the workspace by their slugs, and sets the three things. Each call is a `PUT`, so running the script again replaces what it set.

```js title=bind.mjs
const url = process.env.VOLVEL_URL; // for example https://volvel.example.com
const token = process.env.VOLVEL_TOKEN; // an API key
const [tenantSlug, workspaceSlug] = process.argv.slice(2);

async function call(method, path, body) {
  const response = await fetch(`${url}/api/v1${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

const tenant = (await call("GET", "/tenants")).items.find((one) => one.slug === tenantSlug);
if (!tenant) throw new Error(`There is no tenant ${tenantSlug}.`);
const workspace = (await call("GET", `/tenants/${tenant.id}/workspaces`)).items.find(
  (one) => one.slug === workspaceSlug,
);
if (!workspace) throw new Error(`There is no workspace ${workspaceSlug}.`);
const here = `/tenants/${tenant.id}/workspaces/${workspace.id}`;

await call("PUT", `${here}/connection-bindings/stock-orders`, {
  config: { baseUrl: "http://127.0.0.1:4020", auth: { type: "bearer" } },
  credential: process.env.SUPPLIER_TOKEN,
});
await call("PUT", `${here}/secrets/SUPPLIER_ACCOUNT`, { value: process.env.SUPPLIER_ACCOUNT });
await call("PUT", `${here}/variable-values/stock/reorder-quantity`, { value: "12" });
console.log(`Set up stock-orders, SUPPLIER_ACCOUNT and stock/reorder-quantity in ${workspaceSlug}.`);
```

2. Run it with the key and the values in the environment. Keep the key and the credential out of the file and out of your shell history where you can.

```bash
VOLVEL_URL=http://localhost:8091 VOLVEL_TOKEN=<your api key> \
SUPPLIER_TOKEN=vs_demo_51be22 SUPPLIER_ACCOUNT=FERNHILL-CFG \
node bind.mjs fernhill try-it
```

The script prints:

```text
Set up stock-orders, SUPPLIER_ACCOUNT and stock/reorder-quantity in try-it.
```

3. Open **Configure**, then **Connections** in that workspace. `stock-orders` shows **Set up here**, with the address under **Points to**. Press **Test** to try it. **Secrets** lists `SUPPLIER_ACCOUNT` and **Variables** shows `12` under **Value here**.
:::

## What each call takes

| Call | Body | Needs |
| --- | --- | --- |
| `PUT …/connection-bindings/<path>` | `config`, checked against the connector's settings, and `credential`, 1 to 65,536 characters. Leave `credential` out to keep the stored one; send `null` to remove it. Answers 204. | `connection:write` |
| `PUT …/secrets/<NAME>` | `value`, 1 to 65,536 characters. Makes the secret or replaces its value. Answers 204. `POST …/secrets` makes one and refuses a name that is taken. | `secret:write` |
| `PUT …/variable-values/<path>` | `value`, a string of up to 65,536 characters. An empty string is a value. Answers 204. | `variable:write` |
| `DELETE` on the same addresses | Removes what was set. For a variable, the default applies again. | the same |

If the connection's address moves to another origin and the call has no `credential`, the stored credential is dropped. Send it again with the address.

For a group member the call is `PUT …/connection-group-members/<key>/<group>` with `label`, `config` and `credential`. It takes effect at once, without a deploy.

## The result

The workspace has what its code needs, set the same way each time. Run the script for a production workspace with its own address and credential: the values are never carried from dev. A promotion to production is refused until each connection and secret it needs is set there, and the refusal lists them.

## If it does not work

- **`401` "The Authorization header must be: Bearer <api key>."** The key is missing or mistyped. The script's message begins `GET /tenants: 401`.
- **`403` "This needs the secret:write permission."** (or `connection:write` or `variable:write`). The key's owner lacks the permission in this workspace. Ask someone who can give a role.
- **`400` "The connection's configuration is not valid."** The `config` does not fit the connector. The answer lists each field. The fields are in [Connectors](../../reference/connectors).
- **"There is no tenant X." or "There is no workspace X."** The slug is wrong, or the key's owner cannot see it.
- **The connection shows Failed after Test.** The script set what you gave it. See [Set up a connection](../../../console/how-to/configure/set-up-a-connection).

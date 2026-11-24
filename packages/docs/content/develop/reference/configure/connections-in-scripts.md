---
title: Connections, secrets and variables in code
description: "How code declares connections, connection groups and variables, how a script says what it reads, and what it gets back."
subjects: [connections, variables, secrets]
---

Code names what a script needs from the outside and reads it at run time. The address, the credential and the value are not in the code. They are set in each workspace: in the console under [Configure](../../../console/reference/screens/configure/connections), or through the API (see [Set up a workspace from a script](../../how-to/configure/set-up-from-a-script)). A dev workspace and a production workspace hold their own.

## Declare

A connection, a connection group, a variable and a connector are resources. Each is a YAML file in the console's folder of the repository: `<path>.connection.yaml`, `<path>.connection_group.yaml`, `<path>.variable.yaml` and `<path>.connector.yaml` (with the connector's code in a `.ts` file beside it). A file has `schemaVersion: 1` and a `body`:

```yaml title=platform/stock-orders.connection.yaml
schemaVersion: 1
body:
  connector: http
  description: "VetSupply Direct: prices and orders for stock."
```

```yaml title=platform/clinics.connection_group.yaml
schemaVersion: 1
body:
  connector: http
  description: One supplier account for each clinic.
```

```yaml title=loans/days.variable.yaml
schemaVersion: 1
body:
  description: How many days a loan lasts unless the desk says otherwise.
  default: "14"
```

`connector` is `http`, `smtp` or `oauth2` for a connection, and `http`, `smtp` or your own for a group. A file says it. With `defineConnection` it is `http` when left out. A group cannot hold an `oauth2` connector: "… /body/connector is oauth2, which a group cannot use yet. Declare a connection for each account." `connector` may also be the path of a connector of your own.

A secret is not declared. There is no file for one and no `defineSecret`. A script names a secret in `secrets`, and its value is set in the workspace.

### In TypeScript

The same resources can be written with the SDK, and are then owned as Code. Do it when a value is shared with other definitions: see [Definitions in code](../../explanation/cli/definitions-in-code).

| Function | Declares | Options |
| --- | --- | --- |
| `defineConnection(options)` | A connection: a name and a kind. | `path` (required), `connector`, `description` |
| `defineConnectionGroup(options)` | A group of connections of one kind. Members are added per workspace. | `path` (required), `connector`, `description` |
| `defineVariable(options)` | A variable with an optional default. | `path` (required), `description`, `default` (a string) |
| `defineConnector(options)` | A connector of your own. See [Connectors](../connectors). | `path`, `configSchema`, `create`, `test`, `description` |

The fields of each kind are in the generated reference: [connection](../kinds/connection), [connection group](../kinds/connection-group), [variable](../kinds/variable) and [connector](../kinds/connector).

## Say what a script reads

A script and a trigger source list what they read. A run that reads something it did not list is refused: "This needs a declared use of the connection "X"." (or "the secret", "the variable", "the connection group").

| Option of a script | Takes |
| --- | --- |
| `connections` | Connections, by path or by definition. |
| `connectionGroups` | Connection groups, by path or by definition. |
| `secrets` | Secret names, as text. |
| `variables` | Variables, by path or by definition. |

A trigger source (made with `defineTriggerSource`, in webhook or poll mode) has `connections`, `secrets` and `variables`. In a YAML file these are under `uses`: `connections`, `connectionGroups`, `secrets`, `variables`, and for a script also `events`, `tables` and `sources`.

A flow does not read a connection, a secret or a variable. A flow step that runs a script gives it what the step lists under `with`: `connections`, `tables` and `events`. A secret or a variable is not handed over; the script lists and reads it itself.

A script's `onFailure` is `{ script, notify }`. `notify` is the path of an HTTP connection that is posted a summary when the script fails for the last time. A bundle that names a connection of another kind is refused: "… onFailure.notify names "X", which is a smtp connection. A failure is posted to an HTTP connection."

## Read

| Call | Gives |
| --- | --- |
| `ctx.connection(path)` | A client for the connection. For `http` and `oauth2`, an `HttpClient`; for `smtp`, an `SmtpClient`. |
| `ctx.connections(group).get(key)` | A client for the member with that key. It fails if the group has no such member. |
| `ctx.connections(group).keys()` | The members the group has in this workspace, as `{ key, label }`. |
| `ctx.secret(name)` | The secret's value, as text. It fails if the secret is not set in the workspace. |
| `ctx.variable(path)` | The value set in the workspace, else the declared default, as text. It fails if there is neither. |

An empty value that was set is returned as an empty text, not replaced by the default.

```ts
const api = await ctx.connection("stock-orders");
const account = await ctx.secret("SUPPLIER_ACCOUNT");
const quantity = Number(await ctx.variable("stock/reorder-quantity"));
const placed = await api.post("/vetsupply/orders", { account, sku: input.sku, quantity });
```

```ts
// One supplier account for each clinic: the group is declared with defineConnectionGroup.
const clinic = await ctx.connections("clinics").get(input.clinic);
```

### The HTTP client

`HttpClient` has `request(path, options)`, `get(path, options)` and `post(path, json, options)`. It gives `{ status, ok, headers, text, json() }`. Options are `method`, `headers`, `query`, `json`, `body` and `allowFailure`.

- A path goes under the connection's `baseUrl`. A request to another origin throws: "A connection can only call its own base URL, not X." An empty path, `post("")`, means the `baseUrl` exactly as given, which is what a chat webhook needs.
- A 4xx or 5xx answer throws an `HttpError`, "GET https://… answered 404.", with the query, the fragment and any credentials left out of the address. `allowFailure: true` returns the answer instead.
- Up to 5 redirects are followed, each only if it stays at the connection's origin. A redirect to another origin throws, saying the request was not sent there. A 301 or 302 answer to a POST, and a 303, is asked again as a GET.
- The connection's own headers replace a caller's header of the same name, ignoring case. The credential is sent as the connection's `auth` says: `bearer`, `header` with a `name`, or `basic` with a `username`. With no `auth`, none is sent.

### The mail client

`SmtpClient` has `send({ to, cc, bcc, replyTo, subject, text, html })`, which gives `{ messageId }` once the server has taken the message. Give `text`, `html` or both. `to`, `cc` and `bcc` take one address or a list. It runs on a worker. A local run says "Mail connections live in a workspace…".

## Run on your machine

`volvel run <script>` runs one script in your terminal, with no instance. It reads `.platform/local.json`:

```json title=.platform/local.json
{
  "connections": {
    "stock-orders": { "config": { "baseUrl": "http://127.0.0.1:4020", "auth": { "type": "bearer" } }, "credential": "vs_demo_51be22" }
  },
  "groups": {
    "clinics": { "northside": { "label": "Northside", "config": { "baseUrl": "http://127.0.0.1:4020" } } }
  },
  "secrets": { "SUPPLIER_ACCOUNT": "FERNHILL-CFG" },
  "variables": { "stock/reorder-quantity": "12" }
}
```

A variable with a default in the code needs no entry. A connection, secret or group member with none fails: "The connection "X" has no local value. Add it to …". `http` and `oauth2` connections and your own connectors run locally. `smtp` does not. To run this build in a dev workspace, with that workspace's own settings, use `volvel run <script> --remote --tenant <slug> --workspace <slug>`. It is a test run of what is on your machine: nothing is deployed, and the deployed version does not run.

## What is not there

- The CLI has no command to set a connection, a secret or a variable in a workspace. Use the console or the API.
- A flow step cannot be handed a secret or a variable, and a flow cannot read one.
- A secret cannot be read back through the API, by anyone.

## Related

- [Connections](../../../console/reference/screens/configure/connections), [Variables](../../../console/reference/screens/configure/variables) and [Secrets](../../../console/reference/screens/configure/secrets) for the screens that set them.
- [Call an API from a script](../../../start/how-to/configure/call-an-api) for the whole path, from code to a run.
- [Connectors](../connectors) for the fields of each built-in kind.

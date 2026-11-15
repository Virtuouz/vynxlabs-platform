# Phase 10: platform expansion

Status: in progress. Milestones 1 to 3 are built, on branch `phase-10-expansion`.
Last updated: 2026-11-15

Phase 10 builds the P2 items of the [evolution roadmap](../evolution/07-roadmap.md): all thirteen, in seven milestones. Phase 9 made what exists dependable. This phase widens what a tenant can do with it:
- results read as tables and text, not only JSON;
- apps and agents follow and start automation directly;
- connections are set up and tested in one place, and OAuth providers are reachable;
- flows are tested in their editor;
- the CLI round-trips with the console;
- promotion, drift and permissions are visible to those who need them;
- approvals are decided from mail.

**Exit criterion:** on a fresh instance, at 1440 px and on a phone-sized screen, a member can:
- read a script's rows as a table on its run page;
- offer a script to an agent, try it as the agent, and connect an agent that sees that script alone;
- set up an OAuth connection, test it on a worker, and see its health;
- run a draft flow from its editor and see each step's result on the graph;
- pull console drafts with the CLI, change them, deploy, and see no difference;
- ask for a promotion they may not make, and see it decided;
- see what differs between dev and production, and why a member holds a permission;
- approve a flow's step from a link in a mail.

An app shows a run's progress without polling, two runs with the same concurrency key never overlap, and the master key can be rotated without losing a secret.

## Owner decisions

| Area | Decision |
| --- | --- |
| Shape | One branch, `phase-10-expansion`, in seven milestones, one commit each |
| Scope | All thirteen P2 items |
| OAuth token calls | The control plane exchanges codes and refreshes tokens, through the egress guard. "OAuth connection token endpoints" join decision 0001's named list |
| Offer to an agent | A built-in `agent_runner` role (`run:write`, `flow_run:write`), bound at the one script or flow. A binding to a script or flow reaches the workspace's MCP server for those tools only |
| Master key rotation | A second key, `MASTER_KEY_SECONDARY`, that the instance opens with and never seals with. Named for what it is rather than "previous": with several replicas it holds the next key first, then the old one |

## Milestones

| # | Milestone | Roadmap items |
| --- | --- | --- |
| 1 | Result renderers, `useRun` in apps, Offer to an agent and Try a tool | P2-8, P2-5, P2-12 |
| 2 | Concurrency key, master key rotation | P2-7, P2-13 |
| 3 | Connection wizard with Test, OAuth2 connections | P2-2, P2-9 |
| 4 | Flow editor: test panel, expression preview, undo and redo | P2-1 |
| 5 | CLI: `pull`, `run --remote`, `logs -f` | P2-4 |
| 6 | Request promotion, drift view, effective permissions | P2-3, P2-10, P2-11 |
| 7 | Approval mail, approve from a link | P2-6 |

Each milestone ends with `pnpm typecheck`, `pnpm lint` and `pnpm test` passing, `pnpm e2e` for those that change the console, and a walk in a browser at 1440 and 390 px.

## Findings

### Milestone 1

- **Output is shown by its shape, chosen from the value, not declared.** A list of records is a table, `{ markdown }` is text, and a lone address, or `{ url | file | image, name? }`, is a link or an image. Anything else, and a list mixing records with other values, is JSON. A declared output schema orders a table's columns. The table draws 500 rows and 12 columns, and says how many more the JSON holds.
- **Markdown is drawn by a renderer of our own,** with React elements and never `innerHTML`: headings, paragraphs, lists, quotes, rules, fenced code, inline code, bold, italics and links. A link goes only to http, https or mailto; any other is left as its text. A dependency would have brought HTML passthrough to turn off.
- **An image from another site is loaded only when asked for.** Loading it tells that site who is looking at the run, and when. An image carried in the value (`data:`) is shown at once.
- **Only output is drawn by shape.** Input and errors stay JSON: input is what was sent, read to check it, and an error is short.
- **The stream decides who receives an event by who started the run, and never sends it.** The announcement from the database names the starter (`by`); the control plane matches it to a subscriber that may read only its own runs, and strips it before anything is written. A member with `run:read` is sent the same events as before.
- **Who follows only their own runs** is anyone the stream would otherwise refuse with 403: an end user, a member signed in to one tenant's apps, a member with no run rights. Someone with no standing in the tenant is still told it is not there. They get the runs and flow runs they started, those runs' log pings and those flow runs' steps; a script run a flow started is the flow's, started by `flow`, and is not sent.
- **An app opens one stream per page, shared, and keeps it five seconds after the last run it followed,** for the next run a page starts at once. A stream that is refused (too many, or no stream on that address) is not tried again on that page, and everything polls as before.
- **`runScript` and `runFlow` still look at the run,** every five seconds with the stream open, in case an event was missed, and as before without it. A connection or reconnection is itself a reason to look.
- **Offer to an agent is on a deployed script's page and panel, and on the flow's page,** and not on a draft: a binding names a deployed resource, and a draft has none. The walk found the scripts list opens a script's page, not its panel, so the page has the button too.
- **Reaching the MCP server by a binding to one script or flow** is a new rule beside `workspace:read`. It counts bindings to the member or the account itself, or a group of the member, never to anyone, and not for a suspended member or a sign-in to apps. Such an agent reads the runs it started with `get_run` and nothing else of the workspace: the runs list and the resources answer it 403.
- **Try calls the tool as the account, and records the member.** The route writes a `service_account.tool_tried` entry first, and what the tool does is audited with the member as the actor, `asServiceAccount` naming the account and `via: "console"`, so it is not counted among what agents did. The run is started by the account.
- **A table's columns are not in the order the script wrote them.** Output is kept as `jsonb`, which stores keys shortest first, so `invoice, client, amount` came back as `link, notes, amount, …`. Without a declared schema the table now puts plain values first and addresses and nested values after them; with one, its order wins. Found on the walk.
- **Short values stay on one line and addresses are cut short** in a table, with the full address in its title: on the walk `INV-1000` broke at its hyphen and links wrapped mid-number. On a phone the table scrolls sideways inside its own box, and the page does not.
- **Walked in Chromium on a built instance, at 1440 and 390 px:** a run's 40 rows showed as a table with the JSON a click away; a `{ markdown }` result showed its heading, list and link, with a `<script>` tag in it shown as text; an SVG chart carried in the output was drawn; `agent/find-client` was offered to a service account from its page, which showed the MCP address; the account's tools were that script, `get_run` and `get_flow_run`; and Try called it as the account and showed what the agent would be told. The flow's page offers it too. No page scrolled sideways, and no page threw. `pnpm e2e` passes (16), against an instance of its own.

### Milestone 2

- **A concurrency key is a lane in the queue the script already had.** pg-boss limits jobs per group across all workers; a script's group was its resource, and is now its resource and the key's value. A script names either a limit for itself or one per key, not both: a job has one group.
- **A run with no value for its key is not refused.** It shares one lane, the empty key, with the others that have none, at the same limit. Refusing it would have made the key a second input schema.
- **A key naming a field the input schema does not list is refused at deploy,** unless the schema lists no fields or says it takes more. zod's input schemas leave `additionalProperties` out, so the check reads an absent one as "these fields", where JSON Schema would read it as "anything": the check is for misspellings, which otherwise put every run in the empty lane silently.
- **A long value is kept as its hash,** past 200 characters, so a lane is a name and not a payload. The run page shortens it.
- **"Waiting for 1 run with the same key" is said only when a worker is there.** A run with no worker to take it says that instead, as before: it is the reason that needs doing something about.
- **Only five kinds of value are sealed with the master key:** tenant keys, database locations' addresses, the instance's identity providers' secrets, sign-ins in progress, and the new instance secrets. Everything of a tenant's is under its tenant key. A rotation on the walk instance rewrapped three values.
- **The data role's password no longer comes from the master key.** It was made from it on every start, so a rotation would have changed it, and a replica not yet restarted would have been refused by every database it had not yet connected to. It comes from a secret kept in `instance_secret`, which starts as the master key the instance had, so upgrading changes nothing. The cost: a rotation does not change that password. Someone holding an old key and the database's address could still sign in as the data role, which reads rows under row-level security. Changing it is a separate step, not built.
- **The rewrap needs no lock of its own.** Each batch takes its rows `for update`; a second pass at the same time waits row by row and finds each done. Two replicas starting together, and the `rekey` command run beside a running instance, were both tried.
- **The ciphertext format did not change.** With at most two keys, trying both costs nothing worth a key ID in every value, and old values need no migration.
- **`--env-file` does not override what the shell already set.** On the walk, `rekey` refused to start because the shell had the old key exported, so both settings held it, which the configuration check refuses. Worth knowing when running it by hand; the docs give the `docker compose exec` form.
- **Rotated on a local instance:** with the old key, a tenant secret, a dedicated database location and a deployed script; `rekey` with the keys swapped moved a tenant key, the location and the data role's secret and exited 0; the status said the second key could go; restarted with the new key alone, the location answered and a script read its secret. Run again beside a running instance, `rekey` found nothing left.
- **Walked in Chromium at 1440 and 390 px:** a queued run of `billing/charge` behind another for the same client said "Waiting for 1 run with the same key (brooks-family) to finish." and showed "brooks-family · one at a time"; the run for another client had already succeeded. No page scrolled sideways, and no page threw. `pnpm e2e` passes (16).

### Milestone 3

- **The Test existed already; its result went nowhere.** A `test-connection` task, the worker's run of it and the console's button were there since phase 9. What was missing was keeping the answer: a Test now writes the connection's health, which the list shows until the next Test, or until its settings or secret change, which forget it. Tests still run only when someone asks.
- **One sheet sets a connection up, in four numbered steps:** what it is, its settings, its secret, and save and test. The settings are drawn by the schema form from the connector's schema, so nested settings such as an HTTP connection's headers and how its credential is sent are no longer left out. A connection that nothing declares is declared in a draft first, then bound. A new route, `GET …/connectors`, gives the form the kinds and their schemas.
- **It saves, then tests.** A worker reads a saved binding, so a Test before saving would need a binding of its own. A refusal stays in the sheet with a way back to the secret, and nothing runs in between: a wrong credential still fails the Test with its status before any script runs.
- **OAuth 2.0 is a built-in connector, `oauth2`.** Its client is an http client that sends the access token as a bearer token, to the connection's own API only. The secret stored is the client's. Google and Microsoft are presets; a group cannot be an OAuth one yet, since each member would need authorizing in a browser.
- **The control plane keeps the tokens and refreshes them** (decision 0001, amended). The code exchange and each refresh go through the egress guard. A refresh happens under a lock per connection: three readers at once caused one call to the provider. A provider that rotates refresh tokens has the new one kept; one that does not, the old one. A worker is handed the access token and when it runs out, never the refresh token or the client's secret.
- **Connect is tied to the member who pressed it.** The state is claimed once, within ten minutes, and only by the browser of the member who began it: the callback reads the member's own session, which a top-level return from the provider carries. Someone else's browser is refused without using the state up.
- **A provider that refuses a refresh marks the connection Needs reconnecting,** records that as its health, and writes `connection.oauth_refresh_failed`. Runs then fail with that message at once, without asking the provider again. A provider that fails rather than refuses (a 5xx or no answer) leaves the token in use while it lasts.
- **A connection the worker cannot use answers 422, not 409.** The first version said 409, which a worker reads as "this attempt is over", so a Test of an unauthorized connection waited until it timed out. Found by the tests.
- **The client's secret could have reached a worker.** A connection declared only in a draft was handed out as `http` with its stored secret, which for an OAuth connection is the client's. Settings with a token address and an authorization address are now always treated as OAuth, whatever is declared so far. Found by the tests.
- **Tokens are refreshed by when the provider said they end.** A token the provider revokes before then is handed out until that time, and a run gets the API's 401. Nothing refreshes on a 401. In practice providers revoke rarely; worth knowing when one does.
- **The walk fixed four things.** The form drew any field allowed 200 characters or more as a text box, so the OAuth addresses were tall boxes; they are one line now. The HTTP connector's settings had no titles ("Base Url", "Auth") and an empty box under a bearer token. Reopening a connection with its own addresses said "Google". And on a phone the health and Reconnect were off the table's edge; health is the second column now, with Reconnect in it.
- **The run's message says which call failed** ("GET /runs/…/connections/google answered 422: The connection google needs connecting again…"). The worker adds the first part; the reason is all there.
- **Walked in Chromium on a built instance, at 1440 and 390 px, with a stand-in provider and API:** an HTTP connection with a wrong token tested "HTTP 401", then with the right one "Reached in 25 ms"; an OAuth connection was saved, connected at the provider with PKCE, and tested on return; with tokens lasting a minute, a run of `calendar/who` refreshed once and read the API with nobody acting; with the provider refusing, the next run failed saying the connection needs connecting again, the list said Needs reconnecting, and Reconnect brought it back. No page scrolled sideways, and no page threw. `pnpm e2e` passes (16).


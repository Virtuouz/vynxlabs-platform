# Phase 10: platform expansion

Status: in progress. Milestones 1 to 6 are built, on branch `phase-10-expansion`.
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

### Milestone 4

- **The run page could not show a draft's run.** It draws the graph of the flow as deployed, which for a draft is stale or not there. The test's states are drawn on the editor's own nodes instead, and the edges it took are drawn strong; that drawing is never part of what is saved.
- **The panel tests what is saved, and saves first.** A test run builds a bundle from the workspace's drafts, so a change not yet saved is saved before the run. A new flow is saved once before it can be tested, since saving it opens it at its own address.
- **Following the run was moved out of the run page** into one hook that both use: the run is read again on its stream events, and every second and a half without the stream.
- **What an expression reads was built in two places' worth of code, now one.** The engine's context (the trigger, each finished step's output or error, and the time) is made by one function, which the engine and the preview both call, so a preview cannot say what a run would not. The existing flow tests pass unchanged.
- **The preview runs the expression in the engine's sandbox, against a run that happened,** by `GET …/expressions/value`: a read, with `flow_run:read`, rate-limited. Without a run it says to run a test. A foreach's input is worked out for the first of its items, which the editor sends.
- **Numbers from step outputs are doubles, in the preview as in a run.** `count * 10` fails with the engine's own hint and `count * 10.0` works. The first server test assumed otherwise, and the preview was right.
- **The walk's own seed flow had a mistake the preview showed at once:** `sum()`, which CEL does not have, failed under its field with the engine's words, and the Last test showed the step's failure beside it.
- **Undo is of the graph and the description, never of what is chosen.** Snapshots leave out selection, dragging and measuring, so choosing a step is not a change. Typing in one field is one step until it pauses for a second; a drag is one step. Typing in a field keeps the browser's own undo of that field.
- **Undoing first closed the chosen step's settings.** The restored nodes carried no selection, and the canvas took that as nothing chosen. The chosen step now stays chosen when it is still there. Found on the walk; the e2e test now undoes from outside a field and checks the settings stay.
- **The canvas spilled over the test panel** at 1440 px: its least height left no room for the panel. It may be shorter on a wide screen now, the graph is fitted again when the panel opens or closes, and the minimap is hidden while the panel is open, where it covered steps.
- **A running instance serves only the console it found at start.** Rebuilding the console under a running instance gave a blank page until it was restarted. Worth knowing when building in place.
- **Walked in Chromium on a built instance, at 1440 and 390 px,** with a draft flow that runs a script for each line of an order: tested from the panel, the steps filled in on the graph (the foreach took 0.9 to 1.9 s on a worker); the summary step's Last test showed `{count: 2, total: 525, customer: "Brooks family"}`; its expressions previewed `525` and `2`, and `No such key: totl` when misspelt; the foreach's input previewed its first item; a case giving `525` said a case must give true or false; a removed step came back with Undo, went with ⇧⌘Z and came back with ⌘Z, and after a reload the draft had it. No page scrolled sideways, and no page threw. `pnpm e2e` passes (17), with a new test of the editor.

### Milestone 5

- **`pull` writes the whole set, always.** A bundle with any console resource replaces the workspace's whole console set with what it has, so a pull of part of it, deployed, would remove the rest. `GET …/resource-files` gives every console resource with the drafts laid over it, rendered as Git sync renders them, and the CLI writes all of it.
- **A file changed here is never overwritten without `--force`.** The CLI keeps what it last wrote in `.platform/pulled.json`, by hash. A file still as pulled is updated or removed with the console; one changed since is listed, and pull exits 1.
- **A deploy did not clear the drafts it carried.** Only the console's own deploy deleted the drafts it applied, so after pull, edit, deploy the Changes screen still listed each pulled draft, and deploying it from there would have undone the repository's edit. Two rules close it:
  - `pull` records the revision of each draft it took, and `deploy` sends them (`settleDrafts`): each is removed if it is still at that revision, and one changed in the console since is kept;
  - any deploy, from the CLI, Git or a promotion, removes a draft whose rendered files are what is now deployed, and a removal whose path is gone.
- **The first version cleared only drafts equal to what was deployed.** The CLI's round-trip test edits the pulled file before deploying, and the draft stayed. That is why `pull` now records revisions.
- **A local build is uploaded as a preview** (`POST …/bundles?preview=true`), never offered for deploying, removed after a week, with the workspace's console resources kept on it so a local flow can call a console-made script. A test run takes it by `bundleId`, in a dev workspace only, and needs `code:write`. Its run says `local: true`.
- **Fixed: a test run in a dev workspace with nothing deployed waited for ever.** Workers were given runs only from workspaces with a deployed bundle, so a first try of a draft, or of a local build, in a new workspace was never claimed. Found by the CLI's first test. A workspace with queued runs now counts too.
- **Following uses the tenant's event stream as a doorbell.** The stream carries no log text: on an event about the run, the CLI reads the lines after the last it printed. Without the stream (refused, or dropped), it looks every two seconds; it is tested with the stream refused.
- **A foreach's items are followed too,** each item's lines prefixed with its number. The first walk showed a foreach step with no lines under it.
- **Steps that finish in one pass of the engine show in name order.** They share a start time, which is the transaction's. The run page has the same order.
- **Exit codes:** 0 succeeded, 1 failed, 3 canceled, 130 stopped with Ctrl+C. The run goes on after Ctrl+C, and the CLI says how to follow it again.
- **`CliError` moved out of `cli.ts`.** The new modules subclass it, and with `cli.ts` and them importing each other it was not yet defined when they loaded.
- **Checked by hand on a built instance with a worker:** the walk workspace's flow draft was pulled, its branch edited from 500.0 to 400.0 in the YAML and deployed; the deploy said the draft it carried was cleared, the console had no drafts, the deployed flow had 400.0, and a second pull found nothing to change. `run orders/quote --remote` ran the flow from the local build, its foreach's two items priced by the script with their lines streamed, and printed the output. `logs -f` of a run started from the API was stopped with Ctrl+C and then followed to "Succeeded in 1.6 s".

### Milestone 6

- **The console offered a Promote button that could only fail.** It knew nothing of permissions, so a developer saw Promote to production and got a 403. The preview now says `canPromote`, and one who may not sees Request promotion in its place.
- **A request pins the version asked for.** Promoting it promotes that bundle, even after dev deployed again; the reviewer is told "dev is now at v14". `promote()` takes a bundle of the source's other than the active one for this.
- **One request waits per pair of workspaces.** Asking again marks the last one superseded. Declining needs a comment, which the one who asked reads on the promote step. Only the one who asked may withdraw.
- **Decided in place.** The tenant summary counts requests waiting on the one looking (null when they decide none), and the overview lists them with Review: the preview of the pinned bundle in a side sheet, with Promote and Decline.
- **A dialog opened from a side sheet came up behind it.** Dialogs had no layer of their own, and a side sheet is layer 50, so the confirmation of Promote could not be clicked. Found by the new e2e test. Dialogs are above side sheets now, and menus, pickers and messages above dialogs.
- **Drift compares resources, not bundles.** Each resource of dev and of the workspace it promotes to, by path, with the equality deploy uses: changed, only in dev, only there, or in sync. What changed is said with the sentences the Changes screen already uses, and shown line by line as sorted JSON, folded away from the changes. One only in production that was made in its console and its bundle does not carry is marked as left by a promotion.
- **The diff is one column at every width,** with − for production and + for dev, rather than two columns on a wide screen: a long line reads the same either way, and the two columns would need lining up.
- **Effective permissions read the rows the permission check reads.** `explainAccess` uses the same match as `check()` and returns what each row is: the role, where, and whether it comes through a group or is given to anyone; an operator's access grant with its end. A test checks the two agree for each permission at each place. A suspended member's rows are shown as not counting.
- **An operator with an access grant is no member,** and the access page answered 404 for one at first. It now finds anyone the tenant gave something.
- **"Yes" needed a where.** On the walk, checking `promotion:write` for a developer whose group held the deployer role in dev said Yes, while promoting is checked in production. The answer now says where: "only in: Clinics dev workspace".
- **Walked in Chromium on a built instance, at 1440 and 390 px,** with a developer and an operator in one tenant: the developer asked for a promotion with a note and saw it waiting; drift listed the changed flow, the new variable and the one removed, and the flow's sheet showed its changed and added lines; the operator saw the request on the overview, reviewed and promoted it; the developer then saw it promoted; the developer's access page listed what developer and deployer give them, through the group Engineers; following deployer opened the access list with that binding marked. No page scrolled sideways, and no page threw. `pnpm e2e` passes (18), with a new test of this.


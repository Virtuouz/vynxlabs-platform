# Fact-check: console/reference/screens/configure/connections.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Second check: Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Buttons **New connection** and, in production, **Set up a connection**; offered with `connection:write` and, outside production, `resource:write`. | `apps/console/src/screens/Execution.tsx:789-791,822-838,830` | writer, 2026-11-23 | holds |
| Production, every connection set up: message "Nothing waits to be set up here. A connection is declared in a dev workspace and arrives here with a promotion." | `apps/console/src/screens/Execution.tsx:824-832` | writer, 2026-11-23 | holds; run on Clinics (production): toast not caught by the script, text from code |
| Columns Connection, Health, Used by, Kind, Points to; tags **Arrives with the next promotion**, **Draft, never deployed**, **Draft**, **Removing**. | `apps/console/src/screens/Execution.tsx:848-900` | writer, 2026-11-23 | holds; seen in the list |
| Kind names HTTP, Mail (SMTP), OAuth 2.0, a connector path, "Not declared anywhere". | `apps/console/src/screens/ConnectionWizard.tsx:59-65; Execution.tsx:883-887` | writer, 2026-11-23 | holds |
| Points to is `baseUrl` or `host`; else the pill **Not set up here**. | `apps/console/src/screens/Execution.tsx:889-905; kit/status.tsx:109` | writer, 2026-11-23 | holds |
| Health states: Not tested; Reached with "N ms · tested …"; Failed with the reason under it; Not connected + Connect; Needs reconnecting + Reconnect. | `apps/console/src/kit/health.tsx:17-43; apps/console/src/screens/Execution.tsx:750-782` | writer, 2026-11-23 | holds; Reached 41 ms, Not tested and Failed (HTTP 404) all seen |
| Failed reason for HTTP is "HTTP 404: … answered 404." | `apps/console/src/screens/ConnectionWizard.tsx:148-174; packages/sdk/src/http.ts:208-220` | writer, 2026-11-23 | holds; seen in the list |
| A test is forgotten when the settings change; saving the same settings keeps it. | `apps/control-plane/src/routes/execution.ts:2935-2945 (forgetHealth when `changed`)` | writer, 2026-11-23 | holds; seen: after a path change the row read Not tested |
| A refused OAuth renewal writes the health. | `apps/control-plane/src/kernel/execution/oauth.ts:505-515` | writer, 2026-11-23 | holds (read, not run) |
| Row actions: Test (bound, connected if OAuth, `run:read`), Change / Set up, Remove from here. | `apps/console/src/screens/Execution.tsx:921-942` | writer, 2026-11-23 | holds |
| Remove question: "Remove X from here? Scripts that use it will fail until it is set up again." plus "Used by N: …"; unread uses say so. | `apps/console/src/ListScreen.tsx:536-588; apps/console/src/screens/Execution.tsx:925` | writer, 2026-11-23 | holds; seen on the page |
| Empty state text. | `apps/console/src/screens/Execution.tsx:909-912` | writer, 2026-11-23 | holds |
| `?setup=` / `?item=` open the sheet; unknown path "There is no connection X here to set up."; `?oauth=` / `?oauth_error=` with `connection`. | `apps/console/src/screens/Execution.tsx:797-826` | writer, 2026-11-23 | holds |
| Nav badge "N not set up"; Overview "N connection(s) has/have nothing bound here". | `apps/console/src/Shell.tsx:177; apps/console/src/screens/Overview.tsx:385` | writer, 2026-11-23 | holds |
| Page: state mark, health, Test (needs `run:read` and `connection:write`), Change where it points / Set up, Remove from here. | `apps/console/src/screens/ObjectPages.tsx:69-197` | writer, 2026-11-23 | holds; seen |
| Meta rows Kind, What it is for, Credential Set/None, Declared, Connected, Last changed, Last check (failed only). | `apps/console/src/screens/ObjectPages.tsx:128-170` | writer, 2026-11-23 | holds; seen (Last check not seen) |
| Tabs Used by and Where it points (JSON, Copy; "Not set up in this workspace yet."). | `apps/console/src/screens/ObjectPages.tsx:171-190` | writer, 2026-11-23 | holds; seen |
| A missing connection page: "Go to the connections". | `apps/console/src/screens/ObjectPages.tsx:63` | writer, 2026-11-23 | holds |
| Sheet title "New connection" or "Set up X"; description; footer Close / Save / Save again. | `apps/console/src/screens/ConnectionWizard.tsx:354-367` | writer, 2026-11-23 | holds; seen |
| Part names 1 · What it is, 2 · Settings, 3 · Token or key / Password / Client secret / Secret, 4 · Save and test / Connect and test. | `apps/console/src/screens/ConnectionWizard.tsx:68-78,371,485,499,523` | writer, 2026-11-23 | holds; seen (OAuth and mail by opening the sheet) |
| Name rule and refusal text; Kind offers built-ins only. | `apps/console/src/screens/ConnectionWizard.tsx:291-296,423-432` | writer, 2026-11-23 | holds; seen |
| The Fields and JSON tabs of the settings form. | `packages/ui (SchemaForm); seen in the sheet` | writer, 2026-11-23 | holds; seen |
| OAuth: Provider Google / Microsoft / Another provider, Directory (tenant) default common, Redirect address with Copy, `<instance>/api/v1/oauth/connections/callback`. | `apps/console/src/screens/ConnectionWizard.tsx:81-134,443-481` | writer, 2026-11-23 | holds; seen |
| Stored credential line, Replace, Remove, Keep the stored one, removal text; address-changed notice for origin, host, port, token address. | `apps/console/src/kit/SecretField.tsx:65-175; apps/console/src/screens/ConnectionWizard.tsx:117-132,500-505` | writer, 2026-11-23 | holds; Stored/Replace/Remove seen; notice by code only |
| Part 4 states: Saved; Connected / Not connected yet / Needs connecting again; Connect / Connect again; Testing…; Waiting for a worker… after 20 s; Test / Test again; non-OAuth tested on Save. | `apps/console/src/screens/ConnectionWizard.tsx:535-592,340; apps/console/src/tasks.ts:11` | writer, 2026-11-23 | holds; Reached (200) seen |
| A test waits 2 minutes for a worker and then fails with "No worker took it in time. Start a worker for this workspace, or let the instance start one." | `apps/control-plane/src/kernel/execution/tasks.ts:19-23,224-240` | writer, 2026-11-23 | holds (code) |
| Groups: header text, Add a member, Open the draft, Change, Remove ("Remove?", member text), columns, empty texts, Not declared texts, no Add for undeclared. | `apps/console/src/screens/Execution.tsx:1574-1713` | writer, 2026-11-23 | holds; seen with one member |
| Member sheet: Key hint and disabled when changing, Name, schema form, Credential with Replace, no Remove; empty key refusal; address-moved notice. | `apps/console/src/screens/GroupMemberSheet.tsx:24-141` | writer, 2026-11-23 | holds; Add a member seen |
| Key pattern `^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$` and label up to 200; re-adding replaces. | `apps/control-plane/src/routes/execution.ts:2811-2850 (label maxLength 200); key pattern at MemberParams` | writer, 2026-11-23 | label holds; key pattern not re-read (taken from the inventory) |
| A group cannot hold `oauth2`. | `packages/manifest/src/bundle-check.ts:326-336` | writer, 2026-11-23 | holds |
| Permissions: read `connection:read`; write `connection:write`; Test `connection-tests` `connection:write`; declare new also `resource:write`. | `apps/control-plane/src/routes/execution.ts:2580,2911,2970,3006; apps/console/src/screens/Execution.tsx:789-791` | writer, 2026-11-23 | holds |
| Read-only line and disabled row buttons; group buttons not gated. | `apps/console/src/ListScreen.tsx:420-440; kit/Can.tsx:176-245` | writer, 2026-11-23 | holds; seen as Devi on Settings (same component); groups per inventory "Left" |
| Role contents: developer, workspace_admin, viewer. | `apps/console/src/builtinRoles.ts:19-82` | writer, 2026-11-23 | holds |

## Second check, 2026-11-23

Checked by: second agent, 2026-11-23. Source commit `87000022`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Row, page and sheet strings of the screen (columns, tags, Health states, Test / Change / Set up / Remove from here, empty and read-only texts, sheet title, description, parts 1 to 4, Save / Save again, Saved, Testing…, Not tested, Test again, Change the token or key). | `apps/console/src/screens/Execution.tsx:741-960`, `ConnectionWizard.tsx:59-78,354-597` | second agent, 2026-11-23 | holds; read line by line |
| Kind offers built-in kinds only; Provider, Directory (tenant), Redirect address. | `ConnectionWizard.tsx:81-134,423-481` | second agent, 2026-11-23 | holds; seen in the sheet |
| Test waits 2 minutes for a worker; Waiting for a worker… after 20 seconds; the refusal text. | `kernel/execution/tasks.ts:19-23,236`; `apps/console/src/tasks.ts:11` | second agent, 2026-11-23 | holds |
| Key pattern `^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$`, label up to 200. | `routes/execution.ts:2664,2822` | second agent, 2026-11-23 | holds (the writer's open point is closed) |
| Group section strings, buttons, columns, Not declared texts; no Change for an undeclared group's members. | `Execution.tsx:1574-1713` | second agent, 2026-11-23 | holds |
| OAuth round trip: Save shows Saved, Not connected yet, Connect, Not tested, Test off; Connect goes to the provider and back; the sheet reopens showing Connected (with the scopes the provider gave), Reached (200) in 41 ms.; with the provider refusing, part 4 says "The provider said no: access_denied." and the connection stays Not connected yet; changing the authorization address forgets the sign-in (the row reads Not connected). | `kernel/execution/oauth.ts:175,252`; `bindings.ts:78-90` | second agent, 2026-11-23 | run on the instance against a stand-in provider on 127.0.0.1:4021 (authorize with PKCE S256, token, userinfo); added to the page |
| A mail test says "Reached in 6 ms." (no status), connects and signs in and sends no mail (the stand-in SMTP server saw EHLO, AUTH, QUIT only); a wrong password gives "Invalid login: 535 5.7.8 Bad credentials". | `packages/worker/src/smtp.ts:22-30`; `ConnectionWizard.tsx:148-174` | second agent, 2026-11-23 | run; added to the page |
| Tooltip and read-only texts follow `askForAccess`. | `kit/Can.tsx:176-245` | second agent, 2026-11-23 | holds |
| A Developer has `connection:write`, `resource:write`, `run:write` and every `:read`; Workspace admin `connection:*`, `resource:*`; Viewer every `:read`. | `apps/console/src/builtinRoles.ts:19-82` | second agent, 2026-11-23 | holds |
| Seen at 390 px (dark) and 768 px (light): no page scroll; the table scrolls inside its panel and shows the first columns; the sheet fits. Escape closes the sheet and focus returns to the button that opened it. | walk | second agent, 2026-11-23 | holds |

Sentences that described a fault, now closed:

- "For an HTTP connection the reason is 'HTTP 404: https://… answered 404.'" and **Failed (HTTP 404)**: fault fixed (fa): any answer is Reached, only 401, 403 and 407 fail (sdk/http.ts), confirmed in the code; the page now says so.
- "The buttons for groups are not turned off for a person who may only read": fault fixed (fb): Add a member, Change and Remove are off with the reason without `connection:write` (`ConnectionGroups`), confirmed in the code; the page says so.
- "The workspace's **Overview** says 'N connection has nothing bound here'": fault fixed (fb): the Overview says "N connection is not set up here", confirmed in the code; the page says so.
- Test of a Mail connection that is new and not deployed: fault fixed (fa): `boundConnection` uses the binding's own connector, confirmed in the code; the how-to page no longer states the workaround.
- Connections' New connection panel offers HTTP, Mail and OAuth 2.0 only: fault fixed (fb): Kind lists the workspace's own connectors, confirmed on the instance; the page says so.

## Phase 34, A7 (YAML first), 2026-11-24

Commit `d619bfbd` plus the working tree. Written by the A7 writer; second agent checked 2026-11-24 (a7r). Run on the throwaway instance of lane a7 (http://localhost:8712, Fernhill seeded).

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| A group is a `.connection_group.yaml` file. | `schemas/files/connection_group.v1.schema.json`; run on `walk3` | writer, 2026-11-24 | holds as run |

### Second check (a7r), 2026-11-24, second agent

Lane a7r build, `pnpm docs:check` passes. Second agent, 2026-11-24. The quoted group text is in `apps/console/src/screens/Execution.tsx`; the file name `<path>.connection_group.yaml` is the one the schema `connection_group.v1` and a built example use (see connections-in-scripts). Holds.

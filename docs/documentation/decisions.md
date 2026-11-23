# Decisions asked of the owner after triage

Status: answered by the owner on 2026-11-22. Everything triage found is in phase 29: security, data, broken, untrue, rough, and every missing part. Where two slices recommended different things, or a recommendation was wrong, the row says what is recommended now.

Already decided, and not asked: every collection is on every instance; `/docs` shows the version, which `/api/v1/instance` already makes public; turning two-person approval off needs no approval (phase 22); missing parts are built, so sessions, change password, key expiry and the flow editor's fields are in; CSV import is later; a new product term or topic starts `volvel-` (phase 30 M4).

## Security and recovery

| # | Question | Recommended | Answer |
|---|---|---|---|
| D1 | Tenants' workers share one user on a host, so one tenant's script can change another's code (HOST-03) | A user of its own for each worker. A container each belongs to sandboxing, later | as recommended |
| D2 | May a tenant's identity provider sign in someone who runs the instance? (GOV-08) | No: a password or the instance's provider | as recommended |
| D3 | How does a locked-out operator get back in? (INS) | A command run on the machine, audited, printing a one-time password | as recommended |
| D4 | How is a member's password reset? | A one-time link an operator or tenant admin makes, mailed where mail is set up and copyable where not. Nobody learns the password | as recommended |
| D5 | Members' password hashes in an export (GOV-09) | Sealed under the passphrase, and left out for people who also belong elsewhere | as recommended |
| D6 | Suspended by hand, but the directory says active (GOV-05) | The hand wins, until lifted by hand | as recommended |
| D7 | May any role but `operator_admin` be bound at the instance? | No | as recommended |
| D8 | May "anyone" hold more than apps need? (ACC-01) | No | as recommended |
| D9 | May a service account approve a change to access? (ACC-08) | No: a second person is a person | as recommended |
| D10 | A connection's or source's address changes origin (CFG-03, DAT-03, GOV-06) | The stored credential is dropped unless given again | as recommended |
| D11 | An HTTP connection is redirected to another origin (CFG-02) | Refused, naming the address | as recommended |
| D12 | "Require it" for single sign-on; "Turn off" | Requiring ends the password sessions of those it covers, but not of whoever presses it. Off keeps pushes, and says so | as recommended |
| D13 | MCP shows another person's run or a waiting approval (OPS-02) | Masked, as on screen. The caller's own runs stay as they are | as recommended |
| D14 | Service-account keys on routes for whoever is signed in | Refused, unless the route says otherwise | as recommended |
| D15 | `trustProxy` trusts any forwarded address | A setting, one hop unless set | as recommended |
| D16 | Whose switch is "the instance starts workers"? | The operator's off wins | as recommended |
| D17 | `console_code`, which only the database can set (two slices differ) | An operator's and tenant admin's switch, audited | as recommended |
| D18 | A wrong password spends a recovery code | Kept, and the form says so | as recommended |
| D19 | May the data role's seed be changed? | Yes: `rekey --data-role` | as recommended |
| D20 | Worker firewall and `EGRESS_ALLOW` | A separate `WORKER_EGRESS_ALLOW`, empty by default | as recommended |

## Data and behavior

| # | Question | Recommended | Answer |
|---|---|---|---|
| D21 | Which zone is a time shown, typed and filtered in? (WID-Q1, TAB-Q1) | The reader's, everywhere, with UTC on hover | as recommended |
| D22 | Files and the rows that name them (DAT-Q3, TAB-Q4) | A reader gets a file through a row they may read, or that they uploaded. Deleting is refused while a row names it. Files of a deleted row are kept for the audit period | as recommended |
| D23 | Production needs a new connection or variable before its first promotion (CFG-04) | Set up from the refused preview, and listed in production as arriving with the next promotion | as recommended |
| D24 | A data source's rows on a page (DAT-01) | Its author holds `data_source:read`, its reader `data:read` | as recommended |
| D25 | SQL without `sql:read` (DAT-02) | Console drafts and deploys ask for it. A repository deploy does not | as recommended |
| D26 | A poll that gives more than 100 items (EXT-02, OPS-06) | The tick fails and says so, and the cursor stays. (The report's "take 100 and keep the cursor" would give the same 100 again) | as recommended |
| D27 | Retiring a table others refer to | Refused, naming them | as recommended |
| D28 | Rows changed by a reference's rule | Not announced, and documented | as recommended |
| D29 | A script's `onFailure` and the workspace's default | Its own replaces the default, as the page says | as recommended |
| D30 | A rejection's reason | Asked by the server on every route | as recommended |
| D31 | Fire now | Allowed when turned off, refused when paused | as recommended |
| D32 | Which drafts a flow or script test uses | Its own and those it uses; "with all drafts" as a choice | as recommended |
| D33 | A renamed webhook or form step changes its address (FLW-04) | Warn now, and give the trigger a stable key in this phase | as recommended |
| D34 | Removing a flow step | Never asks; the message offers Undo | as recommended |
| D35 | A repository app opened in the App Builder | Read only, with Take over | as recommended |
| D36 | A download from a widget | What is shown: columns, order, headings, money in units | as recommended |
| D37 | `labs/goal` | Becomes `core/goal` | as recommended |
| D38 | Number formats | The reader's locale, in one shared helper | as recommended |
| D39 | Guests starting runs from an app | Refused for scripts and flows; forms still start them | as recommended |
| D40 | Files an app no longer names | Swept after a deploy | as recommended |
| D41 | "Encrypt the connection" on a new data source | Starts at Yes | as recommended |
| D42 | Pool for Test and alerts | The pool of the script that uses it, and of the run that failed | as recommended |
| D43 | Console scripts' defaults | The SDK's delay and backoff; 60 s stays; all are shown | as recommended |
| D44 | `console.log` in a script | Goes to the run's log, masked | as recommended |
| D45 | Verified names that stop verifying | Shown and audited; nothing stops | as recommended |
| D46 | Leftover members of a removed connection group | Listed with Remove | as recommended |
| D47 | Deleting a tenant whose database is unreachable; its log afterwards | Allowed with a second confirmation; the log is read at the instance | as recommended |
| D48 | Unfollowing a branch; a hostname an operator enabled | Can be unfollowed; the tenant may re-enable it | as recommended |
| D49 | CLI: `promote --preview` with breaking changes; a failed release push; a token tied to its URL | Exit 4; warn and exit 0; yes | as recommended |
| D50 | A run that is canceled | One `run-finished` event with its status; the two present events stay | as recommended |
| D51 | Session lifetime | 7 days stays, and is documented | as recommended |
| D52 | Names of apps | 100 characters everywhere | as recommended |
| D53 | SDK definitions of a tenant's access; CLI bindings | YAML only, with a schema; the API, with a documented script | as recommended |

## Words, names, policy

| # | Question | Recommended | Answer |
|---|---|---|---|
| D54 | "Release" names two things | Access releases become "access changes". The screen is "Deploy" in dev and "Versions" in production. "Activate" becomes Deploy or Roll back | as recommended |
| D55 | Metric names `platform_…` | `volvel_…`, now, before the docs freeze them | as recommended |
| D56 | `/api/v1` policy | Only additions; 90 days' notice for a removal | as recommended |
| D57 | `workspace_admin` lacks `interface`, `doc`, `git` | Given the three (not `code`); its two inert permissions are dropped | as recommended |
| D58 | A docs-only TypeScript 6 for the SDK reference | Yes, once its version and license are confirmed | as recommended |
| D59 | Supported topologies; is `pg_dump` a backup? | Compose supported, Fly an example; yes, once HOST-01 is fixed | as recommended |
| D60 | The widget contract's page | Published, marked for contributors to the platform | as recommended |
| D61 | Vulnerability contact and response time | GitHub private vulnerability reports, answered within 3 working days. No email address | decided |
| D62 | Supported versions and the first publish date | The newest minor and the one before. The first publish date is not set | decided |

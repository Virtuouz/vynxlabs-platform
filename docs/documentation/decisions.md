# Decisions asked of the owner after triage

Status: asked 2026-11-22. An answer is written beside its row. Where two slices recommended different things, or a recommendation was wrong, the row says what is recommended now.

Already decided, and not asked: every collection is on every instance; `/docs` shows the version, which `/api/v1/instance` already makes public; turning two-person approval off needs no approval (phase 22); missing parts are built, so sessions, change password, key expiry and the flow editor's fields are in; CSV import is later; a new product term or topic starts `volvel-` (phase 30 M4).

## Security and recovery

| # | Question | Recommended | Answer |
|---|---|---|---|
| D1 | Tenants' workers share one user on a host, so one tenant's script can change another's code (HOST-03) | A user of its own for each worker. A container each belongs to sandboxing, later | |
| D2 | May a tenant's identity provider sign in someone who runs the instance? (GOV-08) | No: a password or the instance's provider | |
| D3 | How does a locked-out operator get back in? (INS) | A command run on the machine, audited, printing a one-time password | |
| D4 | How is a member's password reset? | A one-time link an operator or tenant admin makes, mailed where mail is set up and copyable where not. Nobody learns the password | |
| D5 | Members' password hashes in an export (GOV-09) | Sealed under the passphrase, and left out for people who also belong elsewhere | |
| D6 | Suspended by hand, but the directory says active (GOV-05) | The hand wins, until lifted by hand | |
| D7 | May any role but `operator_admin` be bound at the instance? | No | |
| D8 | May "anyone" hold more than apps need? (ACC-01) | No | |
| D9 | May a service account approve a change to access? (ACC-08) | No: a second person is a person | |
| D10 | A connection's or source's address changes origin (CFG-03, DAT-03, GOV-06) | The stored credential is dropped unless given again | |
| D11 | An HTTP connection is redirected to another origin (CFG-02) | Refused, naming the address | |
| D12 | "Require it" for single sign-on; "Turn off" | Requiring ends the password sessions of those it covers, but not of whoever presses it. Off keeps pushes, and says so | |
| D13 | MCP shows another person's run or a waiting approval (OPS-02) | Masked, as on screen. The caller's own runs stay as they are | |
| D14 | Service-account keys on routes for whoever is signed in | Refused, unless the route says otherwise | |
| D15 | `trustProxy` trusts any forwarded address | A setting, one hop unless set | |
| D16 | Whose switch is "the instance starts workers"? | The operator's off wins | |
| D17 | `console_code`, which only the database can set (two slices differ) | An operator's and tenant admin's switch, audited | |
| D18 | A wrong password spends a recovery code | Kept, and the form says so | |
| D19 | May the data role's seed be changed? | Yes: `rekey --data-role` | |
| D20 | Worker firewall and `EGRESS_ALLOW` | A separate `WORKER_EGRESS_ALLOW`, empty by default | |

## Data and behavior

| # | Question | Recommended | Answer |
|---|---|---|---|
| D21 | Which zone is a time shown, typed and filtered in? (WID-Q1, TAB-Q1) | The reader's, everywhere, with UTC on hover | |
| D22 | Files and the rows that name them (DAT-Q3, TAB-Q4) | A reader gets a file through a row they may read, or that they uploaded. Deleting is refused while a row names it. Files of a deleted row are kept for the audit period | |
| D23 | Production needs a new connection or variable before its first promotion (CFG-04) | Set up from the refused preview, and listed in production as arriving with the next promotion | |
| D24 | A data source's rows on a page (DAT-01) | Its author holds `data_source:read`, its reader `data:read` | |
| D25 | SQL without `sql:read` (DAT-02) | Console drafts and deploys ask for it. A repository deploy does not | |
| D26 | A poll that gives more than 100 items (EXT-02, OPS-06) | The tick fails and says so, and the cursor stays. (The report's "take 100 and keep the cursor" would give the same 100 again) | |
| D27 | Retiring a table others refer to | Refused, naming them | |
| D28 | Rows changed by a reference's rule | Not announced, and documented | |
| D29 | A script's `onFailure` and the workspace's default | Its own replaces the default, as the page says | |
| D30 | A rejection's reason | Asked by the server on every route | |
| D31 | Fire now | Allowed when turned off, refused when paused | |
| D32 | Which drafts a flow or script test uses | Its own and those it uses; "with all drafts" as a choice | |
| D33 | A renamed webhook or form step changes its address (FLW-04) | Warn now, and give the trigger a stable key in this phase | |
| D34 | Removing a flow step | Never asks; the message offers Undo | |
| D35 | A repository app opened in the App Builder | Read only, with Take over | |
| D36 | A download from a widget | What is shown: columns, order, headings, money in units | |
| D37 | `labs/goal` | Becomes `core/goal` | |
| D38 | Number formats | The reader's locale, in one shared helper | |
| D39 | Guests starting runs from an app | Refused for scripts and flows; forms still start them | |
| D40 | Files an app no longer names | Swept after a deploy | |
| D41 | "Encrypt the connection" on a new data source | Starts at Yes | |
| D42 | Pool for Test and alerts | The pool of the script that uses it, and of the run that failed | |
| D43 | Console scripts' defaults | The SDK's delay and backoff; 60 s stays; all are shown | |
| D44 | `console.log` in a script | Goes to the run's log, masked | |
| D45 | Verified names that stop verifying | Shown and audited; nothing stops | |
| D46 | Leftover members of a removed connection group | Listed with Remove | |
| D47 | Deleting a tenant whose database is unreachable; its log afterwards | Allowed with a second confirmation; the log is read at the instance | |
| D48 | Unfollowing a branch; a hostname an operator enabled | Can be unfollowed; the tenant may re-enable it | |
| D49 | CLI: `promote --preview` with breaking changes; a failed release push; a token tied to its URL | Exit 4; warn and exit 0; yes | |
| D50 | A run that is canceled | One `run-finished` event with its status; the two present events stay | |
| D51 | Session lifetime | 7 days stays, and is documented | |
| D52 | Names of apps | 100 characters everywhere | |
| D53 | SDK definitions of a tenant's access; CLI bindings | YAML only, with a schema; the API, with a documented script | |

## Words, names, policy

| # | Question | Recommended | Answer |
|---|---|---|---|
| D54 | "Release" names two things | Access releases become "access changes". The screen is "Deploy" in dev and "Versions" in production. "Activate" becomes Deploy or Roll back | |
| D55 | Metric names `platform_…` | `volvel_…`, now, before the docs freeze them | |
| D56 | `/api/v1` policy | Only additions; 90 days' notice for a removal | |
| D57 | `workspace_admin` lacks `interface`, `doc`, `git` | Given the three (not `code`); its two inert permissions are dropped | |
| D58 | A docs-only TypeScript 6 for the SDK reference | Yes, once its version and license are confirmed | |
| D59 | Supported topologies; is `pg_dump` a backup? | Compose supported, Fly an example; yes, once HOST-01 is fixed | |
| D60 | The widget contract's page | Published, marked for contributors to the platform | |
| D61 | Vulnerability contact and response time | **The owner's to say** | |
| D62 | Supported versions and the first publish date | **The owner's to say.** Proposed: the newest minor and the one before | |

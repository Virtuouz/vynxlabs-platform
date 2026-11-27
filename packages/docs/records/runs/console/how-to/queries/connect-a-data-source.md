# Run log: console/how-to/queries/connect-a-data-source.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch `phase-31-write-the-docs`).
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin) in Fernhill's Sandbox workspace, at 1440 px, light theme, with Playwright headless. No other width or theme was run, and no keyboard-only pass.
- Everything made for this run starts `qry31`.

## Setup
A database `qry31src` was made in the instance's own Postgres (localhost:54329) with a table `loans` (serial primary key, device, borrower, due, returned, notes jsonb, three rows), a keyless table `scans` and a view `open_loans`. The instance's `EGRESS_ALLOW` lists loopback.
## The steps as followed
1. **Data > Data sources** (empty: "No data sources yet", two buttons **Declare source** and **Connect database**). **Declare source** opened `resources/new/data_source`: "New data source", **Path of the new data source**, **What it is for**, **Save draft**. Path `qry31-loans`, **Save draft**: the editor showed **Draft**, **Name and path**, **Discard draft**, **Save draft**, **Deploy**. **Deploy** offered **This change only** and **Review all drafts**; **This change only** deployed it.
2. The list showed `qry31-loans`, its purpose, **Not set up here**, "Nothing deployed uses it", **Edit** and **Connect** (its accessible name is "Connect qry31-loans").
3. **Connect**: fields Host, Port, Database, User, Password, Schema, Encrypt the connection (**Yes** first and selected). Filled localhost, 54329, qry31src, platform, a password, and chose **No** (the local server has no certificate). **Connect qry31-loans**: the row read "qry31src on localhost, as platform", Password **Set**, Health **Not tested**.
4. **Test**: **Reached**, "1 ms · tested just now".
5. The source's page: tables `loans` and `scans` (the view `open_loans` is not listed), filter boxes, **Keys**, a columns button, **Compact rows**, **Add row**. `scans`: "This table has no primary key, so rows can be added but not changed or deleted." and no **Keys**.
6. **Change** with port 1 and no password: "The host, port, user or encryption changed, so the stored password will not be sent there. Type the password again." With port 1 and the password typed, **Test** said **Failed** with "The data source "qry31-loans" could not be reached. Check its address." Changed back to 54329 and **Test**: **Reached**.
7. **Remove from here**: the dialog "Remove from here?" with the text in the page. After it the row was **Not set up here** and **Connect database** listed the source in its **Source** choice (with its purpose). Connected again through **Connect database**.
## What differed
- The Add row sheet on `loans` required `id` ("id needs a value.") although the database fills it from a sequence.
- The screen's text says "the platform" (list description, page description, Connect description). The page does not quote it.
## Not run
- Encrypt **Yes** against a database that has a certificate. The refusals other than "could not be reached". A person with `data_source:read` only. A source in a production workspace. 390 px and dark. Removing the declaration: at the end of the run **Edit** > **Remove** ("Remove this data source? This saves a draft that removes it. Nothing changes until that draft is deployed.") was pressed and the removal deployed through the API.

## Second run, 2026-11-23 (second agent)
- Instance http://localhost:8091 at commit `87000022`, headless Chromium. Done in a tenant of the checker's own, `qry31chk` (workspace Sandbox, dev): Ann Qry (`tenant_admin`), Vic Qry (`viewer`), Wes Qry (`app_maintainer`), a table `visits`, a data source on the local Postgres. Fernhill's people and data were not used.
- Encrypt **Yes** against a database with no SSL: Change to **Yes** was saved ("chk-loans was changed."); **Test**: **Failed**, "The server does not support SSL connections"; the source's page: "Internal Server Error" and **Try again**. Changed back to **No**: the stored password was dropped ("No password is set for the data source…"), as the page says; set again, **Reached** (10 ms). The page gained that line.
- A member with `data_source:read` only (Vic): list: **Declare source**, **Connect database**, **Test**, **Change**, **Remove from here** disabled, **Edit** not. The source's page: **Test** "chk-loans: reached."; **Change** opens and is refused "needs the data_source:write permission."; **Add row** disabled with the read-only line. The page's last bullet was corrected.
- 390 px and dark: Data sources list, Change drawer, source page: no horizontal overflow. At 390 px the Health cell is cut to "F…" and "tested…" and the row's buttons run past the card (a product fault, in the record). Dark reads well.
- Keyboard: the Change drawer opened with focus on **Host**. Escape was not tried.
- Not run: **Encrypt Yes** against a database that has a certificate (no TLS Postgres here, no internet); a source in a production workspace.

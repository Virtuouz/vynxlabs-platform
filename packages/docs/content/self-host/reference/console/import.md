---
title: Import a tenant
topic: instance-import
description: "Every control, state and permission of the Import a tenant screen: uploading an export, the check, uploads that wait, the import and what arrives with the tenant."
subjects: [instance, tenants, portability]
moved_from:
  - instance/import
---

The **Import a tenant** screen brings a tenant that was exported from another instance (or from this one) into this instance, as a new tenant, whole or not at all. It works in three steps. You upload the export file, which is checked from end to end and kept on the instance for an hour, and you import it. Nothing is written to the tenant list until you press **Import tenant**. The screen is in the **Instance** area. F1 (**Help for this page**) opens the help topic `instance-import`.

An export is made by the tenant's own admin, from the tenant's [Export](../../../administer/reference/screens/export) screen or with `volvel tenant export`. See [Move a tenant](../../how-to/instance/moving-a-tenant) for the whole journey.

::screenshot{name=self-host/instance-import-check alt="The Check step of Import a tenant: the tenant's name, the export's date and version, workspaces, rows and members, the Can it come in list with each line passing, the Not carried list and the passphrase and slug fields."}

The title is **Import a tenant**. The description reads "Brings a tenant exported from another instance into this one, whole or not at all. Upload the file first: it is checked from end to end and kept for an hour, and nothing is written until you import it." A stepper shows **Upload** ("The export file"), **Check** ("What it holds") and **Import** ("As a new tenant").

## Controls

### Step 1, Upload

| Control | What it does |
| --- | --- |
| **Uploads that wait** | Shown above the form when files were uploaded and not yet imported. "Checked and not imported yet. Each is kept for an hour after it came, then removed." Each shows the tenant's name, the file's name and size, and "kept until TIME". The list survives a reload. **Open** goes to the Check step for that file. **Throw away** asks "Throw away FILE? The file is removed from the instance. The export it came from is not touched." A file kept by another replica of the control plane shows "Another replica keeps the file: upload it again" and offers only **Throw away**. |
| **Export file** | A file chooser for a `.tar` export. Required. |
| **Its passphrase** | Optional here. "With it, the check also says whether it opens the file." Sent in the header `x-export-passphrase`, not in the address. |
| **Upload and check** | Uploads the file (the button says "Uploading…") and opens the Check step. |

Under the form: "The export must come from an instance at the same version as this one. For a large file, use the command line: `volvel tenant import <file>`." The limit is 50 GiB for one file. A larger one is refused with 413 "The export is larger than this instance accepts."

### Step 2, Check

The panel shows the tenant's name (or the file's name when it cannot be read), the file's name, size and "kept until TIME", and the tenant's slug.

| Line | What it shows |
| --- | --- |
| **Exported** | When. |
| **From version** | The version of the instance that wrote it. |
| **Workspaces** | Each name and its type, or "None". |
| **Rows** | The number of rows in the file. |
| **Members** | How many members. |
| **Run history** | "Included" or "Left out of the export". |
| **Unfinished runs** | Shown when there are some: "N, recorded as canceled". |

Under **Can it come in** each line passes, warns or fails:

| Line | Meaning |
| --- | --- |
| "Made by an instance at this version" / "Made by an instance at another version: upgrade one of them first" | The migration level must be the same. |
| "The passphrase opens it" / "The passphrase does not open it" / "Passphrase not checked yet" | Needs the passphrase typed below. |
| "Its list of contents is signed with its key, and the signature is right" | Format 2. |
| "Format 1 has no signature: nobody vouches that the file is as its author wrote it. It is held to the tenant's own rows and files, but import it only from a source you trust" | A warning, not a failure. An older export. |
| "Signature not checked yet: enter the passphrase" | |
| "The tenant is not here yet" / "This tenant is on this instance already" | Importing is refused while the tenant is here. Delete it first, or [move it](../../how-to/instance/moving-a-tenant) deliberately. |
| "Its slug is free here" / "Its slug is taken here: choose another below" | Not shown when the tenant itself is here. |

A file that is not a tenant export, is damaged, was changed, or is in a format this instance does not read is refused with its reason (`import_refused`, 400): for example "This file is not a tenant export." or "The export is damaged: PATH is not what was written."

**Not carried** lists what an export never holds, so you know what to make again where the tenant arrives: API keys, worker credentials, operator access grants, runs that were queued or running, end users' sign-ins and unused links, hostnames registered for apps, provisioning tokens and refused pushes, refused webhook requests, how sources answered their last check, single sign-ins in progress, connection authorizations in progress, approval links sent by mail, promotion requests waiting, a copy of a workspace being made, members' saved views, passwords of members who also belong to another tenant or run the instance, recovery codes, and audit entries older than the tenant's retention. Each is said on the screen in its own sentence.

Then the form:

| Field | What it takes |
| --- | --- |
| **Its passphrase** | Required. The passphrase the export was made with. |
| **Slug on this instance** | Optional. "Leave empty to keep the slug it had." Same rules as when creating a tenant. |
| **Where its custom tables go** | "The instance's own database", or a registered [database location](databases). |

The check runs again by itself 600 ms after the slug or the passphrase stops changing. **Check again** runs it now.

| Button | What it does |
| --- | --- |
| **Check again** | Asks the check again with what is typed. |
| **Import tenant** | Imports. It is enabled only when the last verdict was made with the slug and the passphrase that are typed now, the passphrase opens the file, the migration level matches and neither the tenant nor the slug is already here. While it works it says "Importing…". |
| **Throw it away** | Removes the uploaded file from the instance, and returns to Step 1. |

### Step 3, the result

A notice reads "NAME was imported: N rows and N stored objects. Members created: N. Members linked to accounts already here: N." Under it:

- Where the custom tables are: "the database location "NAME"" or "the instance's own database".
- "The workspace arrived with its triggers paused. Resume it when the instance it came from has stopped." or "All N workspaces arrived with their triggers paused. Resume each one when the instance it came from has stopped." (also said as "All 0 workspaces" when the tenant has none).
- "N runs and N flow runs were unfinished in the export, and are recorded as canceled." when there were some.
- "Not carried: …" for each item above.

The buttons are **Open the tenant** and **Import another**.

### What arrives

The tenant keeps its IDs. Every workspace arrives with its triggers paused, git sync paused, identity providers paused and domains unproved, so that two instances never both act. Unfinished runs are recorded as canceled. Members are matched by ID, then by email. A member who already has an account here keeps that account and its password, and everything in the file that names them is rewritten to name it. Another member is created. In a format 2 export their password is carried sealed under the passphrase, and only for members who belong to no other tenant and hold no instance role. A member created without a password needs one set: see [All members](members). A file that names one account by ID and another by email is refused.

The import is all or nothing. It writes `tenant.imported` to the tenant's own log, and `tenant_import.staged` and `tenant_import.discarded` to the [instance audit log](audit-log).

## States

| State | What you see |
| --- | --- |
| No waiting uploads | Only the form. |
| Uploads that wait do not load | An error state with a retry, above the form. |
| The upload is not on this replica | "The uploaded file is no longer here: another replica of the control plane kept it, or it was removed. Upload it again." |
| A problem in the file or the request | A red notice with the server's words. |
| Passphrase not typed | The check's passphrase and signature lines say "not checked yet"; **Import tenant** is disabled. |

A staged file is kept for 1 hour from the upload. A replica that did not receive an upload cannot import it, so behind several replicas use sticky routing for this screen, or import with the CLI, which does not stage.

## Permissions

| Action | Needs |
| --- | --- |
| Upload, **Open**, **Check again**, **Import tenant**, **Throw away** | `tenant:write` at the instance. |

The screen is not grayed for a person without it: the server refuses with a 403 and the reason.

From a terminal: `volvel tenant import <file> [--slug <slug>] [--location <name>]` with an operator's API key, and the passphrase in `VOLVEL_EXPORT_PASSPHRASE`. It checks and imports in one step and does not stage the file.

## Related

- [Move a tenant](../../how-to/instance/moving-a-tenant)
- [Database locations](databases)
- [All tenants](tenants): deleting the tenant that is here.

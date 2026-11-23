---
title: Export a tenant
description: "Download everything a tenant has as one file with a passphrase, in the console or with the command line, and know what the file does not carry."
subjects: [export, portability]
---

## Export a tenant

By the end you have a file with everything the tenant has, sealed where it must be, for keeping or for an operator to import elsewhere.

## Before you start

- You hold `export:write` on the tenant.
- A passphrase of at least 12 characters, which you will pass on separately from the file. It is not stored: without it the secrets and members' passwords cannot be read.
- Room for the file. History can make it much larger.

## Steps

:::tabs
::::tab{label="Console"}
:::steps
1. Open **Tenant**, then **Export**.
2. Type a **Passphrase** and type it again in **Passphrase again**. "Use at least 12 characters." and "The two do not match." say what is wrong.
3. Under **Run, flow and event history**, choose **Leave it out** or **Include it**.
4. Press **Export tenant**. The button reads "Exporting…" and the browser downloads `<slug>-<date>.tar`, for example `sso-wave-2026-11-23.tar`.
:::
::::
::::tab{label="Command line"}
```bash
VOLVEL_EXPORT_PASSPHRASE='a passphrase of at least 12 characters' volvel tenant export --tenant fernhill --out fernhill.tar --history
```

The command prints `Exported <slug> to <file> (<size> MB).`, then says whether history is in it. Leave `--history` off to leave the history out. Use this for a large tenant: the console's download is held in the browser's memory.
::::
:::

## What to do with the file

The file as a whole is not encrypted. Only secrets and members' passwords are sealed by the passphrase. Rows, files, the audit log and history are readable by anyone who has the file, so keep it somewhere access is controlled. See [Export format](../../reference/sso/export-format) for what is in it.

## What it does not carry

"The export was downloaded. API keys and worker credentials are never in an export: make new ones wherever the tenant goes." Also not carried: hostnames, provisioning tokens, operator access grants, sign-ins in progress, and the audit log older than the tenant's retention period. A member who also belongs to another tenant, or runs the instance, is exported without a password.

## The result

A file named `<slug>-<date>.tar` that any tar program lists, with `manifest.json` last. Its `notCarried` says what was left out.

## If it does not work

| You see | Cause and fix |
| --- | --- |
| **Export tenant** is disabled, or does nothing | The passphrase is shorter than 12 characters or the two differ. With nothing typed the button is on, and pressing it does nothing. |
| `Set VOLVEL_EXPORT_PASSPHRASE to the passphrase for the export file.` | The command line reads the passphrase only from that variable. |
| `Could not export <slug>. The request body is not valid.` and `must NOT have fewer than 12 characters` | The command line's passphrase is too short. |
| A red notice after pressing it | The server's reason. A person without `export:write` sees "You can see this tenant's export, not change it. It needs `export:write`." |
| The browser runs out of memory | Use the command line. |

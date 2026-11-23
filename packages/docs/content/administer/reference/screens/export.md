---
title: Export
topic: tenant-export
description: "Every control, state and permission of the Export screen: the passphrase, the history switch, what the downloaded file is, and the command line's way."
subjects: [export, portability]
moved_from:
  - tenant/export
---

The **Export** screen downloads everything the tenant has as one file: resources, bindings, secrets, members, the audit log, tables and files. It is for keeping, or for taking to another instance, where an operator imports it. The screen is under **Tenant**, in the group **Governance**. F1 opens the help topic `tenant-export`.

The file is named `<slug>-<date>.tar`, for example `sso-wave-2026-11-23.tar`. Its layout is in [Export format](../sso/export-format).

## Fields

| Field | What it takes |
| --- | --- |
| **Passphrase** | At least 12 characters: "Use at least 12 characters." shows at the field below that. It protects every secret in the file, and the password of each member who belongs to this tenant alone. It is not stored. |
| **Passphrase again** | Must match: "The two do not match." |
| **Run, flow and event history** | **Leave it out** (default) or **Include it**. "History can make the file much larger." |
| **Export tenant** | Runs the export and downloads the file. It reads "Exporting…" and is disabled while it works, and while the passphrases are short or differ. |

When the file is downloaded, a notice says: "The export was downloaded. API keys and worker credentials are never in an export: make new ones wherever the tenant goes." Under the form a paragraph says the passphrase protects the secrets and members' passwords in the file, that a member who also belongs to another tenant or runs the instance is exported without a password, and that the rest of the file, rows and files included, can be read by anyone who has it.

The browser holds the whole file in memory before it saves it. For a large tenant, use the command line.

## The command line

```bash
VOLVEL_EXPORT_PASSPHRASE='a passphrase of at least 12 characters' volvel tenant export --tenant sso-wave --out sso-wave.tar --history
```

`--history` includes run, flow and event history. `volvel tenant import <file>` brings a file into an instance, for operators.

## States

| State | What you see |
| --- | --- |
| Failed | A red notice with the server's reason. |
| Read only | "You can see this tenant's export, not change it. It needs `export:write`." |

## Permissions

| Action | Needs |
| --- | --- |
| Export the tenant | `export:write` |

## Related

- [Export a tenant](../../how-to/sso/export-a-tenant)
- [Export format](../sso/export-format)

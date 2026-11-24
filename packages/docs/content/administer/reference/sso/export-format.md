---
title: Export format
description: "What a tenant export file is: a tar archive, its parts, how secrets and members' passwords are sealed, what is always in it, what is never, and how an import treats it."
subjects: [export, portability]
---

A tenant export is everything one tenant has on an instance, in one file. This page is for reading it, and for knowing what an import does with it. The full contract, for people writing their own reader, is `docs/contracts/tenant-export.md` in the repository. The file is made on [Export](../screens/export) or with `volvel tenant export`. It is format version 2. An import still reads version 1.

## The file

A tar archive of regular files, in the POSIX ustar layout. Any tar program lists and unpacks it.

| Path | Contents |
| --- | --- |
| `key.json` | The tenant's encryption key, wrapped with the passphrase. |
| `members.NNNN.jsonl` | The tenant's members. |
| `platform/<table>.NNNN.jsonl` | The rows of one table that belong to the tenant, one JSON object a line. |
| `data/catalog/…` | The catalog of the tenant's custom tables. |
| `data/<workspace id>/<table>.NNNN.jsonl` | The rows of one custom table. |
| `objects/<key>` | One stored object, byte for byte: a bundle, an uploaded file, or a large payload. |
| `manifest.json` | The list of contents. Always last. |

Large tables are split into parts of about 4 MB, numbered from `0001`.

## What the passphrase protects

The passphrase wraps the tenant's data key with scrypt and AES-256-GCM. Every secret, connection credential, data source password and webhook token in the file is ciphertext under that key. A member's password hash, as `password_sealed`, is sealed the same way. Nothing in the file can be read as a secret without the passphrase, and the passphrase is not stored anywhere.

**The file as a whole is not encrypted.** Rows, files, the audit log and history are plain JSON and plain bytes, so that the file can be read without Volvel. Whoever has the file can read them. In particular, history holds each run's input and output as they were, including anything sent to a webhook. Keep the file where access is controlled, and encrypt it yourself if it travels.

The instance's own master key is never in it.

## The manifest

| Field | Meaning |
| --- | --- |
| `format`, `formatVersion` | `volvel-tenant-export` and `2`. |
| `coreVersion`, `migrationLevel` | The version and database level that wrote the file. An import needs the same level. |
| `exportedAt` | When. |
| `tenant`, `workspaces` | The tenant's ID, slug, name and the switch for managed workers; each workspace's ID, slug, name and type. |
| `history` | Whether run, flow and event history is included. |
| `counts` | Rows per table. |
| `pendingRuns` | Runs that were queued or going. |
| `notCarried` | In words, everything the export leaves out. |
| `entries` | Every other file with its size and SHA-256. |
| `authentication` | An HMAC-SHA-256 of the list, keyed from the tenant's data key. Only someone who can open `key.json` with the passphrase can make it. |

The file is read from one snapshot of each database, so it is the tenant as it was at one moment.

## Always, and only with history

Always: workspaces, resources and their versions, bundles and deployments, apps' files, roles, bindings, groups and members, groups of end users, identity providers with their domains, links and group mapping, service accounts, bindings of connections and data sources, variable values, secrets, triggers with webhook addresses, flow layouts, files, custom tables, members and their dashboards, end users, the tenant's branding and logo, and the audit log.

Only with history: runs and their logs, flow runs and their steps, events, and the payloads they point at.

## Never

| Left out | Why, and what to do |
| --- | --- |
| API keys and worker credentials | Make new ones where the tenant goes. |
| Operator access grants | They belong to the instance the tenant leaves. |
| Runs that were queued or going, and work handed to workers | A run belongs to the instance that started it. With history, a waiting run arrives recorded as canceled. |
| End users' sign-ins, and unused invitation and reset links | People sign in again with the password they had. |
| Hostnames registered for apps | A name points at one instance. Register it again. |
| Provisioning tokens, and refused pushes | A directory is given a new token at the new address. |
| Refused webhook requests, sign-ins in progress, approval links sent by mail, saved views | They answer to the instance that made them. |
| Passwords of members who also belong to another tenant or hold access at the instance | Their account is for the whole instance. |
| Recovery codes | They are a member's own. |
| The audit log older than the tenant's retention period | It is cut at the period. |
| The instance master key | Never. |

The manifest's `notCarried` says all of this, line by line, in the file itself.

## What an import does

An import does these, in this order:

| Step | What it does |
| --- | --- |
| Reads the manifest | Checks every file's size and SHA-256 before writing anything. |
| Checks the level | Requires the same `migrationLevel`, and refuses a file from an older or a newer version, naming both. |
| Opens the key | Opens the key with the passphrase, and checks `authentication`. A format 2 file without a right one is refused. |
| Checks the names | Refuses when the tenant's ID or slug is taken. A different slug can be given. |
| Matches members | By email. A member who already has an account keeps it, with their own password. |
| Loads the tables | Keeping the IDs, and holding each row to the file's own tenant. |
| Pauses | Every workspace's triggers, the repository's sync and every identity provider, and marks every provider's domains as not proved. A paused provider signs nobody in and requires nothing. |
| Counts | What arrived against `counts`. Any difference undoes the whole import. |

Either the whole tenant arrives or none of it does. The steps after an import, for single sign-on, are in [Connect an OIDC provider](../../how-to/sso/connect-an-oidc-provider).

# Tenant export format

Format version 1. Last updated: 2026-11-12

A tenant export is everything one tenant has on an instance, in one file. It is what makes the ownership promise something a tenant can act on: the file can be kept as it is, read without the platform, or imported into another instance.

This document describes the file. It is a contract in the same sense as the manifest format and the worker protocol: a later version of the platform keeps reading format 1, or says clearly that it does not.

## The file

A tar archive in the POSIX "ustar" layout, holding only regular files. Any tar program lists and unpacks it.

| Path | Contents |
| --- | --- |
| `key.json` | The tenant's encryption key, wrapped with the export's passphrase. Always present: a tenant that never stored a secret is given its key when it is first exported, so that a wrong passphrase is always refused |
| `members.NNNN.jsonl` | The tenant's members |
| `platform/<table>.NNNN.jsonl` | The rows of one platform table that belong to the tenant |
| `data/catalog/data_table.NNNN.jsonl`, `data/catalog/data_column.NNNN.jsonl` | The catalog of the tenant's custom tables: every table and column, active or retired, with the names they have in the database and the names they had before |
| `data/<workspace id>/<table>.NNNN.jsonl` | The rows of one custom table, under its name in the database |
| `objects/<key>` | One object from the object store, byte for byte: a bundle, an uploaded file, or a payload too large to keep in a row |
| `manifest.json` | The list of contents. Always the last file |

Large tables are split into parts of about 4 MB, numbered from `0001`. The parts of a table, read in order, are the table.

## Rows

Each line of a `.jsonl` file is one row as a JSON object, with one field per column, written by Postgres itself (`to_jsonb`).

| Column type | In JSON |
| --- | --- |
| text, uuid | string |
| integer, bigint, double precision | number |
| boolean | boolean |
| timestamp with time zone | ISO 8601 string with microseconds and offset |
| date | `YYYY-MM-DD` string |
| jsonb | the JSON value itself |
| bytea | string, `\x` followed by hex digits |
| array | JSON array |

A column with no value, and a JSON column that holds JSON `null`, are both written as `null`. On import both become no value. Nothing that reads the row through the platform can tell them apart.

A custom table's rows carry every column the table has in the database, including retired ones, under the columns' names in the database. The catalog says which column of the definition each one is.

## The key

`key.json` holds the tenant's 32-byte data key:

| Field | Meaning |
| --- | --- |
| `kdf` | `scrypt` |
| `n`, `r`, `p` | scrypt's cost settings |
| `salt` | 16 random bytes, base64 |
| `cipher` | `aes-256-gcm` |
| `wrapped` | base64 of: one version byte (`1`), a 12-byte nonce, a 16-byte tag, the ciphertext |

The wrapping key is `scrypt(passphrase, salt)`, 32 bytes, with the passphrase normalized to Unicode NFKC. The associated data is the text `tenant-export:<tenant id>`.

Every secret, connection credential, data source password and webhook token in the export is ciphertext under the tenant's data key, in the same layout (version byte, nonce, tag, ciphertext), with associated data `secret:<tenant id>:<workspace id>:<name>`. No secret in the file is readable without the passphrase, and the passphrase is not stored anywhere.

**The file as a whole is not encrypted.** Rows, files, the audit log and history are in it as plain JSON and plain bytes, which is what makes it readable without the platform. Whoever holds the file can read them. In particular, history holds each run's input and output exactly as they were, so anything a caller sent to a webhook is there. Treat an export as you would a copy of the database: keep it somewhere access is controlled, and encrypt it yourself if it travels.

The instance's own master key is never in an export.

## Members

Members belong to an instance, not to a tenant, so they are not exported as platform rows. `members.NNNN.jsonl` lists each member of the tenant with `id`, `name`, `email`, `email_verified`, `image`, `created_at` and `password_hash`, the hash they sign in with.

## End users

End users belong to the tenant, so they travel as platform rows: `platform/end_user.NNNN.jsonl`, with `id`, `tenant_id`, `email`, `name`, `password_hash` (the hash they sign in with, or null for an invitation not yet used), `disabled_at`, `last_signed_in_at` and the two timestamps. Bindings name an end user by `id`, which is kept.

Groups of end users travel as `platform/end_user_group.NNNN.jsonl` and `platform/end_user_group_member.NNNN.jsonl`. An end user's `attributes` are a column of `end_user`. A binding to a group names it by `id`, which is kept.

## Single sign-on

`platform/identity_provider.NNNN.jsonl` carries each identity provider with its settings. Its `secrets` column holds the client secret or this side's SAML private key, encrypted under the tenant's key like a secret. `platform/identity_domain.NNNN.jsonl` carries its email domains, `platform/identity_link.NNNN.jsonl` who each of the provider's subjects is, and `platform/identity_group_map.NNNN.jsonl` its group mapping. A link to a member is rewritten with the member, as everything that names a member is.

An import sets `paused` on every provider and clears `verified_at` on every domain. A provider was given the addresses of the instance the tenant came from, and a domain was proved to that instance. A paused provider signs nobody in and requires nothing. Saving it on the importing instance turns it back on, once its administrator has the new addresses, and a provider of members also needs its domain proved again.

Sign-ins that were in flight, and the record of SAML assertions already accepted, are not exported.

## Dashboards

`platform/member_dashboard.NNNN.jsonl` carries each member's dashboards: `id`, `workspace_id`, `member_id`, `title`, `body` (one page, in the shape of a page of an interface), `shared` and `revision`. The member it names is rewritten with the member, as everywhere.

## App files

A bundle in format 2 lists the files of its apps by SHA-256. `platform/bundle_asset.NNNN.jsonl` has one row per file the tenant holds, and the bytes are under `objects/assets/<tenant id>/<sha256>`. A file is stored once however many bundles and workspaces list it.

## Drafts and the repository

`platform/resource_draft.NNNN.jsonl` carries what was saved in the console and not yet deployed. `platform/git_repository.NNNN.jsonl` carries the tenant's repository with its access token, encrypted under the tenant's key like a secret, and `platform/workspace_git.NNNN.jsonl` the branch each dev workspace follows. `platform/git_operation.NNNN.jsonl` is history, and is included only when history is asked for.

An import sets `paused` on the repository. The instance the tenant came from may still push to the same branches, so the importing instance pushes nothing until someone saves the repository's settings there.

A bundle in format 3 carries console-managed resources beside the repository's. Nothing else about bundles in an export changes.

## The list of contents

`manifest.json`:

| Field | Meaning |
| --- | --- |
| `format` | `vynxlabs-tenant-export` |
| `formatVersion` | `1` |
| `coreVersion` | The version of the platform that wrote the file |
| `migrationLevel` | Its database level |
| `exportedAt` | When |
| `tenant` | `id`, `slug`, `name`, `managedWorkers` |
| `workspaces` | `id`, `slug`, `name`, `type` of each |
| `history` | Whether run, flow and event history is included |
| `counts` | Rows per table. A custom table is named `<workspace id>/<table>` |
| `pendingRuns` | Runs that were queued or in progress when the export was made |
| `notCarried` | What the export leaves out, in words |
| `entries` | Every other file: `path`, `bytes`, `sha256` |

The file is read from one snapshot of each database, so it is the tenant as it was at one moment, even if the tenant was working while it was written.

## What is in it, and what is not

Always: workspaces, resources and their versions, bundles and deployments, the files of the bundles' apps, roles, bindings, groups and their members, groups of end users and their members, identity providers with their domains, links and group mapping, service accounts, connection and data source bindings, variable values, secrets, triggers with their webhook addresses, flow layouts, files, the custom tables, the members and their dashboards, the end users, the tenant's branding and its logo, and the audit log.

Only with history: runs and their logs, flow runs and their steps, events, and the payloads they point at.

Never:

- API keys and worker credentials. They are made again where the tenant goes.
- Operator access grants. They belong to the instance the tenant is leaving.
- The queue. A run that was waiting is not carried. With history it arrives recorded as cancelled.
- End users' sign-ins, and invitation and reset links that were not used. People sign in again with the password they had, and staff make new links.
- Hostnames registered for apps. A name points at one instance, so it is registered again where the tenant arrives.
- The instance master key.

## Importing

An import:

1. Reads the list of contents and checks every file's size and SHA-256 against it, before writing anything.
2. Requires `migrationLevel` to equal its own. An export from an older or newer version is refused, with both versions named.
3. Opens the key with the passphrase, and wraps it again with its own master key.
4. Refuses if the tenant's ID or slug is already taken there. A different slug can be given.
5. Matches members by email. A member who already has an account there keeps it, with their own password, and every place the export names them is rewritten to name that account. Other members are created with the hash they had.
6. Loads every table, keeping every ID. Custom tables are built from the catalog exactly as it describes them, their rows loaded, and their rules put back.
7. Sets every workspace's triggers to paused, pauses the repository's sync and every identity provider, and marks every identity provider's domains as not proved.
8. Counts what arrived against `counts`. Any difference undoes the whole import.

Either the whole tenant arrives or none of it does.

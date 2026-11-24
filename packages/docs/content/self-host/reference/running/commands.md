---
title: The control plane's commands
description: "Every command word the control plane takes, what each does, its exit status and how to run it in Compose."
subjects: [install, keys, emergency]
---

The control plane is one program with a few command words. Without one it starts the instance. A word is read before anything else, so `--help` and a mistyped word cost nothing, and a word nobody knows never starts the instance by mistake.

## Running one

| Where | How |
| --- | --- |
| In the image | `node dist/main.js <word>`, or `volvel-start dist/main.js <word>` |
| In Compose, beside a running instance | `docker compose -f deploy/compose/compose.yaml exec control-plane node dist/main.js <word>` |
| In Compose, with the instance stopped | `docker compose -f deploy/compose/compose.yaml run --rm --no-deps -T control-plane node dist/main.js <word>` |
| From a source checkout | `node apps/control-plane/dist/main.js <word>` |

A command that reads the settings reads them from the environment of the container it runs in.

## Commands

| Word | What it does | Exit status |
| --- | --- | --- |
| none | Starts the instance. | Runs until stopped. |
| `check-config` | Reads the settings, says what is wrong with them and exits. Opens nothing. Prints "The settings are valid." | 0 when valid. 1 when not, after listing every problem. |
| `migrate` | Brings the database up to this version and exits. The instance does this itself at start. Prints "The database is up to date, at level N." or "Migrations applied: N. ..." | 0. 1 when a migration fails. |
| `rekey` | Seals again with `MASTER_KEY` whatever `MASTER_KEY_SECONDARY` sealed, prints what it did as JSON and exits. | 0. 1 when a value opened with neither key, or the rewrap failed. |
| `rekey --data-role` | Does the same and also changes the seed of the data role's password. Stop every replica first and start them after. Audited as `instance.data_role_rekeyed`. | As `rekey`. |
| `recover-operator <email>` | Enables that account, makes it an operator admin, prints a new password once and ends its earlier sign-ins. | 0. 1 when the account does not exist or fails. 2 without an email. |
| `--help`, `-h`, `help` | Prints the usage and exits. | 0. |
| An unknown word | Prints "<word> is not a command." and the usage. | 2. |

`rekey` and `recover-operator` migrate the database, then run and exit before the instance listens.

## Examples of what they print

```text
$ node dist/main.js check-config
Invalid configuration:
  DATABASE_URL is required.
  PUBLIC_URL must be a URL starting with http: or https://.
  AUTH_SECRET is required.
```

```text
$ node dist/main.js recover-operator ops@example.com
ops@example.com is an enabled operator admin. Its password is now: <24 characters>
Sign in with it and change it. Every earlier sign-in of that account has ended.
```

Related: [Rotate the master key](../../how-to/running/rotate-the-master-key), [Recover an operator](../../how-to/running/recover-an-operator), [How an instance starts](../../explanation/running/architecture).

---
title: The master key, tenant keys and AUTH_SECRET
description: "What the master key seals, what a rotation does and does not touch, how the data role's seed differs, and what AUTH_SECRET signs."
subjects: [keys, secrets]
---

An instance holds two secrets that it cannot recover for you: `MASTER_KEY` and `AUTH_SECRET`. They do different jobs, and losing them costs different things.

## The idea

**`MASTER_KEY`** is 32 random bytes, base64 encoded. It wraps one key for each tenant, and it seals a few things the instance owns itself:

- the addresses of database locations;
- the secrets of the instance's identity providers;
- sign-ins in progress;
- the seed the data role's password and signing key are made from.

A tenant's own secrets (secret values, connection credentials, data source passwords, webhook tokens) are sealed with that tenant's key, bound to the tenant, workspace and name they belong to. So rotating the master key rewraps the tenants' keys and those few values. It never touches a tenant's secrets one by one, and takes seconds even on a large instance.

Without the master key, no stored secret can be read again. Keep a copy somewhere that is not the instance's own disk. A wrong `MASTER_KEY` stops the instance at start, when it cannot open the data role's seed.

**`AUTH_SECRET`** (at least 32 characters) signs the console's sign-in cookies. The DNS records that prove a hostname or a single sign-on domain (`_vx-challenge`) are made from it. It seals nothing: API keys, bundles, secrets and runs do not depend on it.

## A second key

The instance can hold `MASTER_KEY_SECONDARY` as well. It opens whatever either key sealed, and seals only with `MASTER_KEY`. While it is set, the instance seals again with `MASTER_KEY` whatever the second key sealed:

- at start;
- every ten minutes;
- when you run `rekey`.

`GET /api/v1/instance/master-key` and the Health screen say where each value stands. The answer carries `secondaryRemovable: true` when nothing is left under the second key, and lists `unopened` values: ones no key opens. Those are reported, by place and row, and never changed.

A value sealed under a key you no longer hold is gone. Backups taken before a rotation were sealed with the old key, so keep each key for as long as the backups it sealed.

## The data role

Every request for a tenant's rows signs in to Postgres as one extra role per database, which owns nothing, so row policies apply to it. Its password and signing key are made from a seed, kept sealed in the database, which was the first master key the instance had. A rotation does not change them.

`rekey --data-role` makes a new random seed. Each replica makes the role's password and key from it as it starts. A replica left running on the old seed cannot read tenants' tables until it is restarted, so stop every replica first. The change is recorded in the audit log as `instance.data_role_rekeyed`.

## Where the numbers show

| Where | What it says |
| --- | --- |
| `GET /api/v1/instance/master-key` | The fingerprint of each key, how many values each key holds by place, `unopened`, `secondaryRemovable`. |
| **Instance**, then **Health** | The same, as the [Health screen](../../reference/console/health) words it. |
| `node dist/main.js rekey` | What it rewrapped, the same counts, and exit 1 if a value opened with neither key. |

Related: [Rotate the master key](../../how-to/running/rotate-the-master-key), [Change AUTH_SECRET](../../how-to/running/change-auth-secret), [the commands](../../reference/running/commands).

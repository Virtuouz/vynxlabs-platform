---
title: Rotate the master key
description: "Move an instance to a new MASTER_KEY, with one replica or several, check that nothing is left under the old key, and change the data role's seed."
subjects: [keys, secrets]
---

## Rotate the master key

By the end every value the master key seals is sealed with a new key, and the old one is no longer set. This procedure was run on a Compose stack for this page, with one replica and with two.

## Before you start

- You can edit the instance's `.env` and restart it, and you are an operator with `instance:read` to read the status.
- Keep the old key. **Backups taken before a rotation need the old key.** Keep each key for as long as the backups it sealed.
- Read [The master key, tenant keys and AUTH_SECRET](../../explanation/running/keys-and-secrets) once.

## With one replica

:::steps
1. Make the new key: `openssl rand -base64 32`. Keep it with the old one.
2. In `.env`, set the new key as `MASTER_KEY` and the old one as `MASTER_KEY_SECONDARY`. Restart: `docker compose -f deploy/compose/compose.yaml up -d --wait`. The values move at start.
3. Read the status. As an operator, `GET /api/v1/instance/master-key` (or **Instance**, then **Health**). It says `"secondaryRemovable": true` when nothing is left under the old key, and `"unopened": []` when every value opened.
4. To move anything left, or to check, run the command and read what it did:

   ```bash
   docker compose -f deploy/compose/compose.yaml exec control-plane node dist/main.js rekey
   ```

   It prints the two keys' fingerprints, what it rewrapped, what each key now holds, and the values no key opens. It exits 1 if a value opened with neither key.
5. Empty `MASTER_KEY_SECONDARY` in `.env` and restart.
:::

## With several replicas

A replica that knows only the old key cannot open what a replica with the new one has sealed. Add the new key before using it.

:::steps
1. Restart every replica with the old key as `MASTER_KEY` and the **new** one as `MASTER_KEY_SECONDARY`. Nothing moves yet. Every replica can now open both.
2. Restart every replica with the two swapped. Values move to the new key as replicas start. A pass every ten minutes catches any sealed meanwhile by a replica not yet restarted.
3. When the status says `secondaryRemovable`, restart without the second key.
:::

## Change the data role's seed

A rotation does not change the data role's password, which comes from a seed kept in the database. To change it:

:::steps
1. Stop every replica of the control plane and the worker host.
2. Run, once, with the same settings:

   ```bash
   docker compose -f deploy/compose/compose.yaml run --rm --no-deps control-plane \
     node dist/main.js rekey --data-role
   ```

   It prints the result with `"dataRole": "changed"`, and says "The data role's seed is changed. Restart every replica now: until it is, it cannot read tenants' tables." The change is recorded in the audit log as `instance.data_role_rekeyed`.
3. Start every replica again.
:::

## The result

`GET /api/v1/instance/master-key` shows the new key's fingerprint as `masterKey` and `secondaryKey: null`, and every value counted under `current`. In the run for this page the new key's fingerprint was shown after the restart, the file and rows of a tenant were still readable, and so were they after `rekey --data-role` and a restart.

## If it does not work

- **`rekey` exits 1 and lists `unopened`.** A value was sealed with a key that is neither set. The status and the command say the place and row. They are never changed. Set the key they were sealed with as the second key.
- **The instance stops at start with "MASTER_KEY_SECONDARY is the same as MASTER_KEY".** Remove it, or set it to the other key of the rotation.
- **A replica reads no tenant's tables after `--data-role`.** It is still on the old seed. Restart it.
- **"MASTER_KEY must be 32 bytes, base64 encoded."** Make it with `openssl rand -base64 32`.

Related: [Change AUTH_SECRET](change-auth-secret), [the commands](../../reference/running/commands).

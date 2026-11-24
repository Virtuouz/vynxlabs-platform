---
title: Upgrade an instance
description: "Move an instance to a newer version, what runs on its own at start, and how to go back with a backup."
subjects: [upgrade, backup]
---

## Upgrade an instance

By the end the instance runs a newer image on the same data.

## Before you start

- A [backup](back-up-an-instance). There is no downgrade: you go back by restoring it.
- The new image, built or loaded on the machine ([Build the image from source](build-the-image)).
- Standalone workers should run the same version as the instance. Upgrade the instance first.

## Upgrade

:::steps
1. Check where you are: `GET /api/v1/instance` answers the `coreVersion` and the `migrationLevel`.
2. Update the repository to the version you want and build the image, or load it.
3. Start the new image:

   ```bash
   git pull
   docker compose -f deploy/compose/compose.yaml up -d --build --wait
   ```

   Migrations run on start and move forward only. You can upgrade from any earlier version straight to the newest.
4. Check `GET /api/v1/readyz` and `GET /api/v1/instance`.
:::

To run migrations without starting the instance, run `node dist/main.js migrate`. It says "The database is up to date, at level N." or how many it applied.

## The result

The instance reports the new version and migration level. Bundles that tenants deployed before the upgrade keep running, and can still be redeployed, promoted and rolled back to. Each version states the oldest bundles it still runs, and refuses older ones with a message that says to rebuild.

## Go back

Stop the new image, and [restore](restore-an-instance) the backup you took, with the older image. A newer image refuses nothing; an older image started on a newer database refuses to start with "The database is at migration N but this build only knows migrations up to M."

## If it does not work

- **The instance does not start and the log names a migration.** The database was changed by hand, or a migration file changed: the instance checks each applied migration's checksum.
- **"The database is at migration N but this build only knows migrations up to M."** An older image was started on a newer database. Start the newer image.

Related: [Upgrade Postgres to a newer major version](upgrade-postgres), [Supported versions](../../reference/running/versions-and-support).

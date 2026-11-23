---
title: Use your own object store
description: "Point an instance at an S3-compatible store you run, with the rights it needs."
subjects: [install, database]
---

## Use your own object store

By the end the instance keeps bundles, uploaded files and large payloads in a bucket you run, and the bundled store is not started.

## Before you start

- A bucket, and a key that may do `HeadBucket`, `GetObject`, `PutObject` and `DeleteObject` on it. The instance lists nothing, and needs no bucket policy, versioning or lifecycle rule of its own.
- `CreateBucket` is asked only when `HeadBucket` answers 404, so an account that may not create buckets works once the bucket exists.

## Set it up

:::steps
1. In `deploy/compose/.env`, take `objectstore` out of `COMPOSE_PROFILES`.
2. Add the store's details:

   ```bash
   S3_ENDPOINT=https://s3.example.com
   S3_BUCKET=volvel
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   ```

   `S3_REGION` is `us-east-1` unless you set it. `S3_FORCE_PATH_STYLE` is `true` unless you set it: most stores other than Amazon's need the bucket in the path. For Amazon's S3, set `S3_ENDPOINT=` to nothing and `S3_FORCE_PATH_STYLE=false`.
3. Restart: `docker compose -f deploy/compose/compose.yaml up -d`.
:::

## The result

`GET /api/v1/readyz` shows `objectStore` `ok`. The control plane checks the bucket at start and in each readiness check. Requests to the store time out after 60 seconds, and connecting after 5.

## If it does not work

- **The instance stops at start naming the store.** Any answer to `HeadBucket` other than 404 stops it, such as 403 for a bucket that is not yours. Fix the bucket or the key.
- **A file is asked for and is missing.** The database names a file the store does not have. That is said when the file is asked for, and not before. It comes from a database and a store restored from different moments.

Related: [Back up an instance](back-up-an-instance), [Settings](../../reference/settings).

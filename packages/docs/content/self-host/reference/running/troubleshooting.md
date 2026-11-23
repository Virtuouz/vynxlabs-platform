---
title: Troubleshooting an instance
description: "Symptoms an operator meets, what each means and where to look or which page to follow."
subjects: [emergency, monitoring]
---

Find the symptom, then the cause, then the page. Every message is as the instance words it.

## Starting

| What you see | Cause | What to do |
| --- | --- | --- |
| The container restarts on start, and the log names a setting | A setting is missing or malformed. Every problem is listed at once. | Fix them. `check-config` lists them without starting. See [Commands](commands). |
| The worker host restarts: "MANAGED_WORKER_UID must be a positive whole number." (or `_GID`, or "MANAGED_WORKER_USERS must be a whole number from 1 to 60000.") | The Compose file passed an empty value. | Write the defaults into `.env`: [Install an instance with Compose](../../how-to/running/install-with-compose). |
| "The database is at migration N but this build only knows migrations up to M. Run a newer image against this database." | An older image was started on a newer database. | Start the newer image. |
| "Migration N (name) was applied with different contents than the file in this build." | A shipped migration changed. | Use the build the database was made by, or restore. |
| The log says "boot failed" with "Unsupported state or unable to authenticate data" | `MASTER_KEY` is not the key that sealed the instance's data. | Set the right key, or both as a pair. [Rotate the master key](../../how-to/running/rotate-the-master-key). |
| The log says "boot failed" with an error from the store, such as `UnknownError` | `HeadBucket` answered something other than success or 404, such as 403. | Fix the bucket or the key. [Use your own object store](../../how-to/running/use-your-own-object-store). |
| "The instance has no members. Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD and restart ..." | No first operator was made. | Set both and restart. |

## Running

| What you see | Cause | What to do |
| --- | --- | --- |
| `/api/v1/readyz` answers 503 | The body says whether the database or the object store is unreachable or took more than 3 seconds. | Fix that service. |
| `readyz` shows `"readOnly": true`; changes answer 503 `read_only` | The database takes no writes. | [Run on a database that takes no writes](../../how-to/running/run-on-a-read-only-database). |
| A tenant's tables answer 503 | Its dedicated database is down, or a pool waited more than 5 seconds. | The **Database locations** screen shows which. [Sizing and scaling](../../explanation/running/sizing-and-scaling). |
| A tenant's tables answer 422 `too_slow` | A request ran past `DATA_STATEMENT_TIMEOUT_MS`. | Narrow the filter or add an index. |
| Runs stay queued | The run's page says what it waits for, and the tenant's **Workers** page what waits where. | Otherwise read the instance's log and the worker host's log for the worker it tried to start. |
| The worker host logs "a worker could not be started", or "not running as root: starting a worker as another user may fail, and then no worker starts" | The host lacks capabilities, or does not run as root. | [Workers, users and what a script can reach](../../explanation/running/managed-workers-and-isolation). |
| The worker host logs "Give its container CAP_KILL." | The container lacks `KILL`. | Give it `KILL`. |
| A tenant's Workers page says it runs on standalone workers only | The tenant's code is written by someone who is not an operator, and workers are started in `process` mode. | Use a worker host, or run a [standalone worker](../../how-to/running/run-a-standalone-worker). |
| The worker host logs "The control plane's MANAGED_WORKERS is not set to host, so it starts no workers through this host ... Asking again every 30 seconds." | `MANAGED_WORKERS` is not `host`. | Set `MANAGED_WORKERS=host`, or stop the host. |
| A script's run fails with "The script ran out of memory" or "The script was stopped: the machine ran low on memory." | The script went past its `memoryMb`, or the machine ran low. | [Sizing and scaling](../../explanation/running/sizing-and-scaling). |
| A sign-in answers 429 | More than 20 attempts a minute from one address and path. | Check `TRUSTED_PROXIES`: [Put a proxy in front](../../how-to/running/put-a-proxy-in-front). |

## Addresses

| What you see | Cause | What to do |
| --- | --- | --- |
| An app's address answers "Nothing here" | The workspace has no deployed bundle with that app. | Open the workspace's Apps tab. |
| A registered hostname shows the console | The name is not enabled, or the proxy rewrites the `Host` header. | [Put a proxy in front](../../how-to/running/put-a-proxy-in-front). |
| A staff sign-in from an app loops back to the console | The app's address is not `APPS_URL` or an enabled hostname of that tenant. | |
| The Apps list says "Apps built in the repository are not served on this instance yet." | `APPS_URL` is not set. **Instance**, then **Health**, says "Not served yet: set APPS_URL". | Set it, or knowingly set `APPS_ON_CONSOLE_ADDRESS=true`. |

## Mail, imports and keys

| What you see | Cause | What to do |
| --- | --- | --- |
| Invitations are not arriving | `SMTP_URL` and `MAIL_FROM`, or the server. The log names the address that could not be sent to. | [Set up the instance's mail](../../how-to/running/set-up-mail). |
| An import is refused | The message names the reason: the passphrase, the version, a damaged file, or a slug already taken. A tenant import needs an equal migration level. | [Import a tenant](../console/import). |
| `rekey` exits 1 and lists `unopened` | Values were sealed with a key that is not set. | Set it as the second key. |

Related: [Monitor an instance](../../how-to/running/monitor-an-instance), [Recover an operator](../../how-to/running/recover-an-operator).

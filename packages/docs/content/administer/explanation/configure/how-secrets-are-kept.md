---
title: How secrets and credentials are kept
description: "How the instance encrypts a workspace's secrets and the credentials of its connections, who can read them back, and where they are masked."
subjects: [secrets, connections]
---

A workspace holds values that must not leak: API keys, passwords, the key a webhook is signed with, the tokens of an OAuth sign-in. This page says how the instance keeps them, so that you can judge what it protects against and what it leaves to you.

## The idea

Nothing is stored as text. Each value is encrypted before it is written, with a key that belongs to the tenant, and is opened only for the code that is meant to use it. No screen, API call or command returns a value. You can replace one, delete one, or see that one is set, who set it and when. You cannot read one back, and neither can an administrator.

## Keys

The instance has a **master key**, set by the operator as `MASTER_KEY`. It is 32 bytes. It does not encrypt your values. It encrypts, or wraps, one **tenant key** for each tenant. A tenant's values are encrypted with its own key, with AES-256-GCM. The master key never leaves the instance. See [Settings](../../../self-host/reference/settings).

Every encrypted value is bound to where it belongs. A secret is bound to its tenant, its workspace and its name. A value sealed for one workspace does not open in another, and a ciphertext moved from one row to another does not open. This is why a clone with **Safety** off opens each secret and seals it again for the copy.

The credential of a connection, its OAuth tokens, the credential of a connection group member and the password of a data source are bound to the ID of their row, not to a name. A rename, a promotion or a clone does not make one unreadable. A credential that no key opens makes the connection answer 422 `connection_unusable`: "The stored … cannot be read. Someone with connection:write has to enter it again." Saving the connection without typing it again is refused the same way.

An **export** carries a tenant's values. The tenant key is wrapped again with a passphrase of at least 12 characters, which the file's author gives and the instance does not store. Without it the secrets in the file cannot be read.

## Who can use a value

| Who or what | What it gets |
| --- | --- |
| A run of a script that lists the secret under `secrets` | The value, as text, while it runs. A script that did not list the secret is refused: "This needs a declared use of the secret "X"." |
| A run of a script that lists a connection | The connection's client, made on the worker. For an OAuth 2.0 connection the worker is given the access token. It is never given the refresh token or the client secret. |
| A webhook with `verify` | The secret it checks the signature against, on the instance. |
| A clone of a workspace with **Safety** off | The values are opened and sealed again for the copy. |
| Anyone, through the console or the API | The names, who set each and when, and whether a credential is set. Not a value. |

A webhook whose secret is not set tells the sender only "The signature does not match." The operator's record says "The secret X is not set in this workspace."

## Masking

A value a run was given is hidden when the worker reports the run's log lines and its error. It is matched as it is, URL-encoded, escaped for JSON and as base64, and each long line of a multi-line value is matched on its own. It is replaced with `[redacted]`. The run's pages in the console show the masked text. A field is also hidden when its key names a secret, such as `password`, `token`, `api_key` or a name that ends in one, or when its schema marks it `writeOnly`, `format: password` or `x-secret`.

Masking finds text. It does not stop a script from sending a value somewhere. A script that has a secret can write it to a table, to a file or to an API, and a line that was written before a secret was rotated is not masked by its new value. Treat the right to list a secret in a script as the right to use it.

A value shorter than 4 characters is hidden only where it stands as a whole word, so that it does not blank every text.

## What the instance reaches

A connection's address is reached from a **worker**, not from the instance. What a worker may reach is the worker host's firewall: without `WORKER_EGRESS_ALLOW` a script reaches no private, loopback or link-local address. What the instance reaches for a tenant, such as the token address of an OAuth connection, an identity provider, Git and a data source, is `EGRESS_ALLOW`. Both are set by the operator and described in [Settings](../../../self-host/reference/settings).

## What is not there

- A secret has no versions, no history and no expiry.
- There is no way to read a value back, for anyone.

## Related

- [Secrets](../../../console/reference/screens/configure/secrets) and [Connections](../../../console/reference/screens/configure/connections).
- [Who can change what in Configure](../../reference/configure/who-can-change-what).
- [How a connection gets set up](../../../console/explanation/configure/how-a-connection-gets-set-up).

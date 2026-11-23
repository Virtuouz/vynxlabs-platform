---
title: Call the API with an API key
description: Make an API key, send your first request with it, give a program a key of its own through a service account, and revoke a key.
subjects: [api, authentication]
---

## Call the API with an API key

By the end you will have made a key, read your own account with it, and revoked it.

## Before you start

- You are a member of the tenant, and the instance's address is in `VOLVEL_URL`, for example `https://volvel.example.com`. Every route starts with `/api/v1`.
- Any member may make a key for themselves. A key acts as its owner, with the permissions its owner holds, so a key can do nothing its owner could not. See [how the API knows who is calling](../../explanation/api/how-the-api-knows-who-is-calling).
- A key for a program, not a person, belongs to a service account: you need `service_account:write` in the tenant. See the [service accounts screen](../../../administer/reference/screens/service-accounts).

## Make a key and use it

:::steps
1. Make the key in the console. Open **Account**, find **API keys** and press **Create API key**. Give it a **Name** that says where it will be used, such as "My laptop", and choose **Expires**: **Never**, **In 30 days**, **In 90 days** or **In a year**. The key is shown once. Press **Copy the key** now: the console cannot show it again, and **Done** without copying asks "Close without copying the key?".
2. Keep the key where the program reads it, not in the program's text.

   ```bash
   export VOLVEL_KEY=vxk_...
   ```

3. Send a request with the key in an `Authorization` header. `GET /api/v1/me` answers who the key acts as, and which tenants it reaches.

   ```bash
   curl -s -H "authorization: Bearer $VOLVEL_KEY" "$VOLVEL_URL/api/v1/me"
   ```

   The answer names the principal (`"type":"member"`), the instance permissions it holds and the tenants it can see, each with its `id` and `slug`.
4. Use the tenant's `id` in the routes that follow. A workspace's ID is in `GET /api/v1/tenants/<tenant id>/workspaces`.

   ```bash
   curl -s -H "authorization: Bearer $VOLVEL_KEY" \
     "$VOLVEL_URL/api/v1/tenants/$TENANT/workspaces"
   ```

5. Revoke the key when it is not needed. In **Account**, press **Revoke** on its row and press **Revoke** again to confirm. The row stays in the list and its status changes to **Revoked**. The key stops working at once. Through the API, `DELETE /api/v1/api-keys/<key id>` does the same and answers 204.
:::

### Make the key through the API

You can make a key without the console. Sign in once to get a session cookie, then ask for a key. The sign-in route takes the member's email and password.

```bash
curl -s -c cookies.txt -H 'content-type: application/json' \
  -d '{"email":"maya.brooks@fernhill.example","password":"..."}' \
  "$VOLVEL_URL/api/v1/auth/sign-in/email"

curl -s -b cookies.txt -H 'content-type: application/json' \
  -d '{"name":"My laptop","expiresAt":"2027-01-31T00:00:00Z"}' \
  "$VOLVEL_URL/api/v1/api-keys"
```

The answer to the second call has the key in `token` and its `id`. `expiresAt` is optional and must be in the future. A key is listed, without its value, by `GET /api/v1/api-keys`, with its first characters (`prefix`), its last four (`suffix`), when it was last used and when it expires.

The cookie works for the first two calls only because they come from your own shell. A browser page of another site cannot make a change with your cookie: see [how the API knows who is calling](../../explanation/api/how-the-api-knows-who-is-calling).

### Give a program a key of its own

A program that is not a person uses a service account's key, so that it keeps working when a person leaves and has only the roles it was given.

:::steps
1. Open the tenant's **Service accounts** screen and make the account, or send `POST /api/v1/tenants/<tenant id>/service-accounts` with a `name`. An account has no permissions until a role is bound to it.
2. Bind a role to it: `POST /api/v1/tenants/<tenant id>/bindings` with the account as `principalType` `service_account`, its `principalId`, a `roleId` and, to limit the account to one workspace or one script or flow, a `workspaceId` and a `resourceId`. A role given at the tenant or at a workspace is an access change: if the tenant asks for a second person to approve those, the answer is 202 with `"waiting": true` and nothing changes yet. A role given at one script or flow applies at once.
3. Make the key: `POST /api/v1/tenants/<tenant id>/service-accounts/<account id>/api-keys` with a `name`. Its `token` is shown once.
4. Revoke it with `DELETE` on `…/service-accounts/<account id>/api-keys/<key id>`.
:::

A service account's key reaches only its own tenant. It is refused on the few routes that are for a person signed in as themselves, such as `GET /api/v1/api-keys`, with 403 "This is only for a person signed in, not for a service account's key." `GET /api/v1/me` and the batch of approvals accept it.

## The result

The key works until you revoke it, until its `expiresAt` passes, or until its owner is disabled. Each use is noted in the key's **Last used** column at most once a minute. Making and revoking a key is written to the audit log.

## If it does not work

- **401 "The API key is not valid."** The key was revoked, has expired, is mistyped, or its owner is disabled.
- **401 "The Authorization header must be: Bearer <api key>."** The header has another scheme, or a value that does not start with `vxk_`. This is refused even when a valid session cookie is sent with it.
- **401 "Sign in or send an API key."** The request has neither.
- **400 "expiresAt must be in the future."** Give a later time.
- **403 `cross_site`.** A request with a session cookie and an `Origin` header that is not the instance's own. Send a key instead, or leave out the `Origin` header.
- **403 `sso_required`.** The tenant signs in through its own provider. A key made before it was required no longer works; sign in through the provider and make a new one.
- Every answer carries an `x-request-id`. Quote it when you ask an operator to look.

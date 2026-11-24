---
title: Make a service account and a key
description: "Make an identity for a program, give it a key with an expiry and the access it needs, and rotate the key."
subjects: [access]
---

## Make a service account and a key

You make an identity for a program and a key it signs in with. At the end the program can call the API with only what you gave it.

### Before you start

You need `service_account:write`, and `binding:write` to give it a role.

:::steps
1. Open **Service accounts** and press **Create service account**. Type a **Name** (for example `ci`) and **What it is for**.
2. The page of the account opens on **Keys**. Press **Create API key**, type a **Name** and choose **Expires**: **Never**, **In 30 days**, **In 90 days** or **In a year**.
3. Copy the key from the notice above the table (**Copy the key**), then press **Done**. It starts with `vxk_` and is shown once. Volvel keeps only a hash.
4. Open the **Access** tab and press **Give access**. Choose a place and a role.
:::

### The result

The key is listed with its first characters and last four, **Last used** "Never" and its **Expires**. The program sends the key as a Bearer token. After the expiry the status is **Expired** and the key stops working.

### Rotate a key

There is no rotate action and a key has no scope of its own.

:::steps
1. Make a new key on the same account, as above.
2. Change the program to use the new key.
3. Press **Revoke** on the old key and confirm. It stops working at once.
:::

### Things to know

- A service account's key is refused on the routes about a person's own account, except `GET /me` and the batch route.
- A service account cannot approve or decline an access change.
- **Delete** on the account removes its keys and the bindings made by hand, and its keys stop working at once.

### If it does not work

- A program gets 401 after the date: the key expired. Make a new one.
- A program gets 403 naming a permission: give the account a role that holds it, under **Access**.

## Related

- [Service accounts](../../reference/screens/service-accounts).
- [Make an API key](../../../console/how-to/account/make-an-api-key): keys for a person.

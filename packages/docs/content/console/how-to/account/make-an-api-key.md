---
title: Make an API key
description: "Make a key that acts as you, with an expiry, and sign the command line in with it."
subjects: [account]
---

## Make an API key

You make a key that acts as you, with your permissions, and use it for the `volvel` command or a script.

### Before you start

Any member may make keys. A key holds what you hold, and nothing narrower: there is no scope for a single key. For a program, make a [service account and a key](../../../administer/how-to/access/make-a-service-account-and-key) instead, so it holds only what it needs.

:::steps
1. Open the account menu, choose **Account**, and find **API keys**.
2. Press **Create API key**. Type a **Name** that says where it will be used, such as "My laptop".
3. Choose **Expires**: **Never**, **In 30 days**, **In 90 days** or **In a year**.
4. Press **Create API key**. The key appears in a notice above the list of keys. Press **Copy**, then **Done**: it is shown once, and **Done** asks first if you have not copied it.
5. Sign the command line in with `volvel login --url https://volvel.example.com --token <the key>`.
:::

### The result

The key is listed with its first characters and its last four, **Last used** "Never", its **Expires** and the status **Active**. After the command runs, `volvel` commands act as you. After the expiry the status is **Expired** and the key stops working: make a new one.

### Revoke a key

Press **Revoke** on the key's row and confirm "Revoke the key "<name>"? Anything using it stops working." A revoked key stays in the list, marked **Revoked**.

### If it does not work

A lost key cannot be shown again: Volvel keeps only a hash. Make a new key and revoke the old one.

## Related

- [Your account](../../reference/screens/account/account).
- [Make a service account and a key](../../../administer/how-to/access/make-a-service-account-and-key).

---
title: Change AUTH_SECRET
description: "Replace the secret that signs sign-in cookies, and what it does to people who are signed in and to the DNS records that prove a hostname."
subjects: [keys, secrets]
---

## Change AUTH_SECRET

By the end `AUTH_SECRET` has a new value on every replica, and everyone has signed in to the console again.

## Before you start

- `AUTH_SECRET` signs the console's sign-in cookies, and the records a hostname or a single sign-on domain is proved with (`_vx-challenge`) are made from it. It seals no stored secret: that is the master key's job.
- Look at **Domains** of each tenant first. The record shown for a hostname or an email domain that is not yet verified is a new value after the change, and must be published again.
- Do it at a quiet time, and tell people they will be asked to sign in.

## Change it

:::steps
1. Make a new value: `openssl rand -hex 32`. At least 32 characters.
2. Set it on every replica at once and restart them together. A replica with the old value does not accept a cookie made by one with the new.
:::

## The result

Everyone who signed in to the console signs in again: operators and tenants' members. In the run for this page, the old cookie answered 401 and a new sign-in worked. API keys, bundles, secrets and runs are not affected. The sign-ins of end users and of members to a tenant's apps are not cookies signed with it (the instance keeps a hash of each), so they stay.

## If it does not work

- **Some people stay signed in and some are refused.** Some replicas still run the old value. Restart them.
- **"AUTH_SECRET must be at least 32 characters."** The new value is too short.
- **A hostname that was pending shows a different record.** Publish the new TXT record.

Related: [Rotate the master key](rotate-the-master-key).

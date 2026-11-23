---
title: Map claims and groups
description: "Tell Volvel which claim holds a person's email, name and groups, map the provider's groups to the tenant's groups, and read end users' attributes from claims."
subjects: [sso]
---

## Map claims and groups

A provider sends facts about a person: claims for OIDC, attributes for SAML. By the end Volvel reads the ones you need, and a person lands in the groups you chose when they sign in.

## Before you start

- A connected provider that you have tried at least once, so that **Everything the provider sent** shows the names the provider uses. See [Connect an OIDC provider](connect-an-oidc-provider).
- You hold `sso:write`. To save a group mapping you also hold `group:write` for members, or `end_user_group:write` for end users, and `binding:write` when a mapped group holds a binding. See [single sign-on permissions](../../reference/sso/permissions).
- The groups exist in the tenant: under **Groups** for members, or under **End users**, on the **Groups** tab.

## Choose the claims

:::steps
1. Open **Tenant**, then **Single sign-on**, open the provider and choose **Settings**.
2. Under **Which claims to read**, fill **Subject**, **Email**, **Name** and **Groups** with the claim or attribute names the provider uses. Leave one empty to use the usual names.
3. A name with dots reaches into a nested claim: `realm_access.roles` reads `roles` inside `realm_access`, unless a claim is named exactly `realm_access.roles`.
4. Press **Save** in the bar. Try a sign-in again from **Set up** to check the facts.
:::

The usual names:

| Fact | OIDC | SAML |
| --- | --- | --- |
| **Subject** | `sub` | The name ID |
| **Email** | `email` | `email`, `mail`, and the `urn:oid` and Microsoft claim names for email |
| **Name** | `name`, then `preferred_username` | `name`, `displayName`, and the `urn:oid` and Microsoft claim names for name |
| **Groups** | `groups` | `groups`, `memberOf`, and the Microsoft and `Group` claim names |

The first claim that has a value is used. A list is read as its first entry for a single value, and as all entries for groups, up to 1,000 groups of up to 500 characters each.

## Map groups

The **Groups** tab is for providers of a tenant. On every sign-in a person is put in exactly the groups listed here that the provider names for them, and taken out of the listed groups it does not name. A group that is not listed is never touched.

:::steps
1. Choose the **Groups** tab and press **Add a mapping**.
2. In **Group at the provider**, type the group's name as the provider sends it. Type `*` to mean everyone the provider signs in.
3. In **Group here**, choose the tenant's group. Type to search the groups on the server; **Load more** reaches the rest.
4. Repeat for each group, then press **Save** in the bar. "The group mapping was saved." appears.
:::

A row filled in halfway is refused: "Row N is not complete. Choose the group here for it, or remove the row." or "Write the group at the provider for it, or remove the row." Emptying the whole mapping needs only `sso:write`.

Mappings that an access change made from the repository are shown apart, read only, with the tag **Access change** and a link to the **Access changes** tab. Change them there.

## Attributes of end users

For a provider of end users, **Settings** has **Attributes**. One a line: the attribute here, an equals sign, then the claim it is read from, for example `customer_id = customerId`. A table's row rules can then match on the attribute. A line is split at the first equals sign. Up to 50 attributes may be set.

## The result

On the next sign-in the person's groups are what the mapping says. The **Show the result** panel after a try lists **Groups** and **Attributes** as the provider sent them and as they are read.

## If it does not work

| You see | Cause and fix |
| --- | --- |
| "Email" is "None sent" | The provider does not send it, or under another name. Set **Email**, and check the provider's scopes or mappers. |
| **Groups** is empty although the person is in groups | The provider leaves groups out of the ID token. For OIDC, check **Also read the user-info address**. |
| A person is in the wrong groups | The mapping is exact: a group listed here and not named by the provider is removed. Check the provider's spelling in **Group at the provider**. |
| "Line N is not complete: write the attribute here, an equals sign, then the claim it is read from." | An **Attributes** line has no equals sign or an empty side. |

---
title: Single sign-on
topic: tenant-single-sign-on
description: "Every control, state and permission of the Single sign-on screen: the list of identity providers, and a provider's Set up, Domains, Groups, Settings, People and Provisioning tabs."
subjects: [sso, identity-provider]
moved_from:
  - tenant/single-sign-on
---

The **Single sign-on** screen connects the tenant to an identity provider, so that people sign in through their organization's account over OpenID Connect (OIDC) or SAML 2.0. A provider is made for **Members**, who use the console, or for **End users**, who use the tenant's apps and portal. A new provider is off, and people keep signing in with a password until one is turned on.

The screen is under **Tenant**, in the group **Sign-in**. F1 (**Help for this page**) opens the help topic `tenant-single-sign-on`. The address of an open provider is `?provider=<id>&tab=<tab>`, so a link reaches the tab you were on. The operators' own provider is on a screen of the instance: see [Single sign-on for operators](../../../self-host/reference/console/single-sign-on).

::screenshot{name=administer/sso-provider-setup alt="A provider's Set up tab: the redirect address to enter at the provider, and a Try signing in button above a passed try with the facts it read."}

## The list of providers

The list has a description line, **Connect a provider**, and a table.

| Column | What it shows |
| --- | --- |
| **Name** | The name people see on the sign-in button ("Sign in with" and the name). A link that opens the provider. |
| **For** | **Members** or **End users**. |
| **Protocol** | **OIDC** or **SAML**. |
| **State** | **On**, **Off** or **Paused**, and a **Required** tag when the provider is required. |

| State of the list | What you see |
| --- | --- |
| Empty | "No identity providers", with "People sign in with a password until a provider is connected and turned on." and **Connect a provider**. |
| Not loaded | The error text and **Try again**. |
| Read only | See [Permissions](#permissions). **Connect a provider** is disabled. |

### Connect a provider

**Connect a provider** opens the sheet "Connect an identity provider". It makes the provider **Off**, then opens it so you can try it. A wrong OIDC issuer is refused at once, because the issuer's settings are read before the provider is saved.

| Field | What it takes |
| --- | --- |
| **Who signs in through it** | **Members, who use this console** or **End users, who use the tenant's apps**. Fixed once the provider is made. |
| **Protocol** | **OpenID Connect (OIDC)** or **SAML 2.0**. |
| **Name** | Up to 80 characters. "What the sign-in button says: Sign in with this name." |
| **Issuer** (OIDC) | The provider's address, for example `https://login.example.com/realms/acme`. Its settings are read from there. |
| **Client ID** (OIDC) | The application's ID at the provider. |
| **Client secret** (OIDC) | Kept sealed and never shown again. Leave it empty for a public client. |
| **Metadata address** (SAML) | Where the provider publishes its metadata. |
| **Metadata** (SAML) | The metadata file pasted. It is used instead of the address when filled in. |

The sheet's buttons are **Cancel** and **Connect**.

## An open provider

The header shows the provider's name, its state (and **Required**), and "OIDC, for members" or the like. Its buttons:

| Button | What it does |
| --- | --- |
| **Remove** | Asks you to type the provider's name. Its domains, group mapping and ties to people go with it. The people it signed in stay, and need another way in. |
| **Require it** / **Stop requiring it** | Shown only while the provider is on. Asks first. See [Require single sign-on](../../how-to/sso/require-single-sign-on). |
| **Turn on** / **Turn off** | Turning off asks first and says which email domains the provider covers, whether it was required, and that "A directory that pushes people to it keeps pushing while it is off." Turning off also stops requiring it. |

Under the header, a steps bar shows four steps and opens the tab of each: **Connect** ("A try passed" or "Enter the addresses, then try it"), **Prove domains** ("Proved", "Needed for members" or "Optional for end users"), **Map groups** (a count, or "Optional"; not shown for the instance's provider) and **Switch on** ("Off", "On; passwords still work" or "On and required").

Two notices can appear. Before you require sign-in for members, a plain notice says owners should make recovery codes in **Account** first. On a provider that came in with an imported tenant, a notice says "This tenant came from another instance, so the provider is paused" and tells you to give the provider's administrator the new addresses, prove the domains again, and turn it on.

### Set up

| Part | What it shows |
| --- | --- |
| **1. Enter these at the provider** | OIDC: **Redirect address**. SAML: **Reply address (ACS)**, **Entity ID (audience)** and **Metadata address**. Each has a copy button. A provider for members also shows **Sign-in address**, for a tile in the provider's app list or a bookmark; it works once the provider is turned on. |
| **2. Try it** | **Try signing in** opens the provider in a new tab. Signing in there signs nobody in and changes nothing. **Show the result** appears after you try. |
| **3. Turn it on** | A note: a provider for members needs an email domain first. |

After a try, a panel says "The provider answered …" with what would happen, or "The last try, …, did not pass." with the reason. It lists **Subject**, **Email**, **Email verified** (**Yes**, **No** or **Not said**), **Name**, **Groups** and **Attributes** (as "name = value", or "None mapped"), and **Everything the provider sent** opens the raw claims. A try works while the provider is off. It still applies the provider's rules, so a person whose email domain is not proved shows "did not pass" even though the provider answered.

### Domains

For members, a provider signs in only people whose email is in a proved domain. See [Prove an email domain](../../how-to/sso/prove-an-email-domain).

| Control | What it does |
| --- | --- |
| **Email domain**, **Add domain** | Adds a domain, for example `example.com`. |
| **Check now** | Shown on a domain that has a record. Asks DNS for the record again. |
| **Remove** | Asks first. People already tied to the provider still sign in; nobody new in the domain will. A provider for members with no proved domain left is turned off. |

Each domain shows **Proved**, **Not proved**, or "Proved <time>; record gone since <time>". A domain that is not proved shows a **Record name** and a **Record value** to publish as a TXT record, each with a copy button, and the reason the last check failed. The empty state is "No domains yet".

### Groups

Not on the instance's provider. See [Map claims and groups](../../how-to/sso/map-claims-and-groups).

| Control | What it does |
| --- | --- |
| **Group at the provider** | The name of the group as the provider sends it. `*` stands for everyone the provider signs in. |
| **Group here** | A group of the tenant, or of its end users for an end-user provider. It is searched on the server; "Showing the first N groups" and **Load more** reach the rest. |
| **Add a mapping**, the trash button on a row | Adds or removes a row. |
| The save bar | Saves or discards the whole mapping. A row filled in halfway is refused: "Row N is not complete." |

Rows that an access change made are listed apart, read only, with the tag **Access change** and a link to the **Access changes** tab. Change them there. If the tenant has no group, a notice says to make one under **Groups** (members) or under **End users**, on the **Groups** tab.

### Settings

Changes are kept by the save bar. :kbd[Ctrl+S] or :kbd[⌘S] saves, and leaving with unsaved changes asks first. A field the server refuses shows its message beside it.

| Field | Applies to | What it does |
| --- | --- | --- |
| **Name** | Both | Up to 80 characters. |
| **Read the metadata again**: **Metadata address**, **Or paste the metadata**, **Read the metadata** | SAML | Asks first, then replaces the sign-in address, the provider's entity ID and the signing certificates with what the metadata says. See [Replace a SAML certificate](../../how-to/sso/replace-a-saml-certificate). |
| **Sign-in address** | SAML | Where people are sent to sign in. |
| **Provider's entity ID** | SAML | The provider's name for itself. Changing it asks "Change the identity provider's entity ID?" and removes the ties between people and the provider. |
| **Signing certificates** | SAML | One or more certificates in PEM form. List the new one beside the old one while a certificate is being replaced. |
| **Name ID format** | SAML | **Not asked: the provider chooses**, **Email address**, **Persistent**, **Transient** or **Unspecified**. |
| **What must be signed** | SAML | **The assertion or the whole response**, **The assertion**, **The whole response** or **Both**. |
| **Sign the requests sent to the provider** | SAML | On by default. |
| **Ask the provider to encrypt assertions** | SAML | Off by default. Publishes this side's certificate in the metadata. The provider must wrap the key with RSA-OAEP with MGF1 and the SHA-1 digest; Keycloak's defaults differ. |
| **Accept SHA-1 signatures** | SAML | Off by default. Turning it on is written to the audit log. |
| **Accept sign-ins the provider begins** | SAML | Off by default; for a tile on the provider's own start page. Turning it on is written to the audit log. |
| **Issuer** | OIDC | Changing it asks "Change the issuer?" and removes the ties between people and the provider. A client secret stored for the old address is not sent to a new one. |
| **Client ID** | OIDC | |
| **Client secret** | OIDC | Shows when the secret was set and by whom. Type a new one to replace it. |
| **Remove the stored client secret** | OIDC | Shown when a secret is stored and none is typed. The provider is then a public client, signed in with PKCE alone. Applies when you save. |
| **Scopes** | OIDC | Separated by spaces. A new provider has `openid email profile`. |
| **Also read the user-info address** | OIDC | For a provider that leaves groups or email out of the ID token. |
| **Subject**, **Email**, **Name**, **Groups** | Both | The claim or attribute to read. Leave a field empty to use the usual name. |
| **Attributes** | End users | One a line, `attribute = claim`. |
| **Take the provider's word on emails** | End users | Lets a first sign-in take over an existing account with the same email, in a domain that has not been proved here. |
| **Create people the first time they sign in** | Both | Off: only people who already exist can sign in. |
| **Role given to a new member** | Members of a tenant | Leave empty to give nothing. |

A line of **Attributes** with no `=` is refused: "Line N is not complete: write the attribute here, an equals sign, then the claim it is read from."

### People

A table of the people who signed in through the provider: **Person**, **Email at the provider**, **Subject**, **Last signed in** (or "Never") and **Untie**. **Untie** asks first, and the person's next sign-in ties them again by email, under the rules of a first sign-in. The empty state is "Nobody yet". A page holds 200 people; **Load more** shows the rest.

### Provisioning

The provider can push people and groups over SCIM. See [Provision people with SCIM](../../how-to/sso/provision-people-with-scim) and the [SCIM reference](../sso/scim).

| Part | What it shows |
| --- | --- |
| **SCIM base address** | The address to give the provider, with **Copy the address**. |
| **Tokens**, **Make a token** | A table of **Name**, **Begins**, **Made**, **Expires** (or "Never"), **Last used** (or "Never"), **Status** (**active** or **expired**) and **Revoke**. **Make a token** asks for a **Name** and when it expires, and shows the token once. |
| **How pushes are taken** | **The name the provider signs a person in by is pushed as**: **Not pushed: tie each person at their first sign-in**, **externalId** or **userName**. For a tenant's provider: **A person's groups come from**, **What each sign-in says** or **The groups the provider pushes**, and, with the second, **Make a group here for each pushed group that nothing maps yet**. Saved with the save bar. |
| **What has been pushed** | **People**, **Of them, turned off**, **Groups** (not on the instance's provider) and **Last change**. |
| **People pushed** | Chips **All**, **Active** and **Turned off** with counts; **Person**, **Email**, **State**, **Last change**. A page holds 200; **Load more**. Empty: "Nobody pushed yet". |
| **Refused pushes** | **When**, **Push**, **Answer**, **Why**, newest first. Empty: "No push has been refused." |

## Permissions

| Action | Needs |
| --- | --- |
| See the providers, their domains and who is tied to them | `sso:read` |
| Connect, change, turn on and off, require, remove; prove domains; map groups; make tokens; untie | `sso:write` |
| Choose a **Role given to a new member** | `sso:write`, and `binding:write` |
| Save a group mapping | `sso:write`, and `group:write` (`end_user_group:write` for end users) |

Without `sso:write` the tab shows "You can see this provider, not change it. It needs `sso:write`." and its controls are disabled. The server decides again. The full list is in the [single sign-on permissions](../sso/permissions) page.

## Related

- [How single sign-on works](../../explanation/sso/how-single-sign-on-works)
- [Why a sign-in is refused](../sso/refusals)
- [Connect an OIDC provider](../../how-to/sso/connect-an-oidc-provider) and [connect a SAML provider](../../how-to/sso/connect-a-saml-provider)

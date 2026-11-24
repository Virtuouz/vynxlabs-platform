---
title: Single sign-on permissions
description: "The permissions that single sign-on, branding, hostnames, workers, the audit log and export need, and the extra permissions a default role and a group mapping need."
subjects: [sso, permissions]
---

Each permission is written `kind:verb`. The full list, for every kind, is in the [permissions reference](../permissions). A role is a set of them; see [How access works](../../explanation/access/how-access-works). This page lists the ones the screens of this area need.

## The kinds

| Kind | `read` | `write` |
| --- | --- | --- |
| `sso` | See the tenant's identity providers, their domains and who is linked to them. | Connect and change identity providers, prove domains, map groups, and require single sign-on. |
| `portal` | See the portal's settings and branding. | Change branding, the logo and whether people may sign up. |
| `domain` | See the tenant's hostnames. | Register, verify and remove hostnames. |
| `worker` | See the workers that are connected. | Create and revoke worker credentials, and make and remove worker pools. |
| `audit` | Read the audit log. | None. |
| `export` | None. | `export:write` exports the tenant. |

Retention and the switch for workers the instance starts use `tenant:read` and `tenant:write`. Retention also accepts an operator's binding at the instance.

## At the instance

The instance's screens use `instance:read` and `instance:write`. The instance's audit log needs `audit:read` at the instance. The instance's provider and the console branding need `instance:write` to change.

## What a provider's settings need besides `sso:write`

| Action | Also needs |
| --- | --- |
| Set a provider's **Role given to a new member** | `binding:write`. |
| Save a group mapping | `group:write` for a provider of members, `end_user_group:write` for a provider of end users. |
| Save a group mapping that maps a group holding a binding | `binding:write`. |
| Empty a group mapping | `sso:write` only. |
| Enable an unverified hostname | `instance:write`, an operator of the instance. |

## What a person sees without them

A person who may read and not write sees a line such as "You can see this provider, not change it. It needs `sso:write`. Ask …" and the controls are disabled. This is on single sign-on (every tab), domains, workers, retention, branding, console branding and export. The server decides again on every request.

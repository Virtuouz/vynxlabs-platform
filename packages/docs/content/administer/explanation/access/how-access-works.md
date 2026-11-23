---
title: How access works
description: "Roles, bindings and scopes: who can hold what, where it counts, why access only adds up, and what a suspended person, an end user and anyone without signing in may hold."
subjects: [access, roles]
---

Every request to Volvel asks one question: does this person hold this permission here? The answer comes from the roles they have been given and from nothing else. This page says how that is worked out, so that a refusal or a disabled button can be read.

## The idea

A **permission** is written `kind:verb`: a kind of thing and one of two verbs, `read` or `write`. `table:write` is changing tables. A `*` stands for either half: `table:*` is both verbs, `*:read` is reading everything, `*:*` is everything. The [permissions reference](../../reference/permissions) lists the kinds.

A **role** is a named set of permissions. A **binding** gives one role to one **principal** at one **scope**. Access only adds up: a person holds a permission if any binding that reaches them gives it. There is no deny.

A binding has no condition and no end. It stays until it is removed. The one thing that expires is an operator's access grant.

### Principals

A binding can be given to:

| Principal | Who it reaches |
| --- | --- |
| A member | That person. |
| A group | Every member in the group, now and later. |
| A service account | The program that holds one of its keys. |
| An end user | One person in the tenant's pool of end users. |
| A group of end users | Every end user in it. |
| Every end user | Everyone who signs in to the tenant's apps. |
| Anyone | A visitor who has not signed in. |

A role given to anyone counts only for permissions an app uses (script, run, flow run, table, data, all data, file, app and theme). Whoever asks, the rest of the role gives nothing, and the API refuses to give anyone, or every end user, a role that holds nothing an app uses.

### Scopes

A binding is made at the whole tenant, in one workspace, or on one thing in a workspace such as one script, flow or app. A tenant binding reaches every workspace in the tenant. A workspace binding reaches what is in that workspace. A binding on one thing reaches that thing.

A binding at the instance does not reach inside a tenant. Only `operator_admin` may be bound at the instance, and an operator gets into a tenant only through an access grant. A few routes about the tenant itself (its record, retention) count an operator's instance binding.

### Permissions given by name

`sql:read` and `workspace_production:write` are given only when a role lists them. `*:*`, `*:read` and the picker's **Read everything** do not include them. A person who holds `*:*` and is checked for one of them is told so.

## How it fits

### Suspended people

A member suspended in a tenant holds nothing there: no binding and no group counts until they are resumed. What they were given is kept, and what they hold in other tenants is not touched. An operator's access grant is not membership, so a suspended state does not apply to it. **View access** lists a suspended member's sources and marks them "not while suspended".

### End users and apps

An end user, or a member who has signed in to an app's address, holds only what an app uses. A service account holds nothing outside its own tenant.

### Rows

Permissions decide whether someone may use a table at all. A table's own rules then decide which rows: everyone, the person named in a column, a group named in a column, or a matching attribute. `data:*` is held to those rules. `data_all:*` passes them. A member's groups count in a rule; attributes exist only on end users. See [Rule rows by group or attribute](../../how-to/access/rule-rows-by-group-or-attribute).

### What the console asks

Every screen asks the server. A control you may not use is disabled, with a line that says what you can see and that it needs a permission, and whom to ask. Reading is never hidden. At the tenant, only a permission given at the tenant counts for a tenant screen; at a workspace, what the server answers counts. This is why a workspace admin may give roles in its workspace but a workspace's tenant screens stay read only.

### Refusals

A person with no standing in a tenant is told "The tenant was not found", so that its existence is not shown. Anyone else is refused with 403 naming the permission. A request with no sign-in is refused with 401.

### Who may give what

`binding:write` can give any role at its scope. There is no check that the giver holds what the role holds, so treat `binding:write`, and the group and role changes that lead to it, as strong. Volvel refuses any change that would leave a tenant with nobody who can change its access.

## The built-in roles

These are in every tenant. They cannot be changed; make a role of your own to allow something else.

| Role | What it allows |
| --- | --- |
| `tenant_admin` | `*:*`, and `sql:read`. |
| `workspace_admin` | Most kinds in a workspace (apps, flows, scripts, tables, data, secrets, deployments, interface, docs, git and more), `binding:*` there, and reads of audit, members and groups. It has no `role:*` and no `access:write`, so it cannot make a role or ask for an access change, and no `code`, `portal`, `end_user` or `service_account`. |
| `developer` | `*:read`, and writes of bundles, code, connections, dashboards, data, events, files, flow runs, resources, runs, secrets and variables, and `sql:read`. No deployment, promotion, approval, interface or doc write. |
| `deployer` | `*:read`, `bundle:*`, `deployment:*` and `promotion:write`. |
| `viewer` | `*:read`. |
| `portal_user` | `app:read`, and `data:read` and `data:write`. |
| `portal_reader` | `app:read` and `data:read`. |
| `app_maintainer` | `workspace:read`, `interface:*`, `table:read`, `data:read` and `data:write`, `app:read` and dashboards. |
| `doc_writer` | `workspace:read`, `doc:*`, `table:read` and `app:read`. |
| `agent_runner` | `run:write` and `flow_run:write`. |
| `operator_admin` | Instance only, not offered in a tenant: `access_grant`, `binding`, `instance`, `member` and `tenant` in full, `audit:read` and `export:write`. |

## Sessions and keys

A console session lasts 7 days. A person's API key and a service account's key last until their **Expires** time, or until revoked: **Never** is a choice. Suspending a member ends their console and app sessions in the tenant. Using a password reset link ends the member's other sign-ins. See [Your account](../../../console/reference/screens/account/account).

## Related

- [Second-person approval](second-person-approval).
- [Give access](../../how-to/access/give-access).
- [Members and access](../../reference/screens/members).

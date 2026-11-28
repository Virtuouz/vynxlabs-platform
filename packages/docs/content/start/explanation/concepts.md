---
title: Concepts
topic: concepts
description: "Instance, tenant, workspace, resource, deploy and the other words every screen is made of, in the order they fit together."
subjects: [workspaces, permissions]
terms:
  - id: volvel-instance
    term: instance
    aliases: [instances]
    short: One running copy of Volvel, with its own database and its own operators. It holds tenants.
  - id: volvel-operator
    term: operator
    aliases: [operators]
    short: A person who runs an instance. An operator makes tenants and sees the instance's own screens, and enters a tenant only through an access grant or as one of its members.
  - id: tenant
    term: tenant
    short: One team's space on an instance, with its own people, workspaces and data. Nothing is shared between tenants.
  - id: workspace
    term: workspace
    aliases: [workspaces]
    short: A place where a tenant's resources live and run. A tenant has one or more dev workspaces and a production workspace.
  - id: dev-workspace
    term: dev workspace
    aliases: [dev workspaces]
    short: A workspace where resources can be changed in the console. Changes take effect when they are deployed.
  - id: production-workspace
    term: production workspace
    aliases: [production]
    short: The workspace the business runs on. It changes only by a deploy from a repository or a promotion from a dev workspace.
  - id: resource
    term: resource
    aliases: [resources]
    short: Anything a workspace holds and manages the same way, such as a script, a flow, a table, a connection or an app.
  - id: deploy
    term: deploy
    aliases: [deploys, deployed]
    short: The moment a set of changes takes effect in a workspace, all together.
  - id: draft
    term: draft
    aliases: [drafts]
    short: A change saved in the console that has not been deployed yet.
  - id: volvel-version
    term: version
    aliases: [versions]
    short: What a deploy makes a workspace run, numbered in that workspace. The same bundle can be version 9 in a dev workspace and version 4 in production.
  - id: promotion
    term: promotion
    aliases: [promote, promoted]
    short: Moving what a dev workspace runs into the workspace it is linked to, as the same bundle.
  - id: bundle
    term: bundle
    aliases: [bundles]
    short: Everything a workspace runs at one moment, built as one unit that can be deployed, promoted and rolled back.
  - id: run
    term: run
    aliases: [runs]
    short: One execution of a script or a flow, with its input, its logs and its result.
  - id: volvel-trigger
    term: trigger
    aliases: [triggers]
    short: A schedule, webhook, form, event or poll that starts a run.
  - id: volvel-approval
    term: approval
    aliases: [approvals]
    short: A flow step that waits for a person to approve or reject before the flow goes on.
  - id: binding
    term: binding
    aliases: [bindings]
    short: A grant of a role to a person, a group or a service account, at a tenant, a workspace or one resource.
  - id: member
    term: member
    aliases: [members]
    short: A person with an identity and roles in a tenant, who signs in to the console.
  - id: end-user
    term: end user
    aliases: [end users]
    short: A person who uses a tenant's apps and does not run the tenant, and never signs in to the console.
  - id: volvel-access-change
    term: access change
    aliases: [access changes]
    short: A change to who may do what in a tenant, made from files or by approval, and recorded.
moved_from:
  - start/concepts
---

These are the words every screen of Volvel uses, in the order they fit inside each other.

## The instance and its people

An :term[instance]{id=volvel-instance} is one running copy of Volvel. It has its own database and holds any number of tenants. The people who run it are its :term[operators]{id=volvel-operator}. An operator makes tenants, sees the screens under **Instance**, and can pause every trigger on the instance. An operator does not see inside a tenant unless they are one of its members or open an access grant, which needs a reason, ends by itself and is visible to the tenant's admins.

A :term[tenant]{id=tenant} is one team's space on the instance. Everything a tenant has is kept apart from every other tenant's. A tenant has :term[members]{id=member}, who sign in to the console, and :term[end users]{id=end-user}, who use its apps and do not.

Nobody makes their own account. An administrator adds each member, and an operator makes each tenant. There is no self sign-up, no multi-factor sign-in and no passkey. See [Sign in](../how-to/basics/sign-in).

## Workspaces

A tenant's work lives in :term[workspaces]{id=workspace}. A :term[dev workspace]{id=dev-workspace} is where things are made and tried. The :term[production workspace]{id=production-workspace} is what the business runs on, and the console shows it as such on every screen. The two are not copies of each other's data: see [Dev and production workspaces](basics/dev-and-production).

## Resources and how a change takes effect

Everything in a workspace is a :term[resource]{id=resource}: scripts, flows, tables, connections, apps and more are managed the same way. Each has a path, such as `clinics/send-reminders`.

A change saved in the console is a :term[draft]{id=draft}. Nothing a draft says is live until a :term[deploy]{id=deploy}, which applies a set of changes together as a :term[bundle]{id=bundle}. The workspace then runs a numbered :term[version]{id=volvel-version}. The workspace a dev workspace is linked to receives the same bundle by :term[promotion]{id=promotion}. A table's rows are different: a row is data, and it changes at once when you save it.

## Work that runs

A :term[run]{id=run} is one execution of a script or a flow. A :term[trigger]{id=volvel-trigger} is what starts a run on its own: a schedule, a webhook, a form, an event or a poll. A flow step can be an :term[approval]{id=volvel-approval}, which holds the flow until a person decides.

## Who may do what

What a person may do is decided by roles. A role is a set of permissions, written like `flow:write`. A :term[binding]{id=binding} gives a role to a member, a group or a service account, at the tenant, at a workspace or on one resource. A permission given at a workspace counts there alone. A change to who holds what is an :term[access change]{id=volvel-access-change}. When you cannot do something, the screen says which permission it needs; see [What you may do](basics/what-you-may-do).

## How it fits

```mermaid
flowchart TD
  I[Instance] --> T[Tenant]
  T --> M[Members and end users]
  T --> D[Dev workspace]
  T --> P[Production workspace]
  D -. promotion .-> P
  D --> R[Resources, drafts, versions]
  P --> R2[Resources, versions]
```

## Related

- [Finding your way](../reference/basics/finding-your-way): the rail, the header and the switchers.
- [Dev and production workspaces](basics/dev-and-production)
- [What you may do](basics/what-you-may-do)

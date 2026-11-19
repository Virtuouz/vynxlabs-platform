---
title: Concepts
order: 1
topic: concepts
description: Tenants, workspaces, resources and deploys, in a page.
terms:
  - id: tenant
    term: tenant
    short: One client organisation, with its own people, workspaces and data. Nothing is shared between tenants.
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
    short: Anything a workspace holds and manages the same way - a script, a flow, a table, a connection, an app, a role.
  - id: deploy
    term: deploy
    aliases: [deploys, deployed]
    short: The moment a set of changes takes effect in a workspace, all together.
  - id: draft
    term: draft
    aliases: [drafts]
    short: A change saved in the console that has not been deployed yet.
  - id: promotion
    term: promotion
    aliases: [promote, promoted]
    short: Moving what a dev workspace runs into production, as the same bundle.
  - id: bundle
    term: bundle
    aliases: [bundles]
    short: Everything a workspace runs at one moment, built as one unit that can be deployed, promoted and rolled back.
  - id: run
    term: run
    aliases: [runs]
    short: One execution of a script or a flow, with its input, its logs and its result.
  - id: binding
    term: binding
    aliases: [bindings]
    short: A grant of a role to a person or a group, at a tenant, a workspace or one resource.
  - id: member
    term: member
    aliases: [members]
    short: A developer or a member of the client's staff, with an identity and roles.
  - id: end-user
    term: end user
    aliases: [end users]
    short: A customer or portal user of a tenant, who uses its apps and never the console.
---

A :term[tenant]{id=tenant} is one client organisation. Everything a tenant has is kept apart from every other tenant's.

A tenant's work lives in :term[workspaces]{id=workspace}. A :term[dev workspace]{id=dev-workspace} is where things are made and tried. The :term[production workspace]{id=production-workspace} is what the business runs on.

## Resources

Everything in a workspace is a :term[resource]{id=resource}: scripts, flows, tables, connections, apps and roles are all managed the same way. Each has a path, such as `sales/orders`, and is either kept in a repository or made in the console.

## Changes take effect by deploy

A change saved in the console is a :term[draft]{id=draft}. Nothing a draft says is live until a :term[deploy]{id=deploy}, which applies a set of changes together as a :term[bundle]{id=bundle}. Production changes only by a deploy from a repository or by a :term[promotion]{id=promotion}.

## People

A :term[member]{id=member} signs in to the console. An :term[end user]{id=end-user} uses a tenant's apps. What either may do is decided by :term[bindings]{id=binding} of roles.

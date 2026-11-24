---
title: What you may do
description: "Why a button is gray, why a screen says you can see something and not change it, what the permission it names means and who to ask."
subjects: [permissions]
---

The console shows you what you may read, and it tells you when you may not change it. It does not hide a screen from you and then let you wonder where it went. This page explains the lines you will meet, and what stands behind them.

## The idea

What a person may do is a set of permissions, written as a kind and a verb: `flow:read`, `flow:write`, `table:read`. Roles are named sets of permissions, such as Tenant admin or Doc writer. A binding gives a role to a member, a group or a service account at one place: the tenant, one workspace or one resource. The list of permissions and the roles that hold them is in the [permissions reference](../../../administer/reference/permissions). The terms are in [the concepts](../concepts).

Where the permission is given matters:

- A permission given at the tenant counts everywhere in the tenant, in every workspace.
- A permission given at a workspace counts there alone.
- A role given on one flow or script counts for that one, and lets a person start or read it without seeing the rest.
- An operator's permissions on the instance count on the instance's screens, and, on tenant screens that say so, in a tenant.

A screen asks only about the place it is in. A grant at one workspace does not make a tenant screen editable.

## What the console shows you

**A line under the title.** A screen you may read and not change says, in a plain notice, "You can see {what}, not change it. It needs `permission`." and then whom to ask. In a tenant the sentence is "Ask a member who can give access in this tenant (an owner or administrator) to give you a role with it." Under **Instance** it is "Ask an operator of this instance to give you access." Where a role is enough on its own, the line says "or {permission} alone".

**A control that is gray.** The buttons that create or change are gray, not missing, and the tooltip says "It needs {permission}." with the same advice. This is so you can see that the thing exists, and what to ask for.

**A refusal after the fact.** When the instance refuses an action that the screen could not have known about, the message names the permission and gives the same advice.

**A count that is not zero.** On a workspace's overview, a number you may not read is said and not shown as 0: "Nothing you can see needs you here", or "Some of this you cannot see". A count in the section panel you may not read is left out.

**A short list of sections.** A person whose only grant is on a resource inside a workspace sees the workspace's name but no list of sections: the section screens belong to people who may read the workspace.

**Production.** The editors of a production workspace are read only, and say why. The App Builder, for one, says "Read only: this is the production workspace. Apps are changed in a dev workspace and arrive here by promotion." The instance refuses a direct change there with "Resources are edited in a dev workspace and reach production by promotion." See [Dev and production workspaces](dev-and-production).

**The instance.** When the database takes no changes, a strip says "The instance is read only", and every save and create button is off with that reason.

**For operators.** An address under **Instance** shows "For operators" to a person who is not an operator.

## Seeing what you hold

**What I may do here**, in the account menu inside a tenant, opens your own member page. Its description reads "Everything you may do in this tenant, where, and what gives it." It lists what gives you access (a role, where it applies, and a group when it comes through one) and the permissions that follow. It needs no permission to read access, because it is about you.

## Who to ask

The console's own words: in a tenant, "a member who can give access in this tenant (an owner or administrator)". On the instance's screens, an operator of the instance.

## How it fits

The screens ask the instance, and the instance decides again on every request. A control that is drawn is not a promise: if something changed since the screen loaded, the instance still refuses, and the message says why. A person with an API key has what the member who made it has.

## Related

- [Concepts](../concepts)
- [Finding your way](../../reference/basics/finding-your-way)

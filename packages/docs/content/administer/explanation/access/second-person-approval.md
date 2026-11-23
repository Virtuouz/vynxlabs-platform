---
title: Second-person approval
description: "What waits for a second person when a tenant asks for one, what does not, what an access change is, and why approval counts people and not keys."
subjects: [access, approval]
---

A tenant can ask for a second person before its access changes. This page says what that covers, because it does not cover everything, and why.

## The idea

Some changes to access are strong enough that one person alone should not make them: a new role, a group handed a role, a service account given the run of a workspace. With approval on, those changes are recorded as **access changes** that wait until someone other than the person who made them approves.

An **access change** is a change to the tenant's groups, groups of end users, service accounts, roles, and the bindings that give those out. It is made from the console, from the repository (`volvel tenant release`) or through the API. Every one is listed on the **Access changes** tab with who made it, how, and who answered it.

### What waits and what does not

| Waits | Applies at once |
| --- | --- |
| Making, renaming or deleting a group, a group of end users or a service account. | A role given straight to a member, including in **Add member**. |
| Making, changing or deleting a role. | A role given to every end user. |
| A role given to a group, a service account or a group of end users, at the tenant or in a workspace. | A role given to anyone without signing in. |
| A set of files from a repository. | A role on one script, flow or other single thing. |
| Going back to an earlier access change. | A role a workspace defines, and who is in a group. |

The reason is the shape of the data. An access change carries the tenant's own objects and the bindings between them, as one set that can be checked, shown, approved and taken back. A role given to one person, or on one thing, is not part of that set. The decision (D63) is that these apply at once, and the screen says so in a notice wherever they are given: "a role given straight to a member or to end users applies at once and does not wait."

## How it fits

### Two people, not two keys

Approval counts people. Turning it on needs two members who hold `access:write` at the tenant, directly or through a group, so that one can answer the other. A service account cannot approve or decline: a second person is a person. A key made by a member counts as that member, so a member cannot approve a change they asked for with their own key (`own_release`). One person can turn approval off.

### What approving does

The person who asked sees the change as "waits for a second person", and nothing has changed. The approver reads exactly what it does, with warnings, and presses **Approve**: the change applies in one step. If the tenant's access moved in a way that makes it a different change from the one shown, it is refused with `release_stale` and has to be asked again. If another change applied first and this one can no longer apply, it is marked **Superseded**.

The person who asked can withdraw at any time. An approver can decline, with a reason shown to whoever asked.

### Going back

**Go back to this** on an applied change makes a new change that restores groups, service accounts, roles and what they are given as they were after it. It does not change who is in each group. It lists what it would remove first, and with approval on it waits like any other.

### What this is not

Approval is not a deny rule and not a check on what a role contains. A person with `access:write` may approve a change made by another with the same permission; the product does not check that the giver holds what is given. `binding:write` stays strong. Approval adds a second pair of eyes to changes of the tenant's own access objects. It does not cover the flow step called an approval, which is a person deciding in a flow: see [Approvals across workspaces](../../reference/screens/approvals).

## Related

- [Ask for a second person](../../how-to/access/ask-for-a-second-person).
- [Access changes](../../reference/screens/access-changes).
- [How access works](how-access-works).

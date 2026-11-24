---
title: Access changes
description: "Every control, state and permission of the Access changes tab: the record of every change to groups, service accounts, roles and what they are given, and what a second person may do with one."
---

The **Access changes** tab of **Members & access** is the record of every change to the tenant's groups, groups of end users, service accounts, roles and the bindings that give them out. It shows who made each change and who answered it. When approval by a second person is on, a change waits here until someone else approves it.

The tab is reached from **Members & access**, then **Access changes** (address `/releases`; the address keeps the old word). Its description line reads "Every change to the tenant's groups, service accounts, roles and what they are given, from the console or from the repository, with who made it and who approved it."

::screenshot{name=administer/access-changes alt="The Access changes tab with one change waiting for approval, its Approve and Decline buttons, and the button to stop asking for a second person."}

## The list

The newest 200 changes are listed. A change has a number, counted in the tenant.

| Column | What it shows |
| --- | --- |
| **#** | The number, as a button: **Open access change N**. It opens a dialog "Access change N" that lists every change in it, with any warnings, and **Close**. A link `?release=<id>` opens the same dialog. |
| **What** | The message, if one was given, or the changes in words ("Makes the group Finance team. Gives …"), up to three and "and N more". **All N changes** opens the dialog. A comment from whoever answered is shown in quotation marks. A warning is shown under the text. |
| **Status** | **Applied**, **Waits for approval**, **Declined**, **Withdrawn** or **Superseded**. |
| **By** | Who made it, how, and who answered it: **From the repository**, **Through the API**, **In the console** or **Going back**, then ", answered by <name>". |
| **When** | How long ago. |
| (end) | The actions for the row. On a narrow window they are under the text in **What**. |

A change is **Superseded** when another change applied first and this one can no longer apply; its comment names the other.

### What a change carries

An access change carries groups, groups of end users, service accounts, roles and the bindings of these. It does not carry a role given to a member or an end user, a binding for every end user or for anyone, a binding on one resource, a role a workspace defines, or who is in a group. Those apply at once. See [Second-person approval](../../explanation/access/second-person-approval).

### Actions

| Control | What it does |
| --- | --- |
| **Ask for a second person** | In the page's header, while approval is off. Turns approval on. The notice says "Changes to access now wait for a second person." It needs two people who hold `access:write` at the tenant, directly or through a group: otherwise "Approval needs two people who may change the tenant's access, so that one can answer the other. Give a second member a role with access:write first." |
| **Stop asking for a second person** | While approval is on. Asks "Stop asking for a second person?" and says what stays waiting. Turning it off needs no one else. The notice says "Changes to access apply at once." |
| **Approve** | On a change that waits, for a member other than whoever asked. Asks "Approve access change N?", lists what it does ("It applies at once, and does all of this:"), then applies it. |
| **Decline** | Asks "Decline access change N?" and lists what it would have done. The field "Why (kept with the access change, shown to whoever asked)" is optional and 1000 characters at most. |
| **Withdraw** | For whoever asked. Asks "Withdraw access change N?". |
| **Go back to this** | On an applied change. Asks "Go back to access change N?", lists what it removes under "These are removed:" (or "Nothing is removed."), and anything "Left out, because it no longer exists:". The tenant's groups, service accounts, roles and what they are given become what they were after that change. Who is in each group does not change, and groups an identity provider made are left alone. It is a danger confirmation when it removes something. |

Rows show these texts instead of buttons when they cannot be used: "You asked for this. Someone else approves it." (with **Withdraw**) for the one who asked, and "You may read this, not answer it." for someone without `access:write`.

When approval is on, the notice "A change to access waits until someone other than whoever made it approves it." is shown above the list. A change that waits is shown as a notice ("... and waits for a second person. Nothing has changed yet."), not as success.

Going back to a change that deleted a group or a service account makes it again, empty and without keys.

### Refusals

| Message or code | When |
| --- | --- |
| `approval_needs_two` | Turning approval on with fewer than two people who may approve. |
| `own_release` | "A change to access is approved by someone other than whoever made it." A key counts as the person who made it. |
| "Only a member signed in as themselves approves or declines a change to access. A service account's key cannot." | A service account tried to approve or decline. |
| `release_stale` | "The tenant's access changed after this access change was asked for, so it is no longer the change that was shown. Withdraw it and ask again." |
| `delete_not_allowed` | A change from files would delete something without `--allow-delete`. |
| `principal_in_use` | A group or service account that a bundle still binds, or that decides a waiting change, cannot be deleted. |
| "That would leave the tenant with nobody who can change its access. Give someone else the tenant admin role first." | A change that would leave no one who can change access. |

## States

| State | What you see |
| --- | --- |
| Empty | "No access changes yet", "An access change is recorded when a group, a service account, a role or what one is given changes." |
| Not loaded | The list's error state, with a retry. |
| Unknown number | "There is no access change with that address. It may belong to another tenant." |

## Permissions

| Action | Needs |
| --- | --- |
| See the list and a change | `access:read` |
| Turn approval on or off, **Approve**, **Decline**, **Go back to this** | `access:write` at the tenant |
| **Withdraw** | Being the one who asked, or the member who made the key it was asked with. No access permission |

A workspace admin does not hold `access:write`, so it cannot ask for an access change. See [How access works](../../explanation/access/how-access-works).

## Related

- [Ask for a second person](../../how-to/access/ask-for-a-second-person).
- [Second-person approval](../../explanation/access/second-person-approval).
- [Keep access in a repository](../../../develop/how-to/access/keep-access-in-a-repository).

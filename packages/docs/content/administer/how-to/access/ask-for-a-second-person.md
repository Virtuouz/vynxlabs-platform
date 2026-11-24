---
title: Ask for a second person
description: "Make changes to the tenant's access wait for another person, and approve, decline, withdraw or go back."
subjects: [access, approval]
---

## Ask for a second person

You make changes to groups, service accounts, roles and what they are given wait until someone other than the person who made them approves. Turning it on needs two people.

### Before you start

- Two members must hold `access:write` at the tenant, directly or through a group. A tenant admin has it.
- Know what waits and what does not: see [Second-person approval](../../explanation/access/second-person-approval). A role given straight to a member or to every end user does not wait.

### Turn it on

:::steps
1. Open **Members & access**, then the **Access changes** tab.
2. Press **Ask for a second person**.
:::

The notice says "Changes to access now wait for a second person." A line above the list says "A change to access waits until someone other than whoever made it approves it." If fewer than two people hold `access:write`, the answer is "Approval needs two people who may change the tenant's access, so that one can answer the other. Give a second member a role with access:write first."

### Answer a change that waits

A change made while it is on is recorded with the status **Waits for approval**, and the person who made it is told "Nothing changed yet". A second person with `access:write`:

:::steps
1. Open **Access changes** and find the row with **Waits for approval**. Open its number to read every change it makes, and any warnings.
2. Press **Approve**. The dialog "Approve access change N?" lists what it does. Press **Approve** again. The change applies at once.
3. Or press **Decline**, optionally type why (1000 characters at most) and confirm. Nothing of it is applied, and the reason is shown to whoever asked.
:::

The person who asked sees "You asked for this. Someone else approves it." and can press **Withdraw**. Withdrawing needs no access permission. A service account's key cannot approve or decline: only a member signed in as themselves can. A key a member made counts as that member.

### What can go wrong with a change that waits

- **Superseded**: another change applied first, so this one can no longer apply as shown. Ask again.
- `release_stale`: "The tenant's access changed after this access change was asked for, so it is no longer the change that was shown. Withdraw it and ask again."
- `own_release`: "A change to access is approved by someone other than whoever made it."

### Go back to an earlier change

On an applied change, press **Go back to this**. The dialog lists what it removes under "These are removed:" and what it leaves out because it no longer exists. Confirm with **Go back**. The tenant's groups, service accounts, roles and what they are given become what they were then; who is in each group is not changed. A group or service account that was deleted since comes back empty, and a service account without keys. When approval is on, going back is itself a change that waits.

### Turn it off

Press **Stop asking for a second person** and confirm. Changes apply at once from then on. Changes that wait stay waiting until someone answers them. One person can turn it off.

### If it does not work

If **Approve**, **Decline** or **Go back to this** are missing, you lack `access:write`: the row says "You may read this, not answer it."

## Related

- [Access changes](../../reference/screens/access-changes), every control on the tab.
- [Second-person approval](../../explanation/access/second-person-approval).
- [Keep access in a repository](../../../develop/how-to/access/keep-access-in-a-repository): approve with `volvel tenant approve`.

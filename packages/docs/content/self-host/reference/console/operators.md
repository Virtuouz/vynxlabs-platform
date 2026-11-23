---
title: Operators
topic: instance-operators
description: "Every control, state and permission of the Operators screen: who runs the instance, Add operator, removing an operator, and the rule that keeps one who can sign in."
subjects: [operators, instance]
moved_from:
  - instance/operators
---

The **Operators** screen lists the members who run the instance and adds or removes them. An operator is a member who holds the role `operator_admin` at the instance. The role gives the **Instance** area and the permissions below. It gives no access inside a tenant: an operator reaches a tenant's contents only as one of its members or through a recorded access grant. F1 (**Help for this page**) opens the help topic `instance-operators`.

`operator_admin` holds `instance:*`, `tenant:*`, `member:*`, `binding:*`, `access_grant:*` and `audit:read`, all at the instance. It is the only role the instance area binds: the screen offers no other.

::screenshot{name=self-host/instance-operators alt="The Operators screen with a list of operators: member email, role operator_admin, since when, and a Remove or Remove yourself button on each row."}

## Controls

The title is **Operators**. The description reads "Members who run this instance. An operator manages tenants and members, and sees inside a tenant only through an access grant." The description shows the first time you open the screen. On later visits it is folded behind the **About Operators** button (the circled i) beside the title.

| Control | What it does |
| --- | --- |
| **Add operator** | Opens a dialog with one field, **Member** ("Find a member by email"). Type to search members; the field lists the first matches and says "Showing the first of many. Type to search." when there are more. Press **Add operator**. The member holds `operator_admin` from then on. Pressing **Add operator** with no member chosen is refused at the field: "Choose one." |
| **Search operators** | Filters the operators loaded by email, as you type. Kept in the address as `q`. |
| **Remove** | In each row. Asks "Remove EMAIL as an operator?" Press **Remove**. |
| **Remove yourself** | On your own row, in place of **Remove**. Asks "Remove yourself as an operator? You lose the Instance area at once, and another operator has to add you back." |

The columns. **Role** and **Since** give way on a narrow window. On a phone the buttons sit under the member.

| Column | What it shows |
| --- | --- |
| **Member** | The member's email, with a **Disabled** tag when the account is disabled. |
| **Role** | `operator_admin`. |
| **Since** | How long ago the role was bound. |

A disabled account cannot be made an operator: "That account is disabled. Enable it before making it an operator." The API binds only `operator_admin` at the instance ("Only the operator admin role can be bound at instance scope.").

Removing an operator also ends the operator access grants they had opened. A disabled operator keeps the role and is listed with the **Disabled** tag, but cannot sign in, so does not count as an operator who can.

### The last operator

The instance keeps at least one operator who can sign in. Removing the role from the last one, disabling them (from [All members](members), or through a directory sync, which is refused the same way), is refused with "That would leave the instance with no operator who can sign in. Make someone else an operator first." The text is shown on the screen with the request ID.

If no operator can sign in anyway, for example because the only one lost their password, the way back is a command run on the machine, not a screen: [Recover an operator](../../how-to/access/recover-an-operator).

## States

| State | What you see |
| --- | --- |
| Empty | "No operators". |
| Search finds none | "Nothing matches" with "Try fewer or other words." |
| Not loaded | The error state with a retry. |
| Read only for you | A line says "You can see the operators, not change it. It needs `binding:write`. Ask an operator of this instance to give you access." **Add operator** and the row buttons are disabled. |
| Read only instance | The strip "The instance is read only." is on every screen. The **Add operator** dialog's button is disabled with the reason. |
| Not an operator | A person who is not an operator who opens `/instance/operators` sees "For operators". |

## Permissions

| Action | Needs |
| --- | --- |
| See the list | `binding:read` at the instance. |
| **Add operator**, **Remove**, **Remove yourself** | `binding:write` at the instance. |

See the [permissions reference](../../../administer/reference/permissions).

## Related

- [All members](members): making the account, disabling it.
- [Instance audit log](audit-log): `binding.created` and `binding.deleted`, with `operator.access` entries in the tenants themselves.
- [Operator access](../../../administer/reference/screens/operator-access): how an operator reaches a tenant they do not belong to.
- [Recover an operator](../../how-to/access/recover-an-operator).

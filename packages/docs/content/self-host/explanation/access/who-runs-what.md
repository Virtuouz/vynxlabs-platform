---
title: Who runs what
description: "Operators and tenant admins: what each runs, why an operator sees inside a tenant only through a grant, and what an operator's account does not do."
subjects: [access, operators]
---

An instance has two kinds of people with power. Operators run the instance. Tenant admins run a tenant. This page says where one stops and the other starts.

## The idea

An **operator** is a member bound to the role `operator_admin` at the instance. That role holds `tenant:*`, `member:*`, `binding:*`, `access_grant:*`, `instance:*`, `audit:read` and `export:write`. Only `operator_admin` may be bound at the instance: no other role is accepted there.

A **tenant admin** holds `tenant_admin` (`*:*` and `sql:read`) in one tenant. They run its workspaces, people, groups, roles, keys and apps.

An operator makes tenants and members, and sees the instance's health, tenants and operators in the **Instance** area, which opens only for operators.

### Why an operator cannot see inside a tenant

A binding at the instance never reaches inside a tenant. An operator gets into a tenant by opening an access grant: a built-in tenant role, for a time of 1 to 1440 minutes, with a reason of 3 to 500 characters. The tenant's admins see the grant, the reason and every request made under it, reads included. They can end it at any time. It ends by itself, and also when the operator is removed or disabled.

This is a decision about who is trusted with what: the operator runs the machine but is not given the tenant's data by being an operator. One exception is the operator's own choice: the dialog that makes a tenant has the box **Make me a member, as tenant admin**, on by default. With it, the operator is a member of the new tenant like any other and holds `tenant_admin` there, with no grant. Without it, the grant is the only way in.

## How it fits

### Accounts and sign-in

A member's account is one account on the instance, whatever the number of tenants they belong to. A tenant's identity provider does not sign in a member who holds an instance binding, and the instance's own provider gives no role.

### Disabling and the last operator

An operator can disable any account at the instance. Disabling is never refused for a tenant's sake: the answer and the audit entry name the tenants left with no admin. It is refused only for the last operator who can sign in. Removing the last operator is refused too. Disabling ends sessions, grants, open streams and sign-ins not finished, and enabling does not bring them back.

### Passwords

A tenant admin can make a password reset link for a member who belongs to their tenant and no other and holds nothing at the instance. For anyone else, only an operator makes it. If no operator can sign in, [recover an operator](../../how-to/access/recover-an-operator) from the machine.

## Related

- [Support access for operators](../../../administer/how-to/access/support-access-for-operators).
- [Members and operators](../../reference/console/members).

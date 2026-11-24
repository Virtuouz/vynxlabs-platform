---
title: Define roles and bindings in code
description: "Write a role and who holds it for one workspace as two YAML files, so that they deploy with the workspace, and write them in TypeScript when you need to."
subjects: [access, sdk]
---

## Define roles and bindings in code

You write a role and a binding in the repository so that they are deployed and promoted with one workspace.

### Before you start

- A repository of resources (see [Keep access in a repository](keep-access-in-a-repository) for the tenant's own groups and roles).
- You hold `bundle:write` and `deployment:write` in the workspace.
- What you define reaches one workspace. A role that must exist in the whole tenant is a `tenant_role` file.

:::steps
1. Write the role as a file in the console's folder, `platform/roles/order-reader.role.yaml`. Its path, `roles/order-reader`, is where it is kept. `name` is what bindings call it by.
2. Write who holds it, `platform/bindings/support-reads-orders.binding.yaml`, naming the role by `name` and the principal.
3. Run `volvel deploy --tenant <slug> --workspace <slug>`. The output lists `role` and `binding`.
:::

```yaml title=platform/roles/order-reader.role.yaml
schemaVersion: 1
body:
  name: order_reader
  description: Reads orders.
  permissions:
    - table:read
    - data:read
```

```yaml title=platform/bindings/support-reads-orders.binding.yaml
schemaVersion: 1
body:
  role: order_reader
  principal:
    type: group
    key: billing
```

```text
Deployed version 1 to cli-dev (dev): 2 created, 0 updated, 0 deleted, 0 unchanged.
  created  role       roles/order-reader
  created  binding    bindings/support-reads-orders
```

The two files are checked as you type once you run `volvel schemas`.

### Principals

`principal` is `{ type: member, email }`, `{ type: group, key }`, `{ type: service_account, key }`, `{ type: end_user_group, key }`, `{ type: end_user, email }`, `{ type: end_users }` (every signed-in end user) or `{ type: anonymous }`. Naming a group or service account by `name` still works and breaks when the title changes: use `key`. A role is looked up in the workspace first, then the tenant, then the built-in roles. An app's own pages say who may open them with the same bindings.

### In TypeScript

Write the same two with `defineRole` and `defineBinding` when a list of permissions or a principal is shared by many bindings and you want it in one place: see [Definitions in code](../../explanation/cli/definitions-in-code). A binding there names the role by the role's definition, and the build writes the role's name.

```ts title=src/access.ts
import { defineBinding, defineRole } from "@volvel/sdk";

export const reader = defineRole({
  path: "roles/order-reader",
  name: "order_reader",
  description: "Reads orders.",
  permissions: ["table:read", "data:read"],
});

export const forSupport = defineBinding({
  path: "bindings/support-reads-orders",
  role: reader,
  principal: { type: "group", key: "billing" },
});
```

Export both from the entry file. They are then owned as **Code**. `volvel convert` turns these two into the files above.

### The result

The role and the binding are in the workspace. A binding from the repository, whether a file or code, is listed on the **Access** tab with the tag **From repository** and no **Remove**: change it in the repository.

### If it does not work

- **A principal that does not exist** is refused when the version is deployed: `Could not deploy to <workspace>. The binding refers to something that does not exist.`, then `no group has the key "nobody" in this tenant.` and what to add. The line does not name the file.
- **A role that does not exist** is refused at upload: `Could not upload the bundle. The bundle's manifests are not valid.` and `/body/role refers to "nobody", which is not a role in this repository, a built-in role or one of the tenant's.`
- **A binding that names a role by its path** fails the build: `/body/role refers to "roles/order-reader", which is a role's path. A binding names a role by its name: "order_reader".`

## Related

- [Access](../../../administer/reference/screens/access).
- [Roles](../../../administer/reference/screens/roles).

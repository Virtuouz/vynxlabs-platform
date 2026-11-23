---
title: Define roles and bindings in code
description: "Declare a role and who holds it for one workspace with defineRole and defineBinding, so that they deploy with the workspace."
subjects: [access, sdk]
---

## Define roles and bindings in code

You declare a role and a binding in the repository's TypeScript so that they are deployed and promoted with one workspace.

### Before you start

- A repository of resources (see [Keep access in a repository](keep-access-in-a-repository) for the tenant's own groups and roles, which are YAML).
- What you define reaches one workspace. A role that must exist in the whole tenant is a `tenant_role` file.

:::steps
1. Declare the role with `defineRole`, giving its `path`, the `name` bindings use, and its permissions.
2. Declare who holds it with `defineBinding`, naming the role and the principal.
3. Run `volvel deploy --tenant <slug> --workspace <slug>`.
:::

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
  principal: { type: "group", key: "tech-desk" },
});
```

### Principals

`principal` is `{ type: "member", email }`, `{ type: "group", key }`, `{ type: "service_account", key }`, `{ type: "end_user_group", key }`, `{ type: "end_user", email }`, `{ type: "end_users" }` (every signed-in end user) or `{ type: "anonymous" }`. Naming a group or service account by `name` still works and breaks when the title changes: use `key`. A role is looked up in the workspace first, then the tenant, then the built-in roles. An app's own pages say who may open them with the same bindings.

### The result

The binding is listed on the **Access** tab with the tag **From repository** and no **Remove**. Change it in the repository.

### If it does not work

A principal that does not exist, or a role that does not, is refused when the version is deployed, naming the path.

## Related

- [Access](../../../administer/reference/screens/access).
- [Roles](../../../administer/reference/screens/roles).

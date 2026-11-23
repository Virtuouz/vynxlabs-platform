---
title: Tenant files
description: "The five kinds of file that hold a tenant's access as YAML, with their fields, limits and where they go."
subjects: [access, tenant-files]
---

A tenant's own access is kept as YAML files: its groups, groups of end users, service accounts, roles, and the bindings that give them out. They are read by `volvel tenant plan`, `release` and `pull`, and by the access API. There is no SDK helper for them: the files and the API are the only way (for a workspace's roles and bindings, see [Define roles and bindings in code](../../how-to/access/define-roles-and-bindings-in-code)).

## Files

| Kind | Folder | File name | Holds |
| --- | --- | --- | --- |
| `group` | `groups` | `<key>.group.yaml` | A group of members. |
| `end_user_group` | `end-user-groups` | `<key>.end_user_group.yaml` | A group of end users. |
| `service_account` | `service-accounts` | `<key>.service_account.yaml` | A service account. |
| `tenant_role` | `roles` | `<key>.tenant_role.yaml` | A role of the tenant's own. |
| `tenant_binding` | `bindings` | `<key>.tenant_binding.yaml` | A role given to a group, a service account or a group of end users. |

The default folder is `tenant/`. A file is found wherever it is in the repository: any file named `<key>.<kind>.yaml` for one of these kinds. The folders `node_modules`, `dist`, `build` and any folder starting with a dot are skipped.

A key is the file name before the kind. It is one segment of lowercase letters, digits, hyphens and underscores, starting with a letter or digit, 63 characters at most (a role's key is its name: it starts with a letter and has no hyphen). The key never changes. A file may say `key:` when the key is not its name.

## Fields

Every file has `schemaVersion: 1`. Other top-level fields are `key`, `title` and `body`. A file with any other top-level field is refused.

### group and end_user_group

| Field | What it takes |
| --- | --- |
| `title` | Required. 1 to 200 characters, no space at either end. What people read; it can change. |
| `body.description` | Up to 500 characters. |
| `body.membership.sso.values` | 1 to 50 distinct values, each 1 to 200 characters. Whoever signs in with one of them in the provider's groups claim is in the group. Who is in a group is not otherwise in a file. |

### service_account

| Field | What it takes |
| --- | --- |
| `title` | Required, as above. |
| `body.description` | Up to 500 characters. |

### tenant_role

| Field | What it takes |
| --- | --- |
| `body.permissions` | Required. Up to 200 distinct permissions, each `kind:verb` with `*` for either half. |
| `body.description` | Up to 500 characters. |

A role file may carry a `title`; it is read and set aside, because a role is known by its name.

### tenant_binding

| Field | What it takes |
| --- | --- |
| `body.role` | Required. A role's name: a role of the tenant's own, or a built-in role. |
| `body.principal.type` | Required. `group`, `service_account` or `end_user_group`. A person is never named in a file. |
| `body.principal.key` | Required. The key of the principal. |
| `body.workspace` | A workspace's slug. Without it the role is held in the whole tenant. |

A binding file may carry a `title` too, and it is set aside. What makes a binding the one it is is what it gives to whom and where, not the name of its file.

## Examples

```yaml title=tenant/groups/tech-desk.group.yaml
title: Tech Desk
schemaVersion: 1
body:
  description: Staff who decide device requests and hand devices out.
```

```yaml title=tenant/groups/acc-ops.group.yaml
title: Acc Ops
schemaVersion: 1
body:
  description: Operations.
  membership:
    sso:
      values:
        - ops
```

## Checks

The files are checked together. A problem names the file: "needs schemaVersion: 1.", "is not valid YAML.", "has keys other than key, title, schemaVersion and body: …", or a schema line that begins with the kind and the file, such as `tenant role x (roles/x.tenant_role.yaml): …`. A binding that names a principal or a role that is not in the set or the tenant is refused. The JSON schemas are in `schemas/files/` (`group`, `end_user_group`, `service_account`, `tenant_role`, `tenant_binding`) and `volvel schemas` writes them.

## Related

- [Keep access in a repository](../../how-to/access/keep-access-in-a-repository).
- [Call the access API](../../how-to/access/call-the-access-api).

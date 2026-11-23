---
title: Keep access in a repository
description: "Write a tenant's groups, roles, service accounts and bindings as YAML files, plan and release them with the CLI, and approve or go back."
subjects: [access, tenant-files]
---

## Keep access in a repository

You keep the tenant's groups, groups of end users, service accounts, roles and the bindings that give them out as files in a repository, and make the tenant match them with one command.

### Before you start

- A key of a member who holds `access:write` for `release`, `approve`, `rollback` and `approval`, and `access:read` for `plan` and `pull`. A tenant admin has both. See [Make an API key](../../../console/how-to/account/make-an-api-key) and `volvel login`.
- A repository, or an empty folder, in the current directory (or give `--dir <path>`).

:::steps
1. Make the files under `tenant/`, named `<key>.<kind>.yaml`. For example `tenant/groups/acc-support.group.yaml`, `tenant/roles/acc_ticket_reader.tenant_role.yaml` and `tenant/bindings/support-reads.tenant_binding.yaml`. The files are in the [tenant files reference](../../reference/access/tenant-files).
2. Run `volvel tenant plan --tenant <slug>`. It shows what a release would do and changes nothing.
3. Run `volvel tenant release --tenant <slug> --message "Support group"`.
:::

The files, as the plan and release above ran them on a tenant:

```yaml title=tenant/groups/acc-support.group.yaml
title: Acc Support
schemaVersion: 1
body:
  description: Support staff.
```

```yaml title=tenant/roles/acc_ticket_reader.tenant_role.yaml
schemaVersion: 1
body:
  description: Reads tables.
  permissions:
    - table:read
    - data:read
```

```yaml title=tenant/bindings/support-reads.tenant_binding.yaml
schemaVersion: 1
body:
  role: acc_ticket_reader
  principal:
    type: group
    key: acc-support
```

### The result

```text
Changed acc-main's access as access change 6: 3 created, 0 updated, 0 deleted, 3 unchanged.
  created  tenant_role      acc_ticket_reader
  created  group            acc-support  (Acc Support)
  created  tenant_binding   support-reads  (acc_ticket_reader to group acc-support)
```

The change is on the **Access changes** tab, marked **From the repository**.

### Start from what is there

`volvel tenant pull --tenant <slug>` writes the tenant's access as it is into the repository, one file for each thing, and says which files are new. A release is the whole set: what the tenant has and the files do not is not removed unless you name it with `--allow-delete <kind>/<key>`, such as `--allow-delete group/acc-finance`. Without it the release is refused: "This access change would remove what the tenant has and the repository does not."

### Approval and going back

When the tenant asks for a second person, a release waits and says "Nothing changed yet. Someone else approves it with: volvel tenant approve N --tenant <slug>". The commands are `volvel tenant approve N`, `decline N [--comment <text>]`, `withdraw N` and `releases`, which lists the changes. `volvel tenant rollback N` prints what going back removes and asks, or takes `--yes`. `volvel tenant approval on|off` turns approval on or off, and without `on` or `off` says which it is. The commands are in the [CLI reference](../../reference/cli).

### Things to know

- Who is in a group is not in the files. A group can fill itself from sign-in values (`membership.sso.values`, up to 50). A person is never named in a binding file.
- A role given to a member, a role on one thing, and a role a workspace defines are not in these files. See [Define roles and bindings in code](define-roles-and-bindings-in-code).
- The files are the only way to write these kinds in code: Volvel has no SDK helper for them.

### If it does not work

- "The tenant's access cannot be read." and the lines under it name the file and the problem, such as `tenant role x (roles/x.tenant_role.yaml): …` followed by the schema line. A role and a binding file may carry a `title`, but it is set aside.
- `own_release`, `release_stale`, `delete_not_allowed`: see [Access changes](../../../administer/reference/screens/access-changes).

## Related

- [Call the access API](call-the-access-api): the same, from your own script.
- [Ask for a second person](../../../administer/how-to/access/ask-for-a-second-person).

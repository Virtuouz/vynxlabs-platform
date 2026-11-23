---
title: What the instance screens do not do
description: "What an operator looks for on the instance's screens and does not find, and the way round for each."
subjects: [instance, operators]
---

The instance's screens are the ones in the **Instance** area: [All tenants](../../reference/console/tenants), [All members](../../reference/console/members), [Operators](../../reference/console/operators), [Database locations](../../reference/console/databases), [Import a tenant](../../reference/console/import), [Triggers](../../reference/console/triggers), [Health](../../reference/console/health), the [audit log](../../reference/console/audit-log), [Console branding](../../reference/console/branding) and the [Component kit](../../reference/console/component-kit). This page lists what an operator might expect on them and will not find. Each is said once, with the way round where there is one. It describes the product as it is now.

## Tenants

- **Suspending a tenant.** There is no switch that turns a tenant off while keeping it. "Suspend" exists for a member inside one tenant only. The ways to stop a tenant's activity are to pause every trigger on the instance ([Triggers](../../reference/console/triggers)), to start no workers for it (the **Workers the instance starts** panel in the tenant's inspector), or to delete it.
- **Quotas, storage limits and usage.** The instance does not count or cap a tenant's rows, files or storage, and the screens show no usage.
- **Sharing between tenants.** A tenant's data is its own. Nothing is shared across tenants.
- **Moving a tenant in place.** A tenant's database location is chosen when it is made or imported, and the screens and the API offer no way to change it. Moving a tenant between locations, or between instances, is export, delete and import: see [Move a tenant](../../how-to/instance/moving-a-tenant). Deleting is part of it, because a tenant that is still here cannot be imported.
- **Isolation beyond the database.** A database location holds a tenant's custom tables. It does not move the tenant's other data, such as its resources and members, which stay in the instance's database.
- **Renaming a tenant's slug.** The slug is permanent.
- **Rename and the console-code switch on every tenant row.** They are drawn for a tenant the operator belongs to or holds a grant for. For another tenant the API accepts the change from an operator, and the screen does not offer it.
- **A command for the console-code switch.** `tenant.console_code` is changed on the screen and through the API. The CLI has no command for it.

## Members and operators

- **Editing or deleting a member.** An operator can create a member, disable and enable one, and make a one-time password reset link. There is no edit of a name or email, and no delete: a member who should not sign in is disabled, and the account and what it holds are kept.
- **Setting a member's password.** An operator does not see or set a member's password. The reset link lets the member choose a new one. A member who signs in only through an identity provider that has turned passwords off for them has no password to reset.
- **Any role but `operator_admin` at the instance.** The screen and the API bind only that role. An instance's identity provider does not give a role either: the people who run the instance are made operators one by one.
- **An operator inside a tenant without a grant.** The role gives the **Instance** area and nothing inside a tenant. Opening a tenant the operator is not in takes an operator access grant, with a reason and a time limit, recorded in the tenant's log. See [Operator access](../../../administer/reference/screens/operator-access).
- **A way back into the console with no operator.** No screen can add an operator when none can sign in. The way back is a command run on the machine: [Recover an operator](../../how-to/access/recover-an-operator).

## Triggers

- **A drain.** There is no command that cancels the runs that are queued or running when triggers are paused. A tenant cancels them from the workspace's runs list.
- **Replaying what came in during a pause.** An event received while triggers are paused is kept and starts nothing; a webhook is refused with 503. The instance starts neither afterwards. A schedule fires once when the pause ends.
- **A pause for one tenant from the instance screens.** The pause on the **Triggers** screen is for the whole instance. A workspace's own pause is made in the workspace.

## Audit

- **Deleted tenants as an area.** The **Area** filter of the [instance audit log](../../reference/console/audit-log) does not list them. Their entries are reached with **Everything**, or by search.
- **Saved views and a workspace filter.** These are on a tenant's log. The instance log has none.

## Where to look instead

For setting up, running and upgrading the instance, the self-hosting pages. For what a tenant's own people do, the Administer collection. For the screens' controls, the reference pages above.

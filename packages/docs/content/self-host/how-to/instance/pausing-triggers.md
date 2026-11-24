---
title: Pause every trigger
description: "Stop every schedule, webhook, form and event in every tenant at once from the console or the terminal, and resume them."
subjects: [triggers, instance]
---

## Pause every trigger

You stop all triggers in every tenant of the instance at once, for example while scripts are piling up faster than they finish, and start them again afterwards. Runs that are already queued or running carry on.

## Before you start

- You are an operator with `instance:write` at the instance. The role `operator_admin` has it.
- The instance's own environment does not hold `TRIGGERS_PAUSED`. If it does, the console cannot resume: see the last section.
- For the terminal, `volvel login` was run with an operator's API key.

## Pause and resume

:::tabs
::::tab{label=Console}
:::steps
1. Open **Instance**, then **Triggers**. The panel reads **Triggers are on**.
2. Press **Pause every trigger**.
3. In "Pause every trigger?", type a **Why** if you want one (it is optional, up to 500 characters, shown on the screen and kept in the audit log). Press **Pause every trigger**.
4. The console says "Every trigger is paused." The panel becomes a notice, **Every trigger is paused.**, with when and why.
5. To resume, press **Resume triggers**. The console says "Triggers are running again."
:::
::::
::::tab{label=Terminal}
:::steps
1. `volvel instance triggers` says where it stands: "Triggers are running."
2. `volvel instance triggers pause --reason "database move"` says "Every trigger is paused. Runs already queued or going carry on."
3. `volvel instance triggers` now says "Every trigger is paused." and "Why: database move".
4. `volvel instance triggers resume` says "Triggers are running again."
:::
::::
:::

## The result

While it is paused, nothing starts from a schedule, a webhook, a form, an event or a trigger source in any tenant. Each replica notices within 2 seconds. Every workspace says "Paused by the instance" in its header and on its **Overview**, and a person with a workspace open can see why nothing starts. The pause and the resume are in the [instance audit log](../../reference/console/audit-log) as `instance.triggers_paused` and `instance.triggers_resumed`, with the reason.

After a resume, a schedule fires once, even if it missed several times. A webhook that came in during the pause was answered with 503 and was not started: whether it is sent again is up to the sender. An event that came in during the pause is kept and is not started afterwards. What each trigger kind does is listed on [Triggers](../../reference/console/triggers).

## If it does not work

- **"TRIGGERS_PAUSED is set where the instance runs. Unset it and restart to resume."** The environment holds the pause, so there is no **Resume triggers** button and the CLI cannot undo it. Unset the variable and restart each replica.
- **The buttons are disabled with "It needs `instance:write`".** You lack the permission. Ask another operator.
- **A pause is refused with 503 "read_only".** The database takes no writes. See [Instance health](../../reference/console/health).
- **Runs are still running.** A pause does not stop them. A tenant cancels them from the workspace's runs list; there is no instance-wide command for it.
- **A workspace still says "Paused" after the resume.** That workspace's own triggers are paused by its people, which is a separate switch.

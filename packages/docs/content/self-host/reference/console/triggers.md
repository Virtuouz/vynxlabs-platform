---
title: Triggers
topic: instance-triggers
description: "Every control, state and permission of the Triggers screen: the emergency stop that pauses every schedule, webhook, form and event in every tenant, what keeps running and how each workspace says so."
subjects: [instance, triggers]
moved_from:
  - instance/triggers
---

The **Triggers** screen is the operator's emergency stop. One switch pauses every trigger in every tenant of the instance, whatever each workspace says, so that nothing new starts while an operator deals with an instance that is falling behind. Pausing is for the whole instance. A single workspace's triggers are paused from the workspace, by the tenant's own people. This screen is in the **Instance** area. F1 (**Help for this page**) opens the help topic `instance-triggers`.

::screenshot{name=self-host/instance-triggers alt="The Triggers screen with the Emergency stop section: Triggers are on, a sentence on what pausing does, and the Pause every trigger button."}

## Controls

The title is **Triggers**. The description reads "Stop every schedule, webhook, form and event in every tenant at once." The section is **Emergency stop**.

| Control | Shown when | What it does |
| --- | --- | --- |
| **Pause every trigger** | Triggers are on. | Opens a dialog "Pause every trigger?": "No schedule, webhook, form or event starts anything in any tenant until you resume. Schedules keep their times and fire once on resuming. Runs already queued or going carry on." It has one field, **Why** (optional, at most 500 characters, "Shown here, and kept in the audit log."), and the button **Pause every trigger**. The result is "Every trigger is paused." |
| **Resume triggers** | Triggers are paused by an operator. | Resumes at once, without asking. The result is "Triggers are running again." |

While triggers are on, the panel reads **Triggers are on** and "Pausing stops them across the instance at once, whatever each workspace says. Use it when scripts are piling up faster than they finish."

While they are paused, a notice reads **Every trigger is paused.** and "Paused TIME: REASON" (or "Paused TIME." with no reason), with **Resume triggers**.

When the instance was started with `TRIGGERS_PAUSED` set, the notice reads "TRIGGERS_PAUSED is set where the instance runs. Unset it and restart to resume." and there is no **Resume triggers** button: the console cannot undo what the environment says.

From a terminal, the CLI does the same: `volvel instance triggers` shows where it stands, `volvel instance triggers pause [--reason <text>]` and `volvel instance triggers resume` change it. Both need an operator's API key. The steps are in [Pause every trigger](../../how-to/instance/pausing-triggers).

### What a pause does

| What | While every trigger is paused |
| --- | --- |
| A schedule | Keeps its due time and fires once when triggers resume. It does not fire once for each time it missed. |
| A webhook | Is refused with 503 `trigger_paused` and "Every trigger in this instance is paused, so the webhook started nothing. Try again later." The refusal is recorded as a refused request with the reason `paused`. A sender that retries gets through after the resume. |
| A form | Is answered with 503 and a page that says "This form is not taking answers at the moment. Try again later." |
| An event | Is kept, and starts nothing. Resuming does not start an event that came in while triggers were paused. |
| A trigger source (a poll) that is already running | What it returns is not started; the pause is recorded as a refusal. |
| Firing a schedule by hand | Is refused: "Every trigger in this instance is paused, so this schedule cannot be fired now." |
| Runs already queued or running | Carry on. There is no drain: a tenant cancels them from its workspace's runs. |
| Runs started by hand | Still work. |

The pause is read at most every 2 seconds on each replica. Each workspace says so: its header shows the pill **Paused by the instance**, its **Overview** says "Triggers are paused by the instance" ("An operator has paused every trigger in this instance. Nothing starts here until they resume them. Runs started by hand still work."), and its settings and triggers list show the same. The reason is not shown there, only here and in the audit log.

## States

| State | What you see |
| --- | --- |
| Loading | The screen's loading state. |
| Not loaded | The error state with a retry. |
| A change is refused | A red notice with the server's words. |
| Read only for you | A line says "You can see whether triggers run, not change it. It needs `instance:write`. Ask an operator of this instance to give you access." The buttons are disabled. |
| Read only instance | The strip "The instance is read only." is on every screen. A pause is a change and is refused with a 503. |

## Permissions

| Action | Needs |
| --- | --- |
| See whether triggers are paused (`GET /instance/triggers`, `volvel instance triggers`) | `instance:read` at the instance. |
| **Pause every trigger**, **Resume triggers** | `instance:write` at the instance. |

The pause and the resume are recorded in the [instance audit log](audit-log) as `instance.triggers_paused` and `instance.triggers_resumed`, with the reason.

## Related

- [Pause every trigger](../../how-to/instance/pausing-triggers): the steps, from the console and the terminal.
- [Import a tenant](import): an imported tenant arrives with its triggers paused in each workspace.
- [Instance health](health): the **Triggers** line says when the environment pauses them.

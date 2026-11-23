---
title: Publish an event by hand
description: Publish a declared event from the Events screen to try what listens for it, and see which runs it started.
subjects: [events]
---

## Publish an event by hand

By the end you will have published an event with a payload, and seen what it started, or that nothing listens for it.

## Before you start

- You hold `event:write` in the workspace. A workspace admin has it. See the [permissions reference](../../../administer/reference/permissions).
- The event is declared in the workspace, with `defineEvent` in the repository or under **All resources**. An event that is not declared cannot be published here.
- Events whose names begin `platform/` are Volvel's own. They are not offered: only Volvel publishes those.

## Publish it

:::steps
1. Open **Operate**, then **Events**, and press **Publish an event**. On a declared event's own page, press **Publish it** instead: the event is already chosen.
2. Under **Event** choose the event. Each is listed with its description.
3. Fill in the payload. The fields are drawn from the event's schema; a required one is marked. **JSON**, under **How to give it**, takes the payload as JSON. If a value is refused, the dialog shows why at that field, or, in the JSON view, above it with the path of the value ("/count: Enter a number.").
4. Press **Publish**. In a production workspace the console first asks "Publish *name* in production?" and says "Every trigger that listens for it starts its work now, with real data." Press **Publish in production**.
5. Read the notice: "Published. It started N run(s)." or "Published. Nothing listens for it, so it started nothing."
:::

## The result

The event is the first row of the **Events** list, with **The API** under **From**. Choose it: **What it started** lists each run with its state, **Listening** counts the triggers that listen, and **Payload** shows what was published.

If the workspace's triggers are paused, or every trigger that listens is paused, the event is stored and starts nothing. The row says "Listeners are paused" under **Started**, and the notice says "Every trigger that listens for *name* here is paused, so none of them started anything."

From a script, `ctx.events.publish` does the same, and so does `POST …/events` with a `name` and a `payload`.

## If it does not work

- **"No event is declared in this workspace yet."** Declare one with `defineEvent`, or under **Resources**, and deploy it.
- **The button is disabled.** You need `event:write`. The tooltip says what is missing.
- **"Nothing listens for it, so it started nothing."** No event trigger or flow start names this event and is on. Add one, then publish again.
- **A listener started and refused it.** A trigger's **Only when** filter failed, or the payload does not fit what it starts. The trigger shows **Last refused** with the reason on the [Triggers](../../reference/screens/operate/triggers) screen.
- **"Events under platform/ are published by Volvel itself."** The name begins `platform/`.

## Related

- [Events](../../reference/screens/operate/events): every control of the screen.
- [Platform events](../../../develop/reference/platform-events)

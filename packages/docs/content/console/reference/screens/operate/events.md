---
title: Events
topic: operate-events
description: "Every control, state and permission of the Events screen: the log of published events, its filter, the inspector with what each event started, and Publish an event."
subjects: [events]
moved_from:
  - operate/events
---

The **Events** screen is the log of what has been published in one workspace, newest first. An event has a name, a payload and a publisher. Triggers and flows listen for an event by name, and the log shows how many triggers listened and what each one started.

The screen is reached from **Operate**, then **Events**. F1 (**Help for this page**) opens the help topic `operate-events`. An event that is declared has a page of its own with the button **Publish it**.

::screenshot{name=console/operate-events alt="The Events screen: a filter by event name, the Publish an event button, and a list of events with when, name, publisher and what each started, with one event's details open beside it."}

## Controls

| Control | What it does |
| --- | --- |
| **Publish an event** | Opens the dialog described below. Needs `event:write`. |
| **Exact event name** | A box with the placeholder "An event's name, such as orders/placed". The name must be exactly the event's. Kept in the address as `?name=`. |
| **Show** | Applies the name. |
| **Show every event** | Appears when a name is applied; clears it. |
| **Saved views** | The bookmark menu of the [Runs](runs) screen: it keeps the name filter. Your own, up to 50 for this list. |

### The list

A page holds 100 events. The foot says "Showing the first N events." with **Load more**, or "Showing N events." when there are no more. If the next page does not load, it says "The next page did not load: *reason*" and offers **Try again**. Events are kept 30 days unless the tenant's retention says otherwise.

| Column | Shows |
| --- | --- |
| **When** | How long ago. |
| **Event** | The name. |
| **From** | The script that published it, or **A script**, **The API** or **The platform**. |
| **Started** | "N run(s)", or "Nothing" when triggers listened and none started anything, or "Nothing listens" when no trigger listens, or "Listeners are paused" when the triggers that listen are all held. |

### The inspector

Choosing a row puts the event's ID in the address (`?item=`) and opens it. An ID that no event of this workspace has opens **Event not found**: "No event with that ID is in this workspace. It may belong to another workspace, or have been removed with the older ones."

- **Published by**: the script's run, linked, or **A script**, **The API**, **The platform**.
- **Listening**: how many triggers would start something now: "2 triggers", "1 trigger", "2 triggers, all paused" or "1 trigger, and 1 paused". Only triggers that are on are counted.
- **Event ID**.
- A notice when nothing listens: "No flow or script listens for *name* here." or "Every trigger that listens for *name* here is paused, so none of them started anything."
- **What it started**: each run, linked, with its real state.
- **Payload**: the payload as published, masked by the event's schema.

## Publish an event

**Publish an event** (or **Publish it**, on an event's own page, where the event is already chosen) opens a dialog titled **Publish an event** (or **Publish *name***).

- **Event**: a list of the events declared in this workspace, each with its description. If there are none, the dialog says "No event is declared in this workspace yet. Declare one with defineEvent, or under Resources, and it can be published here."
- The payload, as fields drawn from the event's schema, or as JSON (**How to give it**: **Fields** or **JSON**). A fault the server finds in a field is shown at that field.
- **Publish**. The notice says "Published. It started N run(s)." or "Published. Nothing listens for it, so it started nothing."

In a production workspace the dialog warns "This is production. Publishing starts what listens for the event, with the payload given here." and, before sending, asks "Publish *name* in production?" ("Every trigger that listens for it starts its work now, with real data.") with **Publish in production** and **Do not publish**. If the event is named on its own page but is not declared, the dialog says "*name* is not declared in this workspace, so there is no payload to ask for."

The platform's own events, whose names begin `platform/`, are not offered: the server refuses a publish of one with "Events under platform/ are published by the platform itself." They appear in the log with **The platform** as publisher. They are listed in [Platform events](../../../../develop/reference/operate/platform-events).

### How events start work

- An event started by a script (`ctx.events.publish`), by the API (`POST …/events` with a `name` and a `payload`) or by this dialog is stored, then offered to each trigger that listens for its name.
- A trigger's **Only when** filter and its input must accept the payload. If a filter fails, or the payload does not fit what the trigger starts, that trigger is skipped, a refusal is recorded on it and the other triggers still start. The refusal shows on the trigger as **Last refused**, for 7 days.
- A chain of events that cause events stops at depth 10: the event at that depth is stored and starts nothing.
- In a workspace whose triggers are paused, an event is stored and starts nothing.

## States

| State | What the screen shows |
| --- | --- |
| Empty | "No events yet" (or "No *name* events yet" when a name is applied) with "Declare an event with defineEvent, and publish it from a script with ctx.events.publish." |
| Error | The error with a retry. |
| Loading more | **Load more** reads the next 100. |

## Permissions

| Action | Needs |
| --- | --- |
| See the list and the payloads | `event:read` |
| **Publish an event**, **Publish it** | `event:write` |
| Change an event's declaration | `resource:write` |

## Related

- [Publish an event](../../../how-to/operate/publish-an-event)
- [Platform events](../../../../develop/reference/operate/platform-events)
- [Triggers](triggers)

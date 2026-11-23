---
title: Ways a flow starts
description: "The five starts a flow can have as the editor offers them: the settings of each, what each hands the flow, and the limits."
subjects: [flows, triggers]
---

A flow starts at a start step, and a flow may have several. The inspector's **It starts** list changes a start's kind; each kind keeps its own settings while the step is open, and tags carry across. The generated [flow starts](../../../develop/reference/flows/starts) list the same by the names a file uses. How a webhook keeps its address is in [A webhook's address and its key](../../../develop/explanation/flows/webhook-address-and-key).

| Start | `It starts` says | What `trigger` holds |
| --- | --- | --- |
| **By hand** | By hand, or from another flow | The input. |
| **On a schedule** | On a schedule | An empty object. |
| **On an event** | When an event is published | The event's payload. |
| **On a webhook** | When its address is called | The body, or the whole request. |
| **On a form** | When someone fills in its form | One value for each question. |

## By hand

An optional input schema, drawn as fields: a name, a type, **required**, a description, shortest and longest or smallest and largest, **Remove** and **Add a field**, over a JSON box that is kept while you type. Input given when the flow is started by hand, from the API, by an agent or as a sub-flow must match it. It draws the **Start flow** form and the tool an agent is given. Without a schema, any object is accepted.

## On a schedule

| Field | What it takes |
| --- | --- |
| Presets | **Every hour**, **Every day at 9:00**, **Weekdays at 9:00**, **Mondays at 9:00**, **The first of each month**, **Your own**. |
| **When, as a cron line** | A cron line. The next five times are shown. |
| **Time zone** | A new schedule takes the workspace's. |
| **Skip a time while the run it started last is still going** | On by default for a flow's start. Off lets another run start. |
| **Trigger source (optional)** | A trigger source of your own. A source that is only a draft is offered too. |

**Fire now** is on the Triggers screen and in the command menu. It does not work while the schedule, its workspace or the instance is paused.

## On an event

| Field | What it takes |
| --- | --- |
| **Event** | The workspace's own events, then the platform's: `platform/run-succeeded`, `platform/run-failed`, `platform/run-finished`, `platform/flow-run-finished`, `platform/deployment-created`, `platform/row-changed`, each with its payload. See [Platform events](../../../develop/reference/platform-events). |
| **Only when (optional)** | An expression over `event.name` and `event.payload`. It starts only when it gives true. Empty, every event of this name starts it. |

A refusal (a filter that fails, a payload that does not fit) is recorded as the reason on the trigger. An event started by a flow that an event started may go 10 deep.

## On a webhook

| Field | What it takes |
| --- | --- |
| **The flow is given** | **The body of the request**, or **The whole request, headers included**. |
| **The request is answered** | **At once, when the flow has started** (202 with `runId`), or **By the flow, with an Answer step**. The second holds the request up to 25 seconds, then answers 202 with the run's ID in the `x-flow-run` header. It needs an **Answer the request** step the start reaches, and cannot be checked by a trigger source. |
| **Each request is checked** | **Not at all: the address is the secret**, **By a signature in a header**, or **By a trigger source of your own**. |
| **Signature** | **HMAC SHA-256** or **HMAC SHA-1**. **Header it is sent in**, **Secret it was signed with**, **Written as** (**Hex** or **Base64**), **Text before it (optional)**. |
| **What the sender signed** | **The body of the request**, **The timestamp, a dot, then the body**, **v0, the timestamp, then the body**, or **Something else** with **The signed text**, where `{body}` and `{timestamp}` stand for the parts. |
| Timestamp header, **How old a request may be** | When the signature covers a time. A request without it is refused. Empty means 5 minutes; up to a day. |

A webhook takes 120 requests a minute. A request that repeats an `idempotency-key` does not start another run. A bad signature answers 401. A paused webhook answers 503 with code `workspace_paused` when the workspace is paused, and `trigger_paused` when the webhook alone, or the whole instance, is.

## On a form

Up to 30 questions. Each has **Question**, **Answered with**, **Called, in the flow** (its name), **A word of help (optional)** and **Must be answered**. The types are **A line of text** (500 characters), **Several lines** (5000), **An email address** (320), **A number**, **A date**, **One of a list** (typed one to a line) and **A checkbox**. The names `website`, `key` and `return` are reserved, and the editor flags them. An unanswered optional question is absent from `trigger`, so test it with `has()`.

Also: **Title of the form**, **Text under the title (optional)**, **What the button says (optional)**, **What is shown once it was sent (optional)**, and **Who may send it**: **Anyone with the address** or **Only people signed in to the portal**.

## Tags

A start may carry up to 10 tags, **Tags for each run (optional)**, one expression to a line over `trigger`, each giving a tag for the run, such as `'order:' + string(trigger.id)`. A tag is up to 64 characters of a-z, 0-9 and `_.:-`; one that fails is left out. An expression that does not parse is refused when the flow is built. You can search runs by a tag.

## Limits worth knowing

A trigger source starts at most 100 runs for one answer. More than that fails the tick, and the source keeps its place.

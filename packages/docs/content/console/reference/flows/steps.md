---
title: Flow steps
description: "Every step of a flow as the editor offers it: the fields it asks for, what it gives the steps after it, and its limits."
subjects: [flows]
---

This page lists the steps the flow editor adds. For the names a flow file uses, see the generated [flow steps](../../../develop/reference/flows/steps) and [the flow kind](../../../develop/reference/kinds/flow). A flow has at most 200 steps and 1000 connections, and no loops.

Where a field says it takes an expression, it is written in CEL: see [Expressions in a flow](expressions). Choice, yes or no and pick fields have **Use an expression**, so a value can be worked out instead of chosen. A value written in a file that the list does not have is kept and shown as an expression.

## The steps

| Step | Fields in the editor | What it gives | Limits |
| --- | --- | --- | --- |
| **Run a script** (`script`) | The script. **Its input**: **Field by field**, or **As one expression**. **What the script may reach**: **Connections**, **Tables**, and the events it may publish. | What the script returned. | Up to 20 of each kind of reach. A step may reach only what is picked in it, and the script must declare what it takes. Retries are the script's own; the default is none. |
| **Run a flow** (`subflow`) | **Which flow**: the same one every time, or chosen by the data from a list, **Flows it may start**. Its input. | What the other flow ended with. | The other flow must have a start **By hand**. Flows started by flows may go 10 deep. 1 to 50 flows in the list. |
| **Set values** (`set`) | A **Name** and an **Expression** for each value, with **Add a value** and **Remove value**. | An object with each value under its name. | 1 to 50 values. A name used twice is flagged and not saved. Has an error path. |
| **Answer the request** (`respond`) | **Status** (200 to 599), **Body**, **Headers** with **Add a header** and **Remove header**. | `status`, and `answered`. | The answer is at most 256 K characters. Up to 20 headers; some headers are refused. Needs a webhook start whose request is "By the flow, with an Answer step". |
| **Branch** (`branch`) | Cases tried in order, each with a name and an expression that gives true or false. Then **Otherwise**. | The name of the case taken. | 1 to 20 cases. Has an error path. |
| **For each** (`foreach`) | **Items**, a script or **Or a flow**, **Input**, **Keep going when an item fails**, **How many at once (optional)**. | A list, in order, of what each item gave. | 1000 items. 1 to 20 at once; empty means one at a time. An item that failed gives `error.message` when you keep going. |
| **Join** (`join`) | None. | Nothing. | Needs two or more paths into it. No error path. |
| **Wait** (`delay`) | **How long to wait**: an amount and a unit. | Nothing. | 1 second to 30 days. No error path. |
| **Approval** (`approval`) | **What is being approved**, **Detail to show**, **Give up after**, **Who may decide**, **Where it waits**. | `approved`, `comment` and, when a link decided it, `via`. | Title 200 characters. **Give up after** up to 30 days. A rejection or a timeout takes its error path, or fails the flow when it has none. |
| **Fail** (`fail`) | **Message**, an expression that gives text. | Nothing. | Ends the flow as failed. No error path. |

A start is also a step. See [Ways a flow starts](starts).

## Core nodes

The editor also offers the workspace's core nodes beside the steps. They are scripts that come with Volvel.

| Node | Limits |
| --- | --- |
| HTTP request | 60 seconds. **GET** sends no body. **Fail on an error status** is on by default. |
| Send email | 60 seconds. Over SMTP. |
| Read rows | At most 1000 rows, 50 unless you say. Gives `rows`, `count` and `row`. |
| Write a row | Insert, update or delete. 60 seconds. |
| Publish an event | 30 seconds. |

None of them retries. The full list of fields is the generated [nodes reference](../../../develop/reference/flows/nodes).

## Approval details

**Who may decide** takes groups, by key, and roles, by name. Left empty, anyone with the `approval:write` permission may decide. A person who decides needs `approval:write` in any case. Groups are matched by key first, then by name, and are looked up when the wait starts. **Where it waits** is **This workspace**, or **This workspace and the tenant**.

An approval is mailed to up to 50 people. The links in the mail last 48 hours, or until **Give up after**. The title is shown masked, in the queue, the mail and the agent tools, wherever the run was given a secret; the audit entry keeps it as written. A decision needs a reason when it rejects, on every route. Rejecting fails the step: the flow takes its error path, or fails if it has none.

## Answers and errors

A step that fails takes its error path if it has one. A step with no error path that fails ends the flow as failed. A flow's output is what its last steps gave, by name, and a last step that has only an error path after it counts. See [How a flow runs](../../explanation/flows/how-a-flow-runs).

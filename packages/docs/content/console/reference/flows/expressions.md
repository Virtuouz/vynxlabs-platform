---
title: Expressions in a flow
description: "Where a flow takes an expression, what it may read in each place, what the editor shows while you write one, and the traps."
subjects: [flows]
---

A step field that says it takes an expression is written in CEL. The operators, macros and functions, with a worked example of each, are on the generated [Expressions](../../../develop/reference/flows/expressions) page. This page is what the editor adds.

## What each place may read

| Where | It may read |
| --- | --- |
| A step's fields | `trigger`, `steps.<name>.output` (of a step that succeeded), `steps.<name>.error.message` (of a step whose error path was taken), `now`. |
| Inside **For each** | Also `item` and `index`. |
| **Only when** of an event start | `event.name` and `event.payload` only. |
| **Tags for each run** | `trigger` only. |

Any other name is refused when the flow is built, and by `volvel build`. An expression over 2000 characters is refused. The longest the editor previews is 4000.

An expression that fails does not quote a secret the run was given. A start's input over 256 KB is kept apart, and an expression that reads it says "The input the flow was started with is too large to use in an expression, so it has no keys here. Read it in a script."

## What the editor shows

An expression field is plain text with no autocomplete. After you stop typing for 400 ms, a "Gives …" line shows what it would give, cut at 160 characters, worked out against the last test or else the flow's newest run. Values the run was given in secret are masked as on the run page. With no run it says "Run a test to see its value."

## Traps

- A number from a step or a request is a decimal. `trigger.n + 1` fails; write `trigger.n + 1.0`. `trigger.n % 2.0` fails; use `int(trigger.n) % 2`. Joining text and a number needs `string()`. Comparing with a whole number works. `7 / 2` is 3.
- A field that is not there is an error. Use `has(trigger.name)` first. An optional form question left unanswered is absent.
- `duration` has no day: write `24h`.
- A flow's output is its last steps only, by name.
- A rejection or timeout of an **Approval** is in `steps.<name>.error.message`. The output of an approval is readable only when it was approved.

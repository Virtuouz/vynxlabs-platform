---
title: A webhook's address and its key
description: Why a webhook or form start keeps its address when its step is renamed, what the key is, and what a deploy says when an address stops.
subjects: [flows, triggers]
---

A webhook start and a form start have an address the world calls. Something outside Volvel, a sender or a bookmark, holds that address. If renaming a step in the editor changed it, that sender would fail without a word. The start's `key` is what stops this.

## The idea

A start is named by its `key` when it has one, and by its step's name when it does not. The address, its pause, and the time it last fired follow that name. A flow with a start whose step is called `orders` and no key is named `orders`.

Rename the step to `incoming` and the name changes to `incoming`. Left alone, the address of `orders` would stop. So the editor, when it renames a webhook or form start in a flow that has already been saved, writes the old name into the start as its `key`. The message says "Its address stays: the step keeps the key orders." The start is named `orders` still, so the row, the address, the pause and the last fired time move to the new step name.

In a new flow, nothing has been called yet, so a rename sets no key.

## In code

`key` is optional on `trigger.webhook` and `trigger.form` in a flow file. Keys must be unique in a flow, and `volvel build` refuses a repeated one. The editor shows no key: it is set by renaming, and cannot be edited.

## What a deploy says

When a deploy changes a flow, it compares the names of the addressed starts before and after. A name that is no longer in the flow, or that changed type, is listed in the deploy as a breaking change: "the webhook start "<name>" of <path> is no longer in the flow under that name, so its address stops answering." Read it before you press the deploy button. A start that kept its key through a rename is not listed.

## Related

- [Ways a flow starts](../../../console/reference/flows/starts)
- [The flow kind](../../reference/kinds/flow)

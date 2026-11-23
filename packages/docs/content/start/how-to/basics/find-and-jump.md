---
title: Find anything and jump to it
description: "Open the palette with ⌘K, find a script, flow, table, run or person by name, pin what you use, and start work from the keyboard."
subjects: [palette, navigation]
---

## Find anything and jump to it

By the end you have opened a screen and an object by name, pinned one, and started a script from the keyboard.

## Before you start

- You are signed in and inside a tenant. Outside a tenant the palette lists only your tenants, the screens of the instance and a few actions; it finds no scripts, flows or people.
- Results are filtered by what you may read. A script you may not read is not found. The permissions are in [the palette reference](../../reference/basics/finding-your-way).
- On a Mac the shortcut is :kbd[⌘K]. Elsewhere it is :kbd[Ctrl+K].

## Find and open something

:::steps
1. Press :kbd[⌘K], or press **Search or jump to…** in the header. The dialog **Go to** opens with the cursor in its box.
2. With nothing typed it lists, in this order: the commands of the object that is open (under its own heading), **Pinned**, **Recent**, **Screens** and **Actions**. **Recent** shows the last 8 things you opened in this tenant.
3. Type a few letters of a name. Every word you type must appear in a result. Results come in groups: **This workspace**, **Other workspaces**, **Runs**, **People**, **Screens** and **Actions**. The line under a result says what it is and where.
4. Move with :kbd[↓] and :kbd[↑] and press :kbd[Enter]. The result opens, and the dialog closes. A mouse click does the same.
:::

## Narrow the search with a prefix

Start with one character to look in one place only.

| Type | Finds |
| --- | --- |
| `>` then an ID | Runs. The first 8 or more hex characters of the run's ID, or `tag:` and a tag. Runs started within about a minute of each other share their first 8, so type more of the ID to narrow it. |
| `#` then a name | Resources: scripts, flows, apps, App Builder pages, tables, triggers, schedules, connections, events, pages of documentation, variables, saved queries, data sources and secrets (by name; never the value). |
| `/` then a word | Actions, such as **Run script…**. |
| `@` then a name | People: members and end users, by name or email. |

## Pin what you use

:::steps
1. Move to a result and press :kbd[⌘P]. A notice says "{name} is pinned to the palette."
2. Open the palette with nothing typed. The pinned item is first, under **Pinned**.
3. Press :kbd[⌘P] on it again to unpin it. With a page open, **Pin to the palette** and **Unpin from the palette** are also among that page's own commands.
:::

You can pin 12 things in each tenant. Pins follow you from browser to browser.

## Start work from the palette

:::steps
1. Type `/`, then press :kbd[Enter] on **Run script…** or **Start flow…**. In a dev workspace there are also **New script** and **New flow**.
2. Choose the script or flow. The picker lists the scripts that are deployed, and the flows that are deployed and have a manual trigger. :kbd[Backspace] on an empty box closes the picker and goes back to the list you see with nothing typed.
3. A dialog, **Run {path}** or **Start {path}**, asks for the input, in fields or **As JSON**. A script's dialog also asks when to start (**Now** or **Later**) and a **Priority**. Press **Run** or **Start flow**. The run opens.
:::

A result for a script has a second action, :kbd[⌘↵]: **Run**. A flow has **Start**, and a run has **Run again**, which asks first.

## The result

The screen or object you chose is open. The palette remembers what you open: the next time, it is under **Recent**.

## If it does not work

| You see | Because | Do this |
| --- | --- | --- |
| "Nothing matches “…”." | No name holds every word you typed, or you may not read it. | Type fewer words, or ask for read access. |
| "The search failed. What is typed may still be there; try again." with a Request ID | The search did not reach the instance. | Press **Try again**. |
| **Recent** is empty | Recent is kept only where you are a member, not under an operator's access grant. It keeps the last 20 things for each tenant. | Open something as a member. |
| A thing you opened is not in **Recent** | Drafts that were never deployed are not remembered. | Find it by name. |
| **Run script…** lists nothing | A script that is only a draft cannot be run from here. | Deploy it, or run it from its editor. |
| **Start flow…** does not list a flow | A flow that was never deployed, or that has no manual trigger, is not offered. | Deploy it, or start it from its own page. |

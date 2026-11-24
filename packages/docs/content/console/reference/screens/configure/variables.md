---
title: Variables
topic: configure-variables
description: "Every control, state and permission of the Variables screen and of a variable's page: the value each workspace gives a variable, and the default from the code."
subjects: [variables]
moved_from:
  - configure/variables
---

A variable is a named setting a script or a trigger source reads at run time. Its name, what it is for and an optional default are declared in a `<path>.variable.yaml` file, or in code with `defineVariable`. Its value is set per workspace, here. A workspace that sets none uses the default. A variable is text: the console and the API hold only strings, up to 65,536 characters.

A variable is not secret. Anyone with `variable:read` sees its value, and the audit log keeps the value each time it is set (`variable.set`). Put a key or a password in a [secret](secrets).

A flow does not read a variable. A flow step that runs a script gives it what the step lists, and the script reads the variable itself. See [Connections in scripts](../../../../develop/reference/configure/connections-in-scripts).

The screen is reached from **Configure**, then **Variables**. F1 (**Help for this page**) opens the help topic `configure-variables`.

::screenshot{name=console/configure-variables alt="The Variables screen: a table of variables with what reads each, what it is for, and its value here, which is a set value, Empty, or Default followed by the default."}

## The list

The list has the description "Settings a script reads at run time. Each workspace can set its own value. Without one, the default from the repository applies.", a **Set variable** button and a table.

| Column | What it shows |
| --- | --- |
| **Variable** | The path, as a link to the variable's page. A variable that is a draft and never deployed links to its editor and has **Draft, never deployed**. **Draft** and **Removing** mark a change that waits for a deploy. **Arrives with the next promotion** marks one a linked dev workspace declares and this workspace does not have yet: it has no page. |
| **Read by** | Up to three scripts and trigger sources that read it, then "and N more". "Nothing deployed uses it", "Could not be read" or "Reading…" when there is nothing to say. |
| **For** | What it is for, from its description. |
| **Value here** | The value set in this workspace; **Empty** for a set value of no characters; "Default: …" (or "Default: none") when no value is set here and the default applies. |

### Controls

| Control | What it does |
| --- | --- |
| **Set variable** | Opens a dialog with **Variable**, a list of the variables here (and of those a promotion brings), each with its description as a hint, and **Value**, optional: "Leave it empty to give the variable an empty value." The message afterward is "Set X in this workspace." or "Set X to an empty value in this workspace." |
| **Set** or **Change** (row) | Opens a sheet titled **Set X** or **Change X**. Its description is the variable's. **Value** is a field of several lines that starts with the value held now. Its hint is "The default is X. It applies when no value is set here." or "No default is declared, so a script reading it without a value here gets nothing." **Cancel** and **Save**. The message afterward is "X is set in this workspace." |
| **Use default** (row) | Asks "Clear the value of X in this workspace?" and removes the value. The default applies again. Shown for a variable that has a value here. |

A variable that is a draft and never deployed, or is being removed, has no **Set** or **Change**.

The address `?setup=<path>` opens **Set variable** with that variable chosen. A refused deploy or promotion links here that way.

An empty value is a value. A script that reads a variable set to nothing gets an empty text, not the default. A script that reads a variable with no value here and no default fails: the instance answers 404, "The variable X was not found."

### States of the list

| State | What you see |
| --- | --- |
| Empty | "No variables yet". |
| Loading | A loading line. |
| Not loaded | The reason in a notice, with **Try again**. |
| Read only | "You can see this workspace's variables, not change it. It needs `variable:write`." and whom to ask. **Set variable** is off with the tooltip "It needs variable:write." followed by whom to ask, and so are the buttons of the rows. |

## A variable's page

The page opens from the path in the list. Its title is the path.

| Control | What it does |
| --- | --- |
| **Change value** or **Set value** | Opens the same sheet as the row. **Change value** when a value is set here. Not shown without `variable:write`. |

The meta shows **What it is for**, **Value here** (the value; **Empty**; "The default: X"; or **Not set**), **Default** (when the code declares one) and **Last set** (when a value was last set). One tab, **Used by**, lists everything that reads the variable, each with "reads it". A path with no variable shows a page that says so, with "Go to the variables".

## Where a variable comes from

The console does not make a variable. It is declared by a `.variable.yaml` file or `defineVariable` in the repository, or as a draft in the console's resource editor; the link on a **Draft, never deployed** variable opens that. The default and the description come from the declaration.

## Permissions

| Action | Needs |
| --- | --- |
| See the list and a variable's page, with its value | `variable:read` |
| **Set variable**, **Set**, **Change**, **Use default**, **Change value** | `variable:write` |

A Developer and a Workspace admin have `variable:write`. A Viewer has `variable:read`. See [Who can change what in Configure](../../../../administer/reference/configure/who-can-change-what).

## Related

- [Connections](connections), [Secrets](secrets).
- [Connections in scripts](../../../../develop/reference/configure/connections-in-scripts) for `uses` and `ctx.variable`.
- [How a connection gets set up](../../../explanation/configure/how-a-connection-gets-set-up): why a deploy to production asks for what is missing.

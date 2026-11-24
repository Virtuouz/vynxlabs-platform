---
title: Use a script as a flow step
description: Give a script a step name so the flow editor offers it, and hand it a table, a connection or an event from the flow.
subjects: [flows, extensions]
---

## Use a script as a flow step

By the end a script of your own will be a step in the flow editor's **Add step** list, with a form drawn from its input, and a flow will hand it a table.

## Before you start

- A script in a dev workspace, written in the console or in the tenant's repository. See [Scripts](../../../console/reference/screens/build/scripts).
- To set a script's step in the console you need `resource:write` and `code:write`. See the [permissions reference](../../../administer/reference/permissions).
- The script's input is an object. The step's form has one field for each property.

## Give the script a step

:::tabs
::::tab{label=Console}
:::steps
1. Open the script in the editor: **Build**, **Scripts**, the script, then **Open editor**. Open **Settings**, which is closed once the script is saved.
2. Under **Use as a flow step**, type a **Step name**, up to 60 characters. "Give the script a name and it joins the flow editor's steps under it. Leave it empty to keep the script out of them."
3. Choose an **Icon**, or leave it at **None**. Type a **Group**, up to 40 characters, which is the heading the step is listed under. Left empty, the step is listed under **This workspace's**.
4. Under **A step may hand it**, choose what a flow may give the script that it does not name itself: **A connection**, **A table**, **An event**.
5. If the script takes a table, a connection or an event, mark that field in its input schema: `"x-pick": "table"`, `"connection"` or `"event"`. The step then offers a list of what the workspace has.
6. Press **Save draft**, then **Deploy** and **This change only**.
:::
::::
::::tab{label=Code}
A script is code, so the script stays TypeScript and says what it takes. The flow that uses it is a YAML file.

:::steps
1. In the script's `defineScript`, add `node`. Mark the input field that names the table with `"x-pick"` through `.meta`, and list `table` under `takes`.
2. Write the flow as a file, `platform/reports/count-visits.flow.yaml`. The step's `script` is the script's path, and `with.tables` hands it the table by its path.
3. Run `volvel deploy`.
:::

```ts title="src/index.ts"
import { defineScript, z } from "@volvel/sdk";

export const countRows = defineScript({
  path: "reports/count-rows",
  description: "How many rows a table has, up to 1,000.",
  input: z.object({
    table: z.string().meta({ title: "Table", "x-pick": "table" }),
  }),
  output: z.object({ rows: z.number() }),
  node: { label: "Count rows", icon: "table-2", category: "Reports", takes: ["table"] },
  async run(input, ctx) {
    const rows = await ctx.table(input.table).find({ limit: 1000 });
    return { rows: rows.length };
  },
});
```

```yaml title="platform/reports/count-visits.flow.yaml"
schemaVersion: 1
body:
  nodes:
    by_hand:
      type: trigger
      trigger:
        type: manual
    count:
      type: script
      script: reports/count-rows
      inputs:
        table: "'visits'"
      with:
        tables:
          - visits
  edges:
    - from: by_hand
      to: count
```

The table `visits` is a file of the repository too, `platform/visits.table.yaml`. A flow written in TypeScript with `defineFlow` builds the same file: see [Definitions in code](../../explanation/cli/definitions-in-code).
::::
:::

## Use it in a flow

:::steps
1. Open a flow in the flow editor and press **Add step**. The list is grouped: **Starts**, **Steps** and **Logic** (the flow's own), the steps that come with Volvel under **Core**, then the workspace's steps under their **Group** (or **This workspace's**), then every other script under **Scripts**, by path.
2. Choose the step. Its form is drawn from the script's input. A field uses the schema's `title`, `description`, `enum` and `default`. A field marked `"x-pick"` offers the workspace's tables, connections or events. In a flow made in the console, the table list holds every table of the workspace, and marks one that is only a draft "A draft, not yet deployed." In a flow that the repository owns, it holds only the tables the repository defines, and no drafts.
3. **Its input** is **Field by field**, or **As one expression** that gives the whole input at once.
:::

A step hands the script exactly what you pick in its fields and nothing else. The script may reach that table, connection or event and no other.

## The result

The script is in the **Add step** list under its name and icon. A flow that uses it runs the script, with the input the step gave and the table the step handed it.

A bundle carries only the core steps a flow uses.

## The steps that come with Volvel

Five steps are in the **Core** group. Their paths start with `core/`, which is kept for them: a deploy refuses a path under `core/` for anything else ("paths under core/ are kept for Volvel's own nodes"). A core step is read-only in the console.

| Step | Path | Takes | What it does | Time allowed |
| --- | --- | --- | --- | --- |
| **HTTP request** | `core/http-request` | a connection | Calls an HTTP API through a connection, or an address given in full. Fails on a status of 400 or above unless **Fail on an error status** is off. | 60 seconds |
| **Send email** | `core/send-email` | a connection | Sends a message through an SMTP connection. **Mail connection**, **To** and **Subject** are required. | 60 seconds |
| **Read rows** | `core/table-read` | a table | Reads rows of a table, or one row by its ID. **At most** is 1 to 1,000 and 50 to start. | 60 seconds |
| **Write a row** | `core/table-write` | a table | Adds a row, changes one or deletes one. | 60 seconds |
| **Publish an event** | `core/publish-event` | an event | Publishes an event of the workspace. Whatever listens for it is started. | 30 seconds |

## If it does not work

- **The step is not in the list.** The script needs a **Step name**, and the script must be deployed.
- **The build fails with "which does not take one".** The refusal reads `/body/nodes/count/with/tables/0 hands a table to the script "reports/count-rows", which does not take one. A script says what it takes with `node.takes`.` The flow hands the script a connection, a table or an event the script does not list under `takes`. Add it under **A step may hand it**, or in `node.takes`.
- **The build fails with `/body/nodes/count/with/tables/0 refers to "nope", which is not a table in this repository`.** The table named in `with` is not defined in the tenant's repository, as a file or in code. A table made in the console is not one: a flow of the repository that hands one is refused with this text. Write the table as a `<path>.table.yaml` file or with `defineTable`, or name another.
- **The icon is a puzzle piece.** The name is not one the console knows. Choose one from the **Icon** list.
- **The step form has no list of tables.** The input field has no `x-pick`, or the script's `takes` does not include it.

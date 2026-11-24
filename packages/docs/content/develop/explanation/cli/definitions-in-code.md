---
title: Definitions in code
description: When a TypeScript definition is worth having over a YAML file, what a definition in code is owned by, and how the console takes one over.
subjects: [cli, repository, ownership]
---

Most of what a workspace holds can be written as a YAML file: a table, a variable, a role, a flow, a schedule, an event, a connection, a query. A file is plain, the console edits it too, and `volvel schemas` checks it as you type. This page is about the other way: a definition written in TypeScript, with a `define*` call exported from the entry file. It says when that is worth it and what it costs.

## The idea

A definition in code and a file make the same resource. The same table, as a file:

```yaml title=platform/visits.table.yaml
schemaVersion: 1
body:
  description: Visits to a clinic.
  columns:
    pet:
      type: text
      required: true
    clinic:
      type: enum
      values: [northside, riverside, hilltop]
```

And as a definition:

```ts title=src/index.ts
import { column, defineTable } from "@volvel/sdk";

export const visits = defineTable({
  path: "visits",
  description: "Visits to a clinic.",
  columns: {
    pet: column.text({ required: true }),
    clinic: column.enum(["northside", "riverside", "hilltop"]),
  },
});
```

`volvel build` makes the same table from both. Start with the file. Write the definition when the file cannot say what you mean. There are three reasons.

- **Composition.** One value is used in several places and must stay one value. A list of device kinds feeds a column's values and an event's payload, and a change to the list changes both. A file repeats the list in each place. The example `examples/higher-ed-devices` holds `KINDS` and `Kind` in `src/model.ts` and uses them in its tables, its events and its scripts.
- **Shared values.** A constant, such as a time zone, a limit or the name of a group, is imported by the tables, scripts and flows that need it. A file holds only text.
- **Generated families.** Several definitions of one shape, made from a list. A file for each is the same file many times.

```ts title=src/family.ts
import { column, defineEvent, defineTable, z } from "@volvel/sdk";

export const KINDS = ["laptop", "chromebook", "hotspot"] as const;

export const devices = defineTable({
  path: "devices",
  columns: {
    tag: column.text({ required: true, unique: true }),
    kind: column.enum([...KINDS], { required: true }),
  },
});

export const deviceLent = defineEvent({
  path: "devices/lent",
  payload: z.object({ tag: z.string(), kind: z.enum(KINDS) }),
});

// One stock table for each clinic, all of one shape.
const stock = ["northside", "riverside", "hilltop"].map((clinic) =>
  defineTable({
    path: `stock/${clinic}`,
    columns: { sku: column.text({ required: true }), on_hand: column.integer({ required: true }) },
  }),
);
export const [northside, riverside, hilltop] = stock;
```

Each definition is exported by name from the entry file. A list that is exported as a list is not deployed: the build refuses it and says `stock/northside (table) is defined, but src/index.ts does not export it, so it would not be deployed`.

Some resources are always code. A script, a connector, a trigger source and a widget are code, and an app made of source files is code. A page of documentation is a Markdown file. For these there is no choice to make.

## What it costs

A definition in code is **Code** under **Managed in** on the screens that say it. A file, and whatever is made in the console, is **Files**. The difference is who may change it:

- **Code is changed in the repository, and only there.** The console shows a resource of Code as it is and does not edit it. A deploy of the repository changes it.
- **Files are changed in both places.** The console edits a file, and so do you. A deploy of the repository is refused if the console changed a file since the repository last had it: see [Keep the console and the repository in step](../../how-to/cli/keep-in-step).

A definition in code also asks for a build to read it, so a change to it needs a deploy, and the people who maintain it are the ones who can write TypeScript.

The types do not depend on the choice. A table written as a file is typed in your scripts as a table written in code is, by its name: see [Generated types](../../reference/command-line/generated-types).

## Take a definition over in the console

A person who has no repository at hand can take a definition in code over in a dev workspace. The resource then becomes Files: the console manages it, and the repository's definition is no longer the owner.

- **A table:** on the table's **Definition** tab, the notice reads "This table is defined in code, in the tenant's repository." and has **Take over in the console**, for a person who holds `resource:write`. The confirmation says that from then on the console manages the table as files, and that scripts typed against its `defineTable` export should use `ctx.table("<name>")`, which is typed from the generated types. A production workspace has no button: "A production workspace changes by a deploy only."
- **A flow, a query, a dashboard or another resource with a draft:** its editor says "This flow is defined in code, in the tenant's repository. Saving a draft of it takes it over", with the noun of the resource. It is then managed as files, which the console and the repository both edit.
- **An app:** the App Builder shows it as it is published, and says taking it over lets you change it there. The next publish makes it files.
- **A script in code** cannot be taken over. Its code leans on the rest of the repository. Make a new one at the same path in the console, and a deploy of it takes the old one's place with its history and what is bound to it.

A take-over does not remove the definition from the repository. A deploy of the code alone, which still defines the resource, is refused if the console changed the resource since the take-over, until you run `volvel pull` or deploy with `--force`, which takes the resource back to the code's definition and loses the console's change.

`volvel pull` brings in what was taken over, a table too, as a file of the folder (`platform/<path>.table.yaml`), and says that the resource is still defined in code, at the file when the code's source is known and by its name when it is not:

```text
desk (table) was taken over in the console, and is still defined in code, by the name desk. Remove it from the TypeScript: until you do, a deploy is refused as defined twice, in the code and in platform/.
```

Until you remove the definition from the TypeScript, a deploy is refused at the build:

```text
The build failed:
  - desk is defined in src/index.ts and again in platform/desk.table.yaml. Keep one. A resource taken over in the console is removed from the code.
```

Delete the `defineTable` (or the flow, query or other definition) from the code, and deploy: the file is the resource's definition from then on, and what the console changed, a column included, stays. The pull records only the resources whose file it wrote or already found the same: a resource it did not bring in is not marked as in step.

## Related

- [Code or files](code-or-files)
- [Keep the console and the repository in step](../../how-to/cli/keep-in-step)
- [Turn definitions in code into files](../../how-to/cli/convert-definitions-to-files)
- [Generated types](../../reference/command-line/generated-types)

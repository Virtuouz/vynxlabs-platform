---
title: Generated types
description: The file .platform/volvel-env.d.ts, which types ctx.table, ctx.events, ctx.variable and ctx.connection by name from your definitions, who writes it, and what the console's script editor does with it.
subjects: [cli, sdk]
---

The names of a workspace's tables, events, variables, connections, flows and scripts are in its definitions, whether those are YAML files or TypeScript. `volvel build` reads them and writes one declaration file, so that a script is typed by them: `ctx.table("visits")` knows the columns of `visits`, and a misspelled column is an error before a deploy.

## The file

`.platform/volvel-env.d.ts`, in the repository. It begins `// Written by `volvel build`, `volvel dev` and `volvel types` from your definitions. Do not edit it.` and adds to `@volvel/sdk` with `declare module "@volvel/sdk"`. It has no value imports. `.platform/` is the CLI's folder and is listed in `.gitignore`: the file is rebuilt, not committed.

A table, a variable and an event as the file holds them, from the repository of [Definitions in code](../../explanation/cli/definitions-in-code):

```ts title=.platform/volvel-env.d.ts
declare module "@volvel/sdk" {
  interface VolvelTables {
    /** Visits to a clinic. */
    "visits": { row: { id: string; created_at: string; updated_at: string; pet: string; clinic: "northside" | "riverside" | "hilltop" | null; seen_at: string | null; }; insert: { pet: string; clinic?: "northside" | "riverside" | "hilltop" | null; seen_at?: string | null; } };
  }
  interface VolvelEvents {
    /** A visit was written down. */
    "visit-logged": { pet: string; };
  }
  interface VolvelVariables {
    /** What the desk says first. */
    "greeting": { default: string };
  }
}
```

(The file also holds `import "@volvel/sdk";` and the other interfaces, which are empty when the repository has none of that kind.)

## The interfaces

| Interface | One entry for each | Holds | What it types |
| --- | --- | --- | --- |
| `VolvelTables` | table | `row` and `insert` | `ctx.table("<path>")`: the rows it returns and what `insert` takes. A column that is not required is `null` in `row` and optional in `insert`. A required column is required in `insert` unless it has a default. |
| `VolvelEvents` | event | the payload | `ctx.events.publish("<path>", payload)`: a payload of the wrong shape, or with a property the event does not have, is an error. |
| `VolvelVariables` | variable | `default` | `ctx.variable("<path>")` completes the names. |
| `VolvelConnections` | connection | `connector` | `ctx.connection("<path>")` completes the names. |
| `VolvelFlows` | flow | `input`, what a manual start is given | Declared. No `ctx` method takes it yet. |
| `VolvelScripts` | script | `input` and `output` | Declared. No `ctx` method takes it yet. |

The interfaces are in `@volvel/sdk`, empty until the file is in the project. A description in the definition is the doc comment of its entry, so the editor shows it.

## The types by name

Three types of `@volvel/sdk` give a table's types by its path, for code that is not a `ctx.table` call:

| Type | Is |
| --- | --- |
| `Row<"visits">` | A row of the table, as `ctx.table("visits")` returns it. |
| `Insert<"visits">` | What `insert` takes for the table. |
| `TableOf<"visits">` | The table's types in the form an app's `table<...>("visits")` takes where it took `typeof visits`, the table's `defineTable` export. |

```ts
import type { Insert, Row } from "@volvel/sdk";

const next: Insert<"visits"> = { pet: "Biscuit" };
const show = (row: Row<"visits">) => `${row.pet} at ${row.clinic ?? "no clinic"}`;
```

A name the generated file does not know is a type error here, unlike in `ctx.table`.

## What stays untyped

- **A name the file does not know** is not an error. A table made in the console after the last build has no entry, and `ctx.table("notes")` then returns rows of `Record<string, unknown>`. The same holds for an event, which is then given any payload.
- **`ctx.variable` and `ctx.connection`** complete a known name and accept any other text. A misspelled variable is not caught by the compiler.
- **A table given as its definition**, `ctx.table(visits)` with the `defineTable` export, is typed by that definition as it was before the file.
- **Connections** are typed by name and connector only, not by the client they give.

## Who writes it

| Command | When |
| --- | --- |
| `volvel build` | Every time. |
| `volvel types` | On its own: `Wrote the types of your tables, events, variables and connections to .platform/volvel-env.d.ts.`, then a line that says to include `.platform/*.d.ts` in `tsconfig.json` and to run it again after a definition changes. |
| `volvel dev` | At the start, and again on each rebuild. |
| `volvel convert` | After it has rebuilt, before it compiles what is left. |

A command writes the file only when its text changes, so an editor's language service is not woken for nothing. A change to a definition shows in the editor after one of these commands has run.

## Use it in a project

`tsconfig.json` has to include the file. A project from `volvel init` does. A project that was not made by it needs this in `include`:

```json title=tsconfig.json
{
  "include": ["src", ".platform/*.d.ts"]
}
```

With the file in place, a script such as this one fails to compile where it should:

```ts title=src/typed.ts
import { defineScript, z } from "@volvel/sdk";

export const firstVisit = defineScript({
  path: "visits/first",
  description: "The pet of the first visit.",
  input: z.object({}),
  output: z.object({ pet: z.string().nullable() }),
  async run(_input, ctx) {
    const [first] = await ctx.table("visits").find({ limit: 1 });
    return { pet: first?.petz ?? null };
  },
});
```

```text
src/typed.ts(10,26): error TS2551: Property 'petz' does not exist on type '{ id: string; created_at: string; updated_at: string; pet: string; clinic: "hilltop" | "northside" | "riverside" | null; seen_at: string | null; }'. Did you mean 'pet'?
```

## The console's script editor

The console's script editor is typed the same way. It reads the workspace's declarations from the instance, `GET /tenants/<tenant>/workspaces/<workspace>/types.d.ts`, which needs `script:read`, and loads them when the script opens. The declarations are of the workspace's active version, code and console together, with saved drafts laid over by key, so a table whose draft is saved is typed. A table made after the script opened shows on reopening. If the request fails, the editor is not typed and says nothing.

## Related

- [Definitions in code](../../explanation/cli/definitions-in-code)
- [Repository layout and volvel.yaml](repository-layout)
- [Test scripts in code](../../how-to/scripts/test-scripts-in-code)

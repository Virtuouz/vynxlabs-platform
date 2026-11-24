---
title: volvel convert
description: The flags of volvel convert, what it turns into files and what it leaves in the code with each reason it prints, how it rewrites references, and the checks that put everything back.
subjects: [cli, repository, convert]
---

`volvel convert` turns the definitions in the entry file that are only data into resource files, and takes them out of the TypeScript. It is in the generated [command list](../cli) too. For the steps, see [Turn definitions in code into files](../../how-to/cli/convert-definitions-to-files).

```bash
volvel convert [--dry-run] [--only <kind>,…] [--keep-references] [--entry <file>] [--resources <folder>]
```

## Flags

| Flag | What it does |
| --- | --- |
| `--dry-run` | Prints what would change and writes nothing. It does not rebuild, so it does not run the checks below. |
| `--only <kind>,…` | Converts only these kinds, separated by commas, such as `--only table,variable`. A kind that is not one is ignored. |
| `--keep-references` | Does not rewrite references in the code that stays. A definition that something in the code that stays refers to by its name stays too. |
| `--entry <file>` | The file that exports the code. Default `src/index.ts`, or `entry` in `volvel.yaml`. |
| `--resources <folder>` | Where the files go. |

## Where the files go

1. `resources` in `volvel.yaml`, or the `--resources` flag.
2. Otherwise `platform/`, when the repository has that folder.
3. Otherwise `resources/`, and `volvel.yaml` is written with `resources: resources`. The command says so: `Wrote volvel.yaml with `resources: resources`, the folder the files go to.` A dry run says `Would write`.

A file is `<path>.<kind>.yaml`, written the way a pull and Git sync write it, with the key order and values the build made.

## What converts

A top-level `export const x = defineY({ … })` whose argument is written out in full: strings, numbers, booleans, lists and objects, and calls of `column.*`, `z.*`, `step.*` and `trigger.*` with such arguments. A name of another definition, such as `role: reader` in a binding or `script: countRows` in a step, counts as written out: the file holds that definition's path. That covers tables, events, variables, schedules, roles, bindings, connections and groups, flows, queries, data sources, dashboards, interfaces, themes, triggers and apps that have no source file.

## What stays, and why

Each definition that stays is listed with its reason:

| Reason printed | Cause |
| --- | --- |
| `a script is code, and stays in the repository` | A script. A connector, a trigger source and a widget say the same with their own noun. |
| `a page is written as Markdown` | A page of documentation. |
| `uses `KINDS`, a value computed in code` | An identifier that is not a definition, such as a shared constant. |
| `has a spread (`...`) of shared values` | A `...` in the definition. |
| a call, or a template with a computed part | A function call that is not a column, schema, step or trigger builder, and a template string with a part computed. |
| `<name> is not written as a top-level `export const <name> = define…({ … })`` | A definition made in a loop or a list, or exported another way. |
| `<file>:<line> refers to it, and --keep-references leaves references as they are` | With `--keep-references`, a definition that code that stays refers to by its name. |
| a definition that another file imports | Where a path cannot stand for it, the message names the file and line and says what to use instead, such as `ctx.table("path")`. |

Without `--keep-references`, a definition that code that stays refers to is converted, and the reference becomes the path. Where a path cannot stand for it, the definition stays. `typeof x`, `x.path`, `x.__row`, a shorthand property `{ x }` and `import { x as y }` cannot be replaced, so they keep the definition in the code and say where.

## References

A reference in the code that stays to a converted definition becomes its path, at a position a string can stand for: an argument, a list item or a field value. A role becomes its name. Each rewrite is listed:

```text
Rewrote 3 references in the code to the path of what is now a file:
  src/index.ts:23  tables: [visits],  ->  tables: ["visits"],
  src/index.ts:24  variables: [greeting],  ->  variables: ["greeting"],
  src/index.ts:26  const rows = await ctx.table(visits).find({ limit: 1000 });  ->  const rows = await ctx.table("visits").find({ limit: 1000 });
```

The import that is no longer used is removed, and so is a re-export. `ctx.table("visits")` is typed by the [generated types](generated-types).

## What else it changes

- A comment directly above a converted export, and a comment after it on its line, is dropped. A file holds no comments. The command counts them: `1 comment written above the converted exports did not move to the files: a resource file holds no comments.`
- `define*`, `column` and `z` are taken out of an import that no longer uses them.
- A file left with nothing in it is removed, with the `export *` that named it. The entry file is kept as `export {};` when it is left empty.

## The checks

After writing, the command builds the repository again and compares every manifest, by key, with the build from before: key, schema version, title and body. Ownership is not compared. It checks that each converted resource is now owned as files. It then writes `.platform/volvel-env.d.ts` and, when the repository has a `tsconfig.json` and TypeScript is installed, compiles the code that is left. If TypeScript is not found it says `TypeScript was not found, so the code that is left was not type-checked.`

If a manifest differs, a resource is gone or new, or the code has an error it did not have before, the command puts everything back, removes what it wrote, and stops with:

```text
The repository built differently after converting, or no longer compiles, so nothing was changed:
```

followed by one line for each problem. A second run of a converted repository converts nothing.

## Related

- [Turn definitions in code into files](../../how-to/cli/convert-definitions-to-files)
- [Definitions in code](../../explanation/cli/definitions-in-code)
- [Generated types](generated-types)

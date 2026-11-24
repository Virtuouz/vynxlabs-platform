---
title: Turn definitions in code into files
description: See which definitions volvel convert would turn into YAML files, convert them, read what stays in the code and why, and deploy the result.
subjects: [cli, repository, convert]
---

## Turn definitions in code into files

By the end the definitions in your entry file that are only data are YAML files that the console edits too, the code that uses them refers to them by path, and the repository builds the same bundle.

## Before you start

- A repository whose entry file (`src/index.ts`) exports `define*` calls, and that you can commit to. Commit first: the command rewrites your TypeScript.
- A build that works: `volvel build` lists what the repository holds.
- Know that a converted resource is owned as **Files** afterwards: the console may change it. See [Definitions in code](../../explanation/cli/definitions-in-code) for when that is the wrong choice.

## Convert

:::steps
1. Look first. Nothing is written:

   ```bash
   volvel convert --dry-run
   ```

   ```text
   Would convert 2 definitions to files.
     table      visits  src/index.ts (visits) -> resources/visits.table.yaml
     variable   greeting  src/index.ts (greeting) -> resources/greeting.variable.yaml
   Left in the code (1):
     script     visits/count  countVisits: a script is code, and stays in the repository
   Would rewrite 3 references in the code to the path of what is now a file:
     src/index.ts:23  tables: [visits],  ->  tables: ["visits"],
     src/index.ts:24  variables: [greeting],  ->  variables: ["greeting"],
     src/index.ts:26  const rows = await ctx.table(visits).find({ limit: 1000 });  ->  const rows = await ctx.table("visits").find({ limit: 1000 });
   Would write volvel.yaml with `resources: resources`, the folder the files go to.
   1 comment written above the converted exports would not move to the files: a resource file holds no comments.
   Dry run: nothing was written.
   ```

   Each definition that stays has its reason. They are listed in [volvel convert](../../reference/command-line/convert).
2. Convert, all kinds or only some, such as `--only table,variable`:

   ```bash
   volvel convert
   ```

   The output is the same, with `Converted` and `Rewrote` and `Wrote volvel.yaml`. The command rebuilds, compares every manifest with the build from before, and compiles what is left. If anything differs it puts everything back and says `The repository built differently after converting, or no longer compiles, so nothing was changed:` and why.
3. Read the files. A table:

   ```yaml title=resources/visits.table.yaml
   schemaVersion: 1
   body:
     columns:
       pet:
         type: text
         required: true
       clinic:
         type: enum
         values:
           - northside
           - riverside
           - hilltop
   ```

   And the script that stays, which now names the table by its path:

   ```ts title=src/index.ts
   import { defineScript, z } from "@volvel/sdk";

   export const countVisits = defineScript({
     path: "visits/count",
     description: "How many visits there are.",
     input: z.object({}),
     output: z.object({ visits: z.number() }),
     tables: ["visits"],
     variables: ["greeting"],
     async run(_input, ctx) {
       const rows = await ctx.table("visits").find({ limit: 1000 });
       return { visits: rows.length };
     },
   });
   ```

   `ctx.table("visits")` is typed from `.platform/volvel-env.d.ts`, which the command wrote: see [Generated types](../../reference/command-line/generated-types).
4. Preview the deploy:

   ```bash
   volvel deploy --tenant fernhill --workspace cli-dev --preview
   ```

   ```text
   Deploying would leave cli-dev (dev) with: 0 created, 3 updated, 0 deleted, 0 unchanged.
     updated  variable   greeting
     updated  table      visits
     updated  script     visits/count
   Nothing was changed. Run it again without --preview to deploy.
   ```

   The table and the variable are `updated` because their owner changes from Code to Files. The script changed because its references are paths now. No table is made or dropped, and its rows stay.
5. Commit, then deploy without `--preview`. A second `volvel convert` says `Converted 0 definitions to files.`
:::

## The result

The converted resources are **Files** under **Managed in** in the console, and a pull and a deploy keep them in step: see [Keep the console and the repository in step](keep-in-step).

## If it does not work

- **A definition you expected is under `Left in the code`.** Read its reason. A shared constant, a spread or a loop keeps it in the code: that is a case for [a definition in code](../../explanation/cli/definitions-in-code), and nothing is wrong.
- **`The repository built differently after converting, or no longer compiles, so nothing was changed:`** The lines under it name the resource or the compiler error. The repository is as it was. Fix that, or leave the definition out with `--only`.
- **`TypeScript was not found, so the code that is left was not type-checked.`** Install `typescript` in the repository and run the command again to have the check.
- **`resources/visits.table.yaml exists already. Nothing was changed.`** A file is already where a converted definition would go. The command does not overwrite it. Rename or remove the file, or keep the definition in the code.

## Related

- [volvel convert](../../reference/command-line/convert)
- [Definitions in code](../../explanation/cli/definitions-in-code)

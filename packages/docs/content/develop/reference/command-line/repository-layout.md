---
title: Repository layout and volvel.yaml
description: What a repository holds, where the CLI looks for each thing, the five keys of volvel.yaml, and what the CLI leaves unread.
subjects: [cli, repository]
---

A tenant's repository is a folder of TypeScript and files that `volvel build` turns into one bundle. This page lists what is where. For why a resource may be in code or in a file, see [Code or files](../../explanation/cli/code-or-files).

## Files and folders

:::file-tree
- fernhill-cli/
  - package.json
  - tsconfig.json
  - volvel.yaml
  - .gitignore
  - src/
    - index.ts
  - platform/
    - cli-ideas.table.yaml
    - docs/
      - support/refunds.md
  - tenant/
    - groups/
      - tech-desk.group.yaml
  - .platform/
    - bundle.json
    - local.json
    - pulled.json
    - schemas/
:::

| Path | What it is | Who writes it |
| --- | --- | --- |
| `src/index.ts` | The **entry file**: every resource defined in code is exported from it. Only its exports count. Two `export *` that give the same name cancel that name out. | You. `volvel init` writes it. |
| `package.json`, `tsconfig.json`, `.gitignore` | A starter's dependency on `@volvel/sdk` at `^0.5.0`; a TypeScript settings file that includes `src`; a `.gitignore` listing `node_modules/` and `.platform/`. | `volvel init`, once. |
| `platform/` | The **console's folder**: resources made in the console, as files named `<path>.<kind>.yaml`. | `volvel pull`, or you. |
| `platform/docs/` | Pages of documentation, as `<path>.md`. The page's path is its place under the folder. | `volvel pull`, or you. |
| `tenant/` | The tenant's access, as `<key>.<kind>.yaml`, for example `tenant/groups/tech-desk.group.yaml`. These files are read by `volvel tenant ...`, not by `build` or `deploy`. | `volvel tenant pull`, or you. |
| `volvel.yaml` | Says where things are, when they are not at the defaults. Optional. | You. No starter makes one. |
| `.platform/` | What the CLI keeps in the repository. List it in `.gitignore`. | The CLI. |

`.platform/` holds:

| File | What it is |
| --- | --- |
| `bundle.json` | The bundle `volvel build` wrote. |
| `local.json` | The values of a local run: `connections`, `groups`, `secrets`, `variables`. You write it. See [Run a script on your machine](../../how-to/cli/run-a-script-locally). |
| `pulled.json` | What the last `volvel pull` wrote, by checksum, and the drafts it took. |
| `schemas/` | `<kind>.schema.json`, one file for each kind of file, from `volvel schemas`. |
| `run-<pid>-<time>.mjs` | A scratch file of a local run. It is removed when the run ends. |

## volvel.yaml

The file has five keys. Each is optional. Any other key is a build error, and `volvel pull` refuses the same file:

```text
volvel.yaml: has keys other than roots, ignore, docs, entry and resources: flavor.
```

| Key | Value | What it does | Default |
| --- | --- | --- | --- |
| `roots` | A list of folders | Gives a file its path from where it is. Under the root `src`, the file `src/lending/items.table.yaml` is the table `lending/items`. The console's folder is always a root. The longest root that holds a file wins. | none |
| `ignore` | A list of folders | Folders to leave unread, beside the ones always left unread. A folder named is skipped with everything under it. | none |
| `docs` | A list of folders | The folders of pages of documentation. Under `handbook`, the file `handbook/support/refunds.md` is the page `support/refunds`. A list here replaces the default. | `platform/docs`, that is `docs` inside the console's folder |
| `entry` | One path | The file that exports the code. | `src/index.ts` |
| `resources` | One path | The console's folder. | `platform` |

```yaml title="volvel.yaml"
roots:
  - src
docs:
  - handbook
ignore:
  - scratch
```

With that file, `volvel build` of a repository that holds `src/lending/items.table.yaml` and `handbook/support/refunds.md` (a page with a title) lists the table `lending/items` and the doc `support/refunds`, and does not read `scratch/`.

- `roots`, `ignore` and `docs` are lists of folders as text. A leading `./` or `/` and a trailing `/` are dropped.
- `entry` and `resources` are one path as text, inside the repository. A path with `..` in it is refused, and the build says that the path "cannot climb out of" the repository.
- A flag of a command wins over the file: `--entry <file>` and `--resources <folder>`. `pull` takes only `--resources`.
- If `resources` names a folder other than `platform`, that folder is the one that always gives paths; a `platform/` folder is then just a folder. A resource file in it is outside every folder that gives a path, and the build says so, naming the folder that does give paths (here `other`): `platform/cli-ideas.table.yaml: is outside every folder that gives a resource its path (other). Say its path in the file, as path: <path>, or keep it under one of them.`
- When the workspace follows a Git branch, the instance reads `volvel.yaml` too. A `resources` there decides where Git sync writes, and the Repository page shows the folder as read-only. `entry` is for the CLI only: the instance never builds code.

## What is never read

- `node_modules`, `dist`, `build`, and every folder whose name starts with a dot.
- Every folder `ignore` names. `ignore` does not apply to the tenant's access files: for those only `node_modules`, `dist`, `build` and dot-folders are skipped.

## Names of files

- A resource file is `<path>.<kind>.yaml`, for example `lending/items.table.yaml`. The path and the kind come from the name, so they cannot disagree.
- A script, a connector and a trigger source may also have a `.ts` of the same name beside the YAML, which holds its code. No other kind pairs with a `.ts`. Files like `vite.config.ts` or `orders.test.ts` belong to no resource.
- A page is `<path>.md` under a folder of pages. It starts with its title between two lines of `---` (`title: ...`); a page without them fails the build with `A page starts with its title between two lines of "---"`.
- Inside a YAML file the keys are `schemaVersion` (a whole number from 1) and `body` (a mapping), which are required, and `key`, `path` and `title`, which are optional. Any other key is an error naming the file: `has keys other than key, path, title, schemaVersion and body`.
- A path is lowercase letters, digits, hyphens and underscores, in folders. One path names one resource across all kinds.
- A file of an app: each part of its name may begin with one `_` or `.` followed by a letter or digit. `.` and `..` are refused, with a message that names the file and the rule.

## Editor schemas

`volvel schemas` writes the schema of each kind of file to `.platform/schemas/` and adds `yaml.schemas` to `.vscode/settings.json`, so a YAML-aware editor completes and checks `<name>.<kind>.yaml` as you type. It needs the `redhat.vscode-yaml` extension. If `.vscode/settings.json` is not plain JSON, the file is left alone and the JSON to add is printed. Run it again after you upgrade the CLI: the schemas come from the CLI, not from the instance. The kinds of tenant access have schemas too.

## Related

- [Code or files](../../explanation/cli/code-or-files)
- [The command reference](../cli)
- [Bring console changes into the repository](../../how-to/cli/pull-console-changes)

---
title: Code or files
description: Why a repository holds some resources as TypeScript and others as files, who owns each resource, and how a rename keeps a resource's history.
subjects: [cli, repository]
---

A Volvel repository can say what a workspace holds in two ways. It can write a resource as a file, named `<path>.<kind>.yaml`, that the console reads and edits too. This is the way to start. Or it can write it in TypeScript, with a `define*` call exported from the entry file: see [Definitions in code](definitions-in-code) for when that is worth it. Both end up in the same bundle, and a workspace cannot tell them apart when it runs. What differs is who may change the resource afterwards.

## The idea

A resource has one owner. The bundle says which: a resource defined in code has `ownership: "code"`, and one that comes from a file the console manages has `ownership: "ui"`. The console shows it as **Managed in**, **Code** or **Files**.

Code is the right owner where resources lean on each other's code. Tables, scripts and flows share a model and helpers, and only a build can put them together. Code written in the console may import only `@volvel/sdk` and `node:` modules, so shared code and packages belong in the repository. The console cannot edit the repository's TypeScript.

A file is the right owner where there is no code to share. An app, its screens, a theme, a variable, a schedule have nothing a build must check across files. As a file, the console edits it as well as you do, and a pull brings the console's edit back into the repository with your comments and the order of your keys kept.

Volvel's example `examples/higher-ed-devices` is split this way: TypeScript for the tables, scripts and the review flow, which share a model, and files for its apps, theme, a variable and a schedule.

## What happens when both want a resource

- **A resource may be defined once.** The same path in code and in a file is a build error: `<path> is defined in <entry> and again in <file>. Keep one.` One path names one resource across all kinds.
- **A draft in the console takes a resource of Code over.** Saving a draft of something the repository defines makes it files, which the console and the repository both edit: the editor says `This flow is defined in code, in the tenant's repository. Saving a draft of it takes it over`, with the noun of the resource. A table is taken over with a button on its **Definition** tab. A deploy of the repository that still defines it takes it back, and is refused first if the console changed it since: see [Keep the console and the repository in step](../../how-to/cli/keep-in-step).
- **A file changed in the console is not overwritten by surprise.** A deploy of the repository that would replace what the console changed since the repository last had it, or remove what the console made, is refused with `console_changed` until `volvel pull`, or `--force`.
- **A script written in code cannot be turned into a console script.** Its code leans on the rest of the repository's, and one written in the console stands alone. The editor shows its source read-only and says: make a new one at the same path in the console, and, deployed, it takes the old one's place with its history and what is bound to it.
- **A deploy that carries console files speaks for all of them.** The first file in `platform/` makes the bundle the whole set of the workspace's console resources, so one with no file is deleted. That is why `volvel deploy` stops first and names them, and why [`volvel pull`](../../how-to/cli/pull-console-changes) exists.

The tenant's access, its groups, service accounts, roles and their bindings, is files only. There is no `define*` for it in the SDK, and no `defineDoc` for a page of documentation: a page is a Markdown file.

## Names and moves

A resource has a **path**, which is its address and may change, and a **key**, which is its identity and does not. A resource's key is its path unless it gives another with `key:`.

To move a resource, give it the new `path` and set `key` to the path it had. Deploy matches by key, so the resource keeps its rows, its history and what is bound to it, and the deploy lists it as `renamed  script     hello -> hello-there`. The old path answers for 90 days, with the headers `Deprecation`, `Sunset` and `Volvel-Resource-Moved`. A reference written as text that uses a key is rewritten to the new path when the repository is built.

Without `key`, a move looks like a delete and a create. When the deleted resource holds rows, runs or history, the deploy refuses: `This deploy would delete something that holds history or data, and create something of the same kind.` Give the new one the old one's key, or allow the deletion by name with `--allow-delete <path>`.

A script or flow is offered to agents as a tool. Its name is the one its author chose, or `run_<path>` for a script and `start_<path>` for a flow, with `/` written `__` and `-` written `_`, cut at 64 characters. `get_run`, `get_flow_run`, `list_approvals` and `decide_approval` are taken. Renaming a path renames its tool, and a promotion to production lists that as a breaking change.

## How it fits

`volvel build` reads the entry file and every resource file it finds and makes one bundle. `volvel schemas` gives an editor the schema of each kind of file, so files are checked as they are typed. Where files may be, and what is never read, is in [the repository layout](../../reference/command-line/repository-layout). Building runs your repository's code, so any side effect at the top level of the entry file runs on every build.

## Related

- [Definitions in code](definitions-in-code)
- [Repository layout and volvel.yaml](../../reference/command-line/repository-layout)
- [Preview and deploy a repository](../../how-to/cli/deploy-a-repository)
- [Bring console changes into the repository](../../how-to/cli/pull-console-changes)

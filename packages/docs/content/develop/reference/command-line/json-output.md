---
title: JSON output
description: Which commands take --json, the document each one prints on standard output, and what stays on standard error.
subjects: [cli, reference, ci]
---

With `--json`, a command prints one JSON document on standard output and nothing else there. Progress lines and the build's listing are not printed. Warnings go to standard error, as they do without the flag, and so does an error: a failed command prints its message on standard error, prints nothing on standard output, and exits non-zero (see [exit codes](flags-and-exit-codes)).

## Commands that take it

| Command | Prints |
| --- | --- |
| `volvel whoami --json` | `{"url", "principal", "tenants"}`: the instance's address, the principal (`type`, `id`, `name`, `email`) and the tenants it may see (`id`, `slug`, `name`). |
| `volvel status --json` | `{"url", "version", "migrationLevel", "ready", "failing"}`. `failing` lists the names of the checks that fail. The exit code is 1 when `ready` is `false`. |
| `volvel deploy --json` | `{"workspace", "type", "version", "summary", "draftsSettled", "message"}`. `message` is there only when a note was given or defaulted. |
| `volvel deploy --preview --json` | `{"preview": true, "workspace", "summary"}`. |
| `volvel promote --json` | `{"target", "version", "summary", "release", "message"}`. `target` is `{id, slug, name, type}`. `release` is the state of the Git release (`status`, `branch`, and `problem` when it failed) and is left out when the instance says nothing. |
| `volvel promote --preview --json` | `{"preview": true, "target", "summary"}`, and `"refused": true` when the exit code is 4. |
| `volvel rollback --json` | `{"workspace", "type", "version", "summary", "message"}`. |
| `volvel runs --json` | `{"items": [...]}`: up to 20 runs, flow runs among them, newest first. A flow run's `script` field is `<flow> (flow)`. |
| `volvel runs <run id> --json` | `{"run": {...}, "logs": [...]}`: the run, and up to 1,000 of its log lines. |

`login`, `logout`, `profiles`, `init`, `build`, `schemas`, `run`, `logs`, `pull`, `dev`, the `tenant` commands and `instance` take no `--json`.

## The summary

`summary` is the same object in `deploy`, `promote` and `rollback`:

```json
{
  "created": 1,
  "updated": 1,
  "unchanged": 1,
  "deleted": 0,
  "renamed": 0,
  "warnings": [],
  "data": ["Table cli-ideas created."],
  "aliasesRemoved": [],
  "breaking": [],
  "changes": [
    { "change": "created", "kind": "variable", "path": "greeting" },
    { "change": "updated", "kind": "script", "path": "hello" }
  ]
}
```

| Field | What it holds |
| --- | --- |
| `created`, `updated`, `unchanged`, `deleted`, `renamed` | Counts of resources and tables. |
| `changes` | One entry for each resource that changed: `change` (`created`, `updated`, `renamed`, `deleted`), `kind`, `path`, and `from` for a rename. |
| `data` | One sentence for each change to a table's data, such as `Table cli-ideas created.` |
| `warnings` | Each is `{path, message}`: something the workspace lacks, such as a connection that is not bound in a dev workspace. |
| `breaking` | Each is `{path, message}`: a change that something outside Volvel calls. A promotion to production refuses these without `--confirm-breaking`. |
| `aliasesRemoved` | Paths that no longer answer for a resource renamed away from them. |

## Related

- [Run the command line in CI](../../how-to/cli/run-the-cli-in-ci)
- [Flags, environment and exit codes](flags-and-exit-codes)

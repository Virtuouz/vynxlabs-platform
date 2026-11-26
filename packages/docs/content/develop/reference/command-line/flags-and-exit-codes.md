---
title: Flags, environment and exit codes
description: Which flags each command takes, the environment variables it reads, what every exit code means, and what a flag does that the generated command list leaves out.
subjects: [cli, reference]
---

The list of every command is [The volvel command](../cli), drawn from the same source as `volvel --help`. This page says what that list names only in passing: which flags go with which command, the environment, and the exit codes. `volvel --version` (also `-v` and `version`) prints `volvel` and the CLI's version, and `volvel <command> --help` prints that command's lines.

## Flags by command

`--dir <path>` is the repository to read, and defaults to the current folder. `--entry <file>` and `--resources <folder>` say where the code is exported from and where the console's folder is; each beats the same word in `volvel.yaml` (see [Repository layout](repository-layout)). `--tenant <slug>` and `--workspace <slug>` name the target.

| Command | Flags |
| --- | --- |
| `login` | `--url`, `--token`, both required. |
| `whoami`, `status` | `--json`. |
| `init [directory]` | None. The folder must be empty, or hold only `.git`. |
| `build` | `--dir`, `--entry`, `--resources`. |
| `schemas` | `--dir`. |
| `run <script>` | `--dir`, `--entry`, `--resources`, `--input <json>` or `--input @<file>`. |
| `run <script or flow> --remote` | `--remote`, `--tenant`, `--workspace`, `--input`, `--dir`, `--entry`, `--resources`, and `--script` or `--flow` to say which when the path is both. |
| `dev [app]` | `--tenant`, `--workspace` (both required), `--port <n>`, `--no-strict`, `--dir`, `--entry`, `--resources`. The port is a whole number from 1 to 65535 and defaults to 5174; a port that is taken is replaced by the next free one. |
| `deploy` | `--tenant`, `--workspace`, `--preview`, `--message <text>`, `--json`, `--allow-delete <path>` (repeat it), `--dir`, `--entry`, `--resources`. |
| `promote` | `--tenant`, `--workspace`, `--preview`, `--confirm-breaking`, `--message <text>`, `--json`, `--allow-delete <path>` (repeat it), `--dir`. `--dir` only says where to read the commit for `--message`: there is no `--entry` or `--resources`. |
| `rollback <version>` | `--tenant`, `--workspace`, `--message <text>`, `--json`. No `--dir`: the commit for `--message` is read from the current folder. |
| `pull` | `--tenant`, `--workspace`, `--deployed`, `--force`, `--dir`, `--resources`. No `--entry`. |
| `logs <run id>` | `--tenant`, `--workspace`, `-f` or `--follow`. |
| `runs [run id]` | `--tenant`, `--workspace`, `--script <path>`, `--json`. |
| `runs cancel` | `--tenant`, `--workspace`, `--queued` or `--all` (not both), `--older-than <seconds>`. |
| `tenant plan`, `tenant release`, `tenant pull`, `tenant releases` | `--tenant`, `--dir`, and for `release` `--message` and `--allow-delete <kind>/<key>`. |
| `tenant approve`, `decline`, `withdraw <number>` | `--tenant`, `--comment <text>`. |
| `tenant rollback <number>` | `--tenant`, `--yes`. |
| `tenant approval [on\|off]` | `--tenant`. |
| `tenant export` | `--tenant` (or the slug as the first argument), `--out <file>`, `--history`. |
| `tenant import <file>` | `--slug`, `--location`, `--yes`. |
| `instance triggers [pause\|resume]` | `--reason <text>` with `pause`. |

`--profile <name>` goes with any command, before or after it: see [Sign in to more than one instance](../../how-to/cli/sign-in-with-profiles). `--json` is described in [JSON output](json-output).

Notes on single flags:

- `--allow-delete <path>` names a resource a deploy or promotion may delete. On `tenant release` it names `<kind>/<key>`.
- `--port` and `--older-than` take whole numbers. Anything else is refused: `--port is a whole number from 1 to 65535, not "abc".`
- `--message` needs some words. An empty one is refused: `--message needs some words.`
- `--input` is read as JSON, or as the contents of a file when it starts with `@`. A file that is not there is `There is no file at <path>.` Text that is not JSON is `--input must be JSON, or @ and a file of JSON, for example --input '{"customer":"ada"}'`.

## Environment

| Variable | Used by | What it does |
| --- | --- | --- |
| `VOLVEL_URL` | every command that talks to an instance | The instance's address, in place of the saved one. |
| `VOLVEL_TOKEN` | the same | The API key, in place of the saved one. A saved key is used only with the address it was saved for. |
| `VOLVEL_PROFILE` | the same | The profile to use. `--profile` sets it. |
| `XDG_CONFIG_HOME` | sign-in | The folder that holds `volvel/`. When it is not set, `~/.config`. |
| `CI` | `deploy`, `promote`, `rollback` | When set to anything but `false` or `0`, a version's note defaults to the subject of the last git commit, cut at 500 characters. |
| `VOLVEL_EXPORT_PASSPHRASE` | `tenant export`, `tenant import` | The passphrase of the export file. It is not read from a flag, so it does not show in a process list. |
| `VOLVEL_DEBUG` | every command | When set, an unexpected fault prints its stack. |
| `SCREENS_DIR` | `dev` | Another build of the files that draw an interface. |

## Exit codes

| Code | When |
| --- | --- |
| 0 | The command did what it was asked. `logs` without `-f` on a run that has not ended also exits 0. A pull or promotion that finished but warned exits 0. |
| 1 | The build failed, the instance refused, a flag or file was wrong (`CliError`), a run **failed**, `volvel pull` kept files you changed, `volvel status` found the instance not ready, or something unexpected happened. An unexpected fault prints one line, `Unexpected: <message>. Run again with VOLVEL_DEBUG=1 for the trace.` |
| 2 | An unknown command, or flags the command does not take. The usage is printed. |
| 3 | A run that `run --remote` or `logs -f` followed was **canceled**. |
| 4 | `volvel promote --preview` to a production workspace that would refuse for breaking changes without `--confirm-breaking`. |
| 130 | Ctrl+C while following a run. The run goes on. |

## Related

- [The volvel command](../cli)
- [Run the command line in CI](../../how-to/cli/run-the-cli-in-ci)
- [Error codes](../errors), the codes the instance answers with

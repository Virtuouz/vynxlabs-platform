/**
 * Every command of the CLI, declared once. `volvel --help` is drawn from this
 * list, and so is the documentation's page of commands, so the two cannot
 * differ. What each command does is in `cli.ts`, which must have one handler
 * for each name here and none besides.
 *
 * This file imports nothing, so that whatever draws the page need not load
 * the CLI to read it.
 */

export interface CommandEntry {
  /** The first word after `volvel`. Several entries may share one: `tenant plan`, `tenant release`. */
  command: string;
  /** How it is written, with what it takes. */
  usage: string;
  /** What it does, in a sentence or two. */
  summary: string;
  group: (typeof COMMAND_GROUPS)[number];
}

export const COMMAND_NAME = "volvel";

export const COMMAND_GROUPS = [
  "Sign in",
  "Work on a tenant repository",
  "A tenant's access: its groups, service accounts, roles and what they are given",
  "Move a tenant",
  "See what ran",
] as const;

const entry = <Name extends string>(
  command: Name,
  group: CommandEntry["group"],
  usage: string,
  summary: string,
) => ({ command, group, usage, summary });

const REPOSITORY = "Work on a tenant repository";
const ACCESS = "A tenant's access: its groups, service accounts, roles and what they are given";

export const COMMANDS = [
  entry(
    "login",
    "Sign in",
    "login --url <url> --token <api key>",
    "Save the instance and key to use.",
  ),
  entry("whoami", "Sign in", "whoami", "Show who the saved key acts as."),
  entry("status", "Sign in", "status", "Show the instance's version and readiness."),

  entry("init", REPOSITORY, "init [directory]", "Write a starter repository."),
  entry("build", REPOSITORY, "build", "Build the bundle and list what it contains."),
  entry(
    "schemas",
    REPOSITORY,
    "schemas",
    "Write each kind's file schema into .platform/schemas, and tell VS Code which files each checks, so that <name>.<kind>.yaml completes and is checked as typed.",
  ),
  entry("run", REPOSITORY, "run <script> [--input <json>]", "Run one script on this machine."),
  entry(
    "run",
    REPOSITORY,
    "run <script|flow> --remote --tenant <slug> --workspace <slug> [--input <json>|@file]",
    "Run it on the instance, from this build, in a dev workspace, and follow it. Nothing is deployed.",
  ),
  entry(
    "pull",
    REPOSITORY,
    "pull --tenant <slug> --workspace <slug> [--deployed] [--force]",
    "Write the workspace's console resources, drafts included, into platform/. A file changed here is kept unless --force.",
  ),
  entry(
    "dev",
    REPOSITORY,
    "dev [app] --tenant <slug> --workspace <slug> [--port <n>]",
    "Serve an app from its source, with reload, against that workspace's data, as yourself.",
  ),
  entry(
    "deploy",
    REPOSITORY,
    "deploy --tenant <slug> --workspace <slug> [--allow-delete <path>]",
    "Build, upload and activate the bundle.",
  ),
  entry(
    "promote",
    REPOSITORY,
    "promote --tenant <slug> --workspace <slug> [--preview] [--allow-delete <path>] [--confirm-breaking]",
    "Activate this workspace's bundle in the workspace it is linked to. Nothing is rebuilt.",
  ),

  entry(
    "tenant",
    ACCESS,
    "tenant plan --tenant <slug>",
    "What releasing the repository's files would change.",
  ),
  entry(
    "tenant",
    ACCESS,
    "tenant release --tenant <slug> [--message <text>] [--allow-delete <kind>/<key>]",
    "Make the tenant's access what the files say. Files are named <key>.<kind>.yaml, such as tenant/groups/tech-desk.group.yaml.",
  ),
  entry(
    "tenant",
    ACCESS,
    "tenant pull --tenant <slug>",
    "Write the tenant's access as it is into the repository.",
  ),
  entry(
    "tenant",
    ACCESS,
    "tenant releases --tenant <slug>",
    "The releases there were, newest first.",
  ),
  entry(
    "tenant",
    ACCESS,
    "tenant approve|decline|withdraw <number> --tenant <slug> [--comment <text>]",
    "Answer a release that waits for a second person.",
  ),
  entry(
    "tenant",
    ACCESS,
    "tenant rollback <number> --tenant <slug>",
    "Go back to the access a release left.",
  ),

  entry(
    "tenant",
    "Move a tenant",
    "tenant export --tenant <slug> --out <file> [--history]",
    "Write everything the tenant has to one file. The file's passphrase is read from VOLVEL_EXPORT_PASSPHRASE.",
  ),
  entry(
    "tenant",
    "Move a tenant",
    "tenant import <file> [--slug <slug>] [--location <name>]",
    "Bring an exported tenant into this instance. Operators only.",
  ),

  entry(
    "runs",
    "See what ran",
    "runs --tenant <slug> --workspace <slug> [run id]",
    "List recent runs, or show one with its logs.",
  ),
  entry(
    "runs",
    "See what ran",
    "runs cancel --tenant <slug> --workspace <slug> [--queued|--all] [--older-than <s>]",
    "Cancel the workspace's queued runs; with --all, those going too, and its flow runs.",
  ),
  entry(
    "logs",
    "See what ran",
    "logs <run id> --tenant <slug> --workspace <slug> [-f]",
    "A run's or flow run's logs; with -f, follow it to its end. Exits 0 when it succeeded, 1 failed, 3 canceled.",
  ),
] as const satisfies readonly CommandEntry[];

/** The first word of every command there is. */
export type CommandName = (typeof COMMANDS)[number]["command"];

/** What is true of several commands, said once under the list. */
export const COMMAND_NOTES = [
  "build, run, dev, deploy and pull read the repository in the current directory, or --dir <path>.",
  "Create an API key in the console under your account menu.",
  "VOLVEL_URL and VOLVEL_TOKEN override the saved settings.",
] as const;

const COLUMN = 40;
const WIDTH = 96;

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line !== "" && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line === "" ? word : `${line} ${word}`;
  }
  if (line !== "") lines.push(line);
  return lines;
}

/** What `volvel --help` prints. */
export function usage(): string {
  const out = [`Usage: ${COMMAND_NAME} <command>`];
  for (const group of COMMAND_GROUPS) {
    out.push("", group);
    for (const one of COMMANDS.filter((command) => command.group === group)) {
      const summary = wrap(one.summary.replace(/\.$/, ""), WIDTH - COLUMN);
      const head = `  ${one.usage}`;
      // A usage that fits beside its summary shares the line. A longer one takes its own.
      if (head.length < COLUMN - 1) {
        out.push(`${head.padEnd(COLUMN)}${summary.shift() ?? ""}`);
      } else out.push(head);
      for (const line of summary) out.push(`${" ".repeat(COLUMN)}${line}`);
    }
  }
  out.push("", ...COMMAND_NOTES);
  return out.join("\n");
}

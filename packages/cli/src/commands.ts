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
  "Run the instance",
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
  entry("logout", "Sign in", "logout", "Remove the saved instance and key."),
  entry(
    "profiles",
    "Sign in",
    "profiles",
    "List the saved sign-ins. Give --profile <name> to login, or to any command, to use one besides the default; VOLVEL_PROFILE does the same.",
  ),
  entry("whoami", "Sign in", "whoami [--json]", "Show who the saved key acts as."),
  entry(
    "status",
    "Sign in",
    "status [--json]",
    "Show the instance's version and readiness. Exits 1 when it is not ready.",
  ),

  entry(
    "instance",
    "Run the instance",
    "instance triggers [pause [--reason <text>]|resume]",
    "Show whether every trigger in every tenant is paused, or pause or resume them all. Operators only.",
  ),

  entry("init", REPOSITORY, "init [directory]", "Write a starter repository."),
  entry(
    "build",
    REPOSITORY,
    "build [--entry <file>] [--resources <folder>]",
    "Build the bundle and list what it contains. The file that exports the code (src/index.ts) and the folder of console resources (platform) can be changed here, or by `entry` and `resources` in volvel.yaml.",
  ),
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
    "Run it on the instance from this build, as a preview and not the deployed version, in a dev workspace, and follow it. Nothing is deployed.",
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
    "dev [app] --tenant <slug> --workspace <slug> [--port <n>] [--no-strict]",
    "Serve an app with reload, against that workspace's data, as yourself: an app made of files (built from its source), an interface (drawn from its file with the platform's own screens) or a docs site (drawn from its pages with the platform's own renderer, with search). With one app it needs no name; otherwise [app] is its path. An interface is drawn with the platform's screens, which the CLI carries; set SCREENS_DIR to use another build of them. Field help is not drawn locally. What only the instance knows, such as the product's own terms in a docs page, is said on the page. The page is served under the content policy the platform gives a deployed app, so what it would refuse fails here too; --no-strict leaves the policy off.",
  ),
  entry(
    "deploy",
    REPOSITORY,
    "deploy --tenant <slug> --workspace <slug> [--preview] [--message <text>] [--json] [--allow-delete <path>]",
    "Build, upload and deploy the bundle. Stops before uploading when it would delete console resources the repository has no file for, unless --allow-delete names each. With --preview, says what it would do and changes nothing. --message is kept with the version; in CI (CI is set) the subject of the last git commit is used when there is none. With --json, the one answer is a JSON document.",
  ),
  entry(
    "rollback",
    REPOSITORY,
    "rollback <version> --tenant <slug> --workspace <slug> [--message <text>] [--json]",
    "Roll back to an earlier version of the workspace's code, as a deploy of that version. Console resources stay as they are.",
  ),
  entry(
    "promote",
    REPOSITORY,
    "promote --tenant <slug> --workspace <slug> [--preview] [--message <text>] [--json] [--allow-delete <path>] [--confirm-breaking]",
    "Promote this workspace's bundle to the workspace it is linked to. Nothing is rebuilt. With --preview, exits 4 when a production promotion would be refused for breaking changes without --confirm-breaking. A failed push to the release branch is a warning: the promotion stands and the exit is 0. --message is kept with the version, as deploy's is.",
  ),

  entry(
    "tenant",
    ACCESS,
    "tenant plan --tenant <slug>",
    "What changing the tenant's access to match the repository's files would do.",
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
    "The access changes there were, newest first.",
  ),
  entry(
    "tenant",
    ACCESS,
    "tenant approve|decline|withdraw <number> --tenant <slug> [--comment <text>]",
    "Answer an access change that waits for a second person.",
  ),
  entry(
    "tenant",
    ACCESS,
    "tenant rollback <number> --tenant <slug> [--yes]",
    "Go back to the access an access change left. It says what that removes, and asks first; --yes answers for you, and is needed where there is no terminal to ask at.",
  ),
  entry(
    "tenant",
    ACCESS,
    "tenant approval [on|off] --tenant <slug>",
    "Say whether a change to the tenant's access waits for a second person. Without on or off, says which it is now. Turning it on needs two people who may change the access.",
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
    "runs --tenant <slug> --workspace <slug> [run id] [--json]",
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
  "build, schemas, run, dev, deploy, pull, tenant plan and tenant release read the repository in the current directory, or --dir <path>.",
  "build, run, dev and deploy take --entry <file>, where the code is exported from (src/index.ts); these and pull take --resources <folder>, where the console's resources are (platform). `entry` and `resources` in volvel.yaml say the same.",
  "Create an API key in the console under your account menu.",
  "VOLVEL_URL and VOLVEL_TOKEN override the saved settings.",
  "volvel --version prints the version. volvel <command> --help shows that command's lines.",
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
export function usage(only?: CommandName): string {
  const out = [only ? `Usage: ${COMMAND_NAME} ${only}` : `Usage: ${COMMAND_NAME} <command>`];
  for (const group of COMMAND_GROUPS) {
    const entries = COMMANDS.filter(
      (command) => command.group === group && (only === undefined || command.command === only),
    );
    if (entries.length === 0) continue;
    out.push("", group);
    for (const one of entries) {
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

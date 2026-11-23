/**
 * What `node dist/main.js <word>` does, decided before the settings are read or the database
 * is opened: so that `--help` and a mistyped word cost nothing, and a word nobody knows never
 * starts the instance by mistake.
 */

export type Command =
  | { run: "start" }
  | { run: "help" }
  | { run: "check-config" }
  | { run: "migrate" }
  | { run: "rekey"; dataRole: boolean }
  | { run: "recover-operator"; email: string | undefined }
  | { run: "unknown"; word: string };

export const USAGE = `Usage: volvel-start dist/main.js [command]

Runs the control plane, or one task of it, and exits.

Commands:
  (none)                     Start the instance.
  check-config               Read the settings from the environment, say what is wrong with
                             them, and exit: 0 when they are valid, 1 when not. Opens nothing.
  migrate                    Bring the database up to this version and exit. The instance
                             does this itself when it starts.
  rekey [--data-role]        Seal again with MASTER_KEY whatever MASTER_KEY_SECONDARY sealed,
                             say what was done, and exit: 1 when a value opened with neither
                             key. With --data-role, also change the seed of the data role's
                             password: stop every replica first and start them again after.
  recover-operator <email>   Enable that account, make it an operator admin, and print a new
                             password once, for an instance with no operator who can sign in.

--help or -h prints this and exits. The settings are the environment variables in
the documentation at /docs/self-host/reference/running/configuration; a command that reads them stops with every problem found, at once.`;

/** What the words after the program name ask for. */
export function commandOf(argv: string[]): Command {
  const [word, ...rest] = argv;
  if (argv.includes("--help") || argv.includes("-h") || word === "help") return { run: "help" };
  if (word === undefined) return { run: "start" };
  if (word === "check-config") return { run: "check-config" };
  if (word === "migrate") return { run: "migrate" };
  if (word === "rekey") return { run: "rekey", dataRole: rest.includes("--data-role") };
  if (word === "recover-operator") return { run: "recover-operator", email: rest[0] };
  return { run: "unknown", word };
}

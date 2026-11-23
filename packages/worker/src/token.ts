import { readFileSync } from "node:fs";

/**
 * The credential in a file, such as a Compose or Docker secret: the first line, without
 * its ends. A file is not in the process's environment or command line, so it does not
 * show in `docker inspect` or in `/proc/<pid>/environ`.
 */
export function readTokenFile(path: string): string {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(
      `The worker credential file ${path} cannot be read: ${(error as NodeJS.ErrnoException).code ?? "unknown error"}.`,
    );
  }
  const token = text.split("\n")[0]?.trim() ?? "";
  if (token === "") throw new Error(`The worker credential file ${path} is empty.`);
  return token;
}

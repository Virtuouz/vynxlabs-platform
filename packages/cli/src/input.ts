import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CliError } from "./errors.js";

/** The input a run is given: JSON on the command line, or a file of it with @. One reader for a local run and a remote one. */
export async function inputOf(text: string | undefined): Promise<unknown> {
  if (text === undefined) return {};
  const raw = text.startsWith("@")
    ? await readFile(resolve(text.slice(1)), "utf8").catch(() => {
        throw new CliError(`There is no file at ${resolve(text.slice(1))}.`);
      })
    : text;
  try {
    return JSON.parse(raw);
  } catch {
    throw new CliError(
      `--input must be JSON, or @ and a file of JSON, for example --input '{"customer":"ada"}'`,
    );
  }
}

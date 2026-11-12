import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { contractSchemas } from "./envelope.js";

/** The contract files as they should be on disk, keyed by file name. */
export function renderSchemas(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(contractSchemas).map(([file, schema]) => [
      file,
      `${JSON.stringify(schema, null, 2)}\n`,
    ]),
  );
}

export async function writeSchemas(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  for (const [file, contents] of Object.entries(renderSchemas())) {
    await writeFile(join(dir, file), contents);
  }
}

/** Names of the files in `dir` that are missing or differ from the code. */
export async function staleSchemas(dir: string): Promise<string[]> {
  const stale: string[] = [];
  for (const [file, contents] of Object.entries(renderSchemas())) {
    const onDisk = await readFile(join(dir, file), "utf8").catch(() => null);
    if (onDisk !== contents) {
      stale.push(file);
    }
  }
  return stale;
}

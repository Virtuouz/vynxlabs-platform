import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Bundle } from "./bundle.js";
import { envelopeSchemas } from "./envelope.js";
import { platformKinds } from "./kinds.js";

/** The contract files as they should be on disk, keyed by file name. */
export function renderSchemas(): Record<string, string> {
  const kinds = platformKinds.map((definition) => [
    `kinds/${definition.kind}.v${definition.schemaVersion}.schema.json`,
    {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: `kinds/${definition.kind}.v${definition.schemaVersion}.schema.json`,
      title: `${definition.kind} body, version ${definition.schemaVersion}`,
      ...definition.body,
    },
  ]);
  return Object.fromEntries(
    [...Object.entries(envelopeSchemas), ["bundle.schema.json", Bundle], ...kinds].map(
      ([file, schema]) => [file, `${JSON.stringify(schema, null, 2)}\n`],
    ),
  );
}

export async function writeSchemas(dir: string): Promise<void> {
  await mkdir(join(dir, "kinds"), { recursive: true });
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

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Bundle } from "./bundle.js";
import { envelopeSchemas } from "./envelope.js";
import { fileSchemas } from "./file-schema.js";
import { renderTypes } from "./json-schema-ts.js";
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
  // A resource as a file in a repository: what an editor completes and checks as it is typed.
  const files = fileSchemas().map((one) => [
    `files/${one.kind}.v${one.version}.schema.json`,
    one.schema,
  ]);
  return Object.fromEntries(
    [...Object.entries(envelopeSchemas), ["bundle.schema.json", Bundle], ...kinds, ...files].map(
      ([file, schema]) => [file, `${JSON.stringify(schema, null, 2)}\n`],
    ),
  );
}

export async function writeSchemas(dir: string): Promise<void> {
  await mkdir(join(dir, "kinds"), { recursive: true });
  await mkdir(join(dir, "files"), { recursive: true });
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

/** Where the types made from the schemas are kept, in the SDK, so that its `define*` take them. */
export const TYPES_FILE = "kinds.ts";

/**
 * A TypeScript type for the body of each kind's file, made from the same JSON Schemas as the
 * files in `schemas/`, so a field added to a kind is a field of its type. Where a kind has more
 * than one version, the newest is the one drawn.
 */
export function renderKindTypes(): string {
  const newest = new Map<string, { kind: string; version: number; body: object }>();
  for (const one of fileSchemas()) {
    const body = (one.schema as { properties: { body: object } }).properties.body;
    const held = newest.get(one.kind);
    if (held === undefined || held.version < one.version) {
      newest.set(one.kind, { kind: one.kind, version: one.version, body });
    }
  }
  return renderTypes(
    [...newest.values()].sort((a, b) => a.kind.localeCompare(b.kind)),
    "Source: packages/manifest/src/kinds.ts, through packages/manifest/src/file-schema.ts.",
  );
}

export async function writeKindTypes(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, TYPES_FILE), renderKindTypes());
}

/** Whether the generated types in `dir` are missing or differ from the kinds. */
export async function staleKindTypes(dir: string): Promise<boolean> {
  const onDisk = await readFile(join(dir, TYPES_FILE), "utf8").catch(() => null);
  return onDisk !== renderKindTypes();
}

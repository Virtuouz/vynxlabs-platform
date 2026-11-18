import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Bundle } from "./bundle.js";
import { envelopeSchemas, PATH_PATTERN } from "./envelope.js";
import { platformKinds } from "./kinds.js";
import { TENANT_KEY_PATTERN, TENANT_KINDS } from "./tenant.js";

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
  const files = [
    ...platformKinds.map((definition) => [
      `files/${definition.kind}.v${definition.schemaVersion}.schema.json`,
      fileSchema(
        definition.kind,
        definition.schemaVersion,
        forFile(definition.kind, definition.body),
      ),
    ]),
    ...TENANT_KINDS.map((definition) => [
      `files/${definition.kind}.v${definition.schemaVersion}.schema.json`,
      fileSchema(definition.kind, definition.schemaVersion, definition.body, false),
    ]),
  ];
  return Object.fromEntries(
    [...Object.entries(envelopeSchemas), ["bundle.schema.json", Bundle], ...kinds, ...files].map(
      ([file, schema]) => [file, `${JSON.stringify(schema, null, 2)}\n`],
    ),
  );
}

/** A kind's body as its file has it: the code of a script is in the `.ts` beside the file. */
function forFile(kind: string, body: object): object {
  if (!["script", "connector", "trigger_source"].includes(kind)) return body;
  const {
    properties = {},
    required = [],
    ...rest
  } = body as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  const { entry: _entry, source: _source, ...kept } = properties;
  return {
    ...rest,
    properties: kept,
    required: required.filter((name) => name !== "entry" && name !== "source"),
  };
}

/**
 * The schema of a resource's file, `<name>.<kind>.yaml`: its body, and beside
 * it what a file may say about the resource. A workspace's resource may say
 * where it is; one of a tenant's access has a key and no path.
 */
function fileSchema(kind: string, version: number, body: object, located = true): object {
  const key = {
    type: "string",
    pattern: located ? PATH_PATTERN : TENANT_KEY_PATTERN,
    description: located
      ? "The resource's identity, when that is not its path. Say it when you move the file: the path the resource had. It never changes."
      : "Its key, when that is not the file's name. It never changes.",
  };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `files/${kind}.v${version}.schema.json`,
    title: `${kind} file, version ${version}`,
    type: "object",
    properties: {
      key,
      ...(located
        ? {
            path: {
              type: "string",
              pattern: PATH_PATTERN,
              description:
                "The resource's path, when the file is kept somewhere that does not give it one.",
            },
          }
        : {}),
      title: { type: "string", minLength: 1, maxLength: 200, description: "What people read." },
      schemaVersion: { const: version },
      body,
    },
    required: located ? ["schemaVersion", "body"] : ["schemaVersion"],
    additionalProperties: false,
  };
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

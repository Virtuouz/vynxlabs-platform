import { PATH_PATTERN } from "./envelope.js";
import { DOC_KIND } from "./files.js";
import { platformKinds } from "./kinds.js";
import { TENANT_KEY_PATTERN, TENANT_KINDS } from "./tenant.js";

/** The schema of each kind's file, for the newest version of the kind. */
export function fileSchemas(): { kind: string; version: number; schema: object }[] {
  return [
    ...platformKinds
      // A page of documentation is a Markdown file, not a YAML one: it has no file schema.
      .filter((definition) => definition.kind !== DOC_KIND)
      .map((definition) => ({
        kind: definition.kind,
        version: definition.schemaVersion,
        schema: fileSchema(
          definition.kind,
          definition.schemaVersion,
          forFile(definition.kind, definition.body),
        ),
      })),
    ...TENANT_KINDS.map((definition) => ({
      kind: definition.kind,
      version: definition.schemaVersion,
      schema: fileSchema(definition.kind, definition.schemaVersion, definition.body, false),
    })),
  ];
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

/**
 * JSON Schema to TypeScript, for the schemas the kinds are written in. It is small on purpose: it
 * knows the features `kinds.ts` uses (objects, arrays, enums, const, oneOf/anyOf, `$ref` within the
 * file, additionalProperties, required) and says so when it meets another it cannot draw, instead
 * of drawing something that does not hold. What a schema checks beyond its shape (a length, a
 * pattern, a range) is a runtime matter and is left to the schema.
 */

type Schema = {
  type?: string | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean | Schema;
  items?: Schema;
  enum?: unknown[];
  const?: unknown;
  oneOf?: Schema[];
  anyOf?: Schema[];
  allOf?: Schema[];
  $ref?: string;
  $defs?: Record<string, Schema>;
  description?: string;
  [key: string]: unknown;
};

/** Keywords that decide the shape of a value, so that a schema with none of them says nothing about it. */
const SHAPE = ["type", "properties", "items", "enum", "const", "$ref", "oneOf", "anyOf", "allOf"];

/** Whether a branch only adds a condition (`{ required: ["a"] }`) and so draws nothing of its own. */
const onlyConditions = (schema: Schema) => !SHAPE.some((key) => key in schema);

const pad = (depth: number) => "  ".repeat(depth);

function comment(text: string | undefined, depth: number): string {
  if (!text) return "";
  const lines = text.replaceAll("*/", "*\\/").split("\n");
  if (lines.length === 1) return `${pad(depth)}/** ${lines[0]} */\n`;
  return `${pad(depth)}/**\n${lines.map((line) => `${pad(depth)} * ${line}`.trimEnd()).join("\n")}\n${pad(depth)} */\n`;
}

const isIdentifier = (name: string) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);

function literal(value: unknown): string {
  if (value === null) return "null";
  if (["string", "number", "boolean"].includes(typeof value)) return JSON.stringify(value);
  throw new Error(`A ${typeof value} cannot be a const or an enum member in a generated type.`);
}

/** Whether a type has a `|` or an `&` outside any brackets or quotes, and so needs parentheses to be a list's items. */
function wrapUnion(type: string): string {
  let depth = 0;
  let quote = "";
  for (let at = 0; at < type.length; at += 1) {
    const char = type.charAt(at);
    if (quote) {
      if (char === "\\") at += 1;
      else if (char === quote) quote = "";
    } else if (char === '"') quote = char;
    else if ("{[(".includes(char)) depth += 1;
    else if ("}])".includes(char)) depth -= 1;
    else if (depth === 0 && (char === "|" || char === "&")) return `(${type})`;
  }
  return type;
}

export function schemaToType(schema: Schema, root: Schema = schema, depth = 0): string {
  if (schema.$ref !== undefined) {
    const prefix = "#/$defs/";
    const name = schema.$ref.startsWith(prefix) ? schema.$ref.slice(prefix.length) : undefined;
    const target = name === undefined ? undefined : root.$defs?.[name];
    if (target === undefined)
      throw new Error(`A $ref other than "#/$defs/…" within the file: ${schema.$ref}`);
    return schemaToType(target, root, depth);
  }
  if (schema.const !== undefined) return literal(schema.const);
  if (schema.enum !== undefined) return schema.enum.map(literal).join(" | ");

  const branches = [...(schema.oneOf ?? []), ...(schema.anyOf ?? [])];
  const shaped = branches.filter((branch) => !onlyConditions(branch));
  // A schema whose branches only say which of its fields must be given draws as the schema alone.
  const { oneOf: _one, anyOf: _any, ...base } = schema;
  const baseHasShape = SHAPE.some((key) => key !== "oneOf" && key !== "anyOf" && key in schema);
  const own = baseHasShape ? single(base, root, depth) : undefined;
  if (shaped.length > 0) {
    const union = shaped.map((branch) => schemaToType(branch, root, depth)).join(" | ");
    return own === undefined ? union : `${wrapUnion(own)} & (${union})`;
  }
  if (own !== undefined) return own;
  return "unknown";
}

function single(schema: Schema, root: Schema, depth: number): string {
  if (schema.allOf !== undefined) {
    const { allOf: _all, ...rest0 } = schema;
    const rest = single(rest0, root, depth);
    const parts = schema.allOf.map((part) => schemaToType(part, root, depth));
    return [rest, ...parts].filter((part) => part !== "unknown").join(" & ") || "unknown";
  }
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (types.length === 0 && schema.properties !== undefined) types.push("object");
  if (types.length === 0) return "unknown";
  return types
    .map((type) => {
      switch (type) {
        case "string":
          return "string";
        case "number":
        case "integer":
          return "number";
        case "boolean":
          return "boolean";
        case "null":
          return "null";
        case "array":
          return schema.items === undefined
            ? "unknown[]"
            : `${wrapUnion(schemaToType(schema.items, root, depth))}[]`;
        case "object":
          return objectType(schema, root, depth);
        default:
          throw new Error(`The type "${type}" is not one a generated type can draw.`);
      }
    })
    .join(" | ");
}

function objectType(schema: Schema, root: Schema, depth: number): string {
  const properties = Object.entries(schema.properties ?? {});
  const required = new Set(schema.required ?? []);
  const extra = schema.additionalProperties;
  const lines: string[] = [];
  for (const [name, value] of properties) {
    const key = isIdentifier(name) ? name : JSON.stringify(name);
    lines.push(
      `${comment(value.description, depth + 1)}${pad(depth + 1)}${key}${required.has(name) ? "" : "?"}: ${schemaToType(value, root, depth + 1)};`,
    );
  }
  if (extra !== undefined && typeof extra === "object") {
    const type = schemaToType(extra, root, depth + 1);
    // With named fields beside it, the other fields must fit the index signature too.
    lines.push(`${pad(depth + 1)}[name: string]: ${properties.length > 0 ? "unknown" : type};`);
  } else if (properties.length === 0 && extra !== false) {
    return "Record<string, unknown>";
  }
  if (lines.length === 0) return "Record<string, never>";
  return `{\n${lines.join("\n")}\n${pad(depth)}}`;
}

/** A kind's name as a type's name: `trigger_source` is `TriggerSource`. */
export const typeName = (kind: string) =>
  kind
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

/** The text of the generated file: one exported type for the body of each kind's file. */
export function renderTypes(
  bodies: { kind: string; version: number; body: object }[],
  source: string,
): string {
  const out = [
    "// Generated by `pnpm emit:schemas` from the kinds' JSON Schemas. Do not edit: change the kind.",
    `// ${source}`,
    "",
  ];
  for (const { kind, version, body } of bodies) {
    out.push(
      `/** The body of ${/^[aeiou]/.test(kind) ? "an" : "a"} ${kind} resource's file, version ${version}. */`,
      `export type ${typeName(kind)}Body = ${schemaToType(body as Schema)};`,
      "",
    );
  }
  return `${out.join("\n")}`;
}

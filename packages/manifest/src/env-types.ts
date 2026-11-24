import { enumValues, type TableColumn } from "./table.js";

/** What the generator reads of a manifest: the bundle's manifests carry these, and so do a workspace's. */
export interface TypedManifest {
  kind: string;
  path: string;
  body: Record<string, unknown>;
}

/** Where the generated declarations are written, from a repository's root. Ignored by git, as `.platform/` is. */
export const ENV_TYPES_FILE = ".platform/volvel-env.d.ts";

const MAX_DEPTH = 8;

const literal = (value: unknown): string => {
  const text = JSON.stringify(value);
  return text === undefined ? "unknown" : text;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Text made safe to sit inside a `/** … *\/` comment, on one line. */
const commentOf = (text: unknown): string | undefined => {
  if (typeof text !== "string" || text.trim() === "") return undefined;
  return text.replace(/\*\//g, "*​/").replace(/\s+/g, " ").trim();
};

const withComment = (indent: string, text: unknown): string => {
  const line = commentOf(text);
  return line === undefined ? "" : `${indent}/** ${line} */\n`;
};

const key = (name: string): string =>
  /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : literal(name);

/**
 * A JSON Schema as a TypeScript type, for what a payload, an input or an output may be. What it
 * does not understand it leaves as `unknown`, never narrower than the schema allows.
 */
export function typeOfSchema(schema: unknown, depth = 0): string {
  if (!isObject(schema) || depth > MAX_DEPTH) return "unknown";
  if ("const" in schema) return literal(schema.const);
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum.map(literal).join(" | ");
  }
  const union = (schema.oneOf ?? schema.anyOf) as unknown;
  if (Array.isArray(union) && union.length > 0) {
    return union.map((one) => `(${typeOfSchema(one, depth + 1)})`).join(" | ");
  }
  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    return schema.allOf.map((one) => `(${typeOfSchema(one, depth + 1)})`).join(" & ");
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const each = types
    .map((type): string => {
      switch (type) {
        case "string":
          return "string";
        case "integer":
        case "number":
          return "number";
        case "boolean":
          return "boolean";
        case "null":
          return "null";
        case "array":
          return Array.isArray(schema.items)
            ? `[${schema.items.map((one) => typeOfSchema(one, depth + 1)).join(", ")}]`
            : `(${typeOfSchema(schema.items, depth + 1)})[]`;
        case "object":
          return objectType(schema, depth);
        default:
          return objectType(schema, depth, true);
      }
    })
    .filter((one, at, all) => all.indexOf(one) === at);
  return each.length === 0 ? "unknown" : each.join(" | ");
}

function objectType(schema: Record<string, unknown>, depth: number, guess = false): string {
  const properties = isObject(schema.properties) ? schema.properties : undefined;
  if (guess && !properties) return "unknown";
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const lines = Object.entries(properties ?? {}).map(
    ([name, one]) =>
      `${withComment("", isObject(one) ? one.description : undefined)}${key(name)}${required.has(name) ? "" : "?"}: ${typeOfSchema(one, depth + 1)};`,
  );
  if (lines.length > 0) return `{ ${lines.join(" ")} }`;
  const extra = schema.additionalProperties;
  if (extra === false) return "Record<string, never>";
  return `Record<string, ${isObject(extra) ? typeOfSchema(extra, depth + 1) : "unknown"}>`;
}

/** What one column holds in a row, apart from whether it may be empty. */
export function columnValueType(column: Pick<TableColumn, "type" | "values">): string {
  switch (column.type) {
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "json":
      return "unknown";
    case "enum":
    case "enum_list": {
      const values = enumValues(column.values).map((one) => literal(one.value));
      if (values.length === 0) return column.type === "enum" ? "string" : "string[]";
      const union = values.join(" | ");
      return column.type === "enum" ? union : `(${union})[]`;
    }
    default:
      // text, uuid, date, timestamp, reference and file are all text in a row.
      return "string";
  }
}

/**
 * A table's row and insert types, by the rules of `RowOf` and `InsertOf` in `@volvel/sdk`:
 * a column that is not required may be null, and one that is required with no default must
 * be given when a row is written. A test keeps the two in step.
 */
export function tableTypes(columns: Record<string, TableColumn>): { row: string; insert: string } {
  const row: string[] = ["id: string;", "created_at: string;", "updated_at: string;"];
  const insert: string[] = [];
  for (const [name, column] of Object.entries(columns)) {
    const value = columnValueType(column);
    const required = column.required === true;
    const defaulted = column.default !== undefined && column.default !== null;
    const doc = withComment("", column.description);
    row.push(`${doc}${key(name)}: ${required ? value : `${value} | null`};`);
    insert.push(
      `${doc}${key(name)}${required && !defaulted ? "" : "?"}: ${required ? value : `${value} | null`};`,
    );
  }
  return { row: `{ ${row.join(" ")} }`, insert: `{ ${insert.join(" ")} }` };
}

function flowInput(body: Record<string, unknown>): string | undefined {
  if (!isObject(body.nodes)) return undefined;
  const inputs: string[] = [];
  for (const node of Object.values(body.nodes)) {
    if (!isObject(node) || node.type !== "trigger" || !isObject(node.trigger)) continue;
    if (node.trigger.type !== "manual") continue;
    inputs.push(typeOfSchema(node.trigger.input));
  }
  if (inputs.length === 0) return undefined;
  return [...new Set(inputs)].map((one) => `(${one})`).join(" | ");
}

/**
 * The declarations that give `@volvel/sdk` the workspace's own names: `ctx.table("clinics")`
 * gives that table's rows, `ctx.events.publish("order-paid", …)` checks the payload, and
 * `ctx.variable(…)` and `ctx.connection(…)` complete the names that exist. They are written
 * from manifests, so they are the same whether a definition came from YAML or from code.
 * No value is imported: the file only adds to the SDK's interfaces.
 */
export function envDeclarations(manifests: readonly TypedManifest[]): string {
  const sorted = [...manifests].sort((a, b) => a.path.localeCompare(b.path));
  const section = (name: string, lines: string[]) =>
    lines.length === 0 ? "" : `  interface ${name} {\n${lines.join("\n")}\n  }\n`;
  const tables: string[] = [];
  const events: string[] = [];
  const variables: string[] = [];
  const connections: string[] = [];
  const flows: string[] = [];
  const scripts: string[] = [];
  const entry = (m: TypedManifest, type: string) =>
    `${withComment("    ", m.body.description)}    ${literal(m.path)}: ${type};`;
  for (const manifest of sorted) {
    const { body } = manifest;
    switch (manifest.kind) {
      case "table": {
        if (!isObject(body.columns)) break;
        const types = tableTypes(body.columns as Record<string, TableColumn>);
        tables.push(entry(manifest, `{ row: ${types.row}; insert: ${types.insert} }`));
        break;
      }
      case "event":
        events.push(entry(manifest, typeOfSchema(body.payload)));
        break;
      case "variable":
        variables.push(
          entry(manifest, `{ default: ${typeof body.default === "string" ? "string" : "null"} }`),
        );
        break;
      case "connection":
        connections.push(
          entry(
            manifest,
            `{ connector: ${typeof body.connector === "string" ? literal(body.connector) : "string"} }`,
          ),
        );
        break;
      case "flow": {
        const input = flowInput(body);
        flows.push(entry(manifest, `{ input: ${input ?? "unknown"} }`));
        break;
      }
      case "script": {
        const input = isObject(body.input) ? typeOfSchema(body.input) : "unknown";
        const output = isObject(body.output) ? typeOfSchema(body.output) : "unknown";
        scripts.push(entry(manifest, `{ input: ${input}; output: ${output} }`));
        break;
      }
    }
  }
  const body = [
    section("VolvelTables", tables),
    section("VolvelEvents", events),
    section("VolvelVariables", variables),
    section("VolvelConnections", connections),
    section("VolvelFlows", flows),
    section("VolvelScripts", scripts),
  ].join("");
  return [
    "// Written by `volvel build`, `volvel dev` and `volvel types` from your definitions. Do not edit it.",
    "// It gives the names of your tables, events, variables and connections to `@volvel/sdk`.",
    'import "@volvel/sdk";',
    "",
    'declare module "@volvel/sdk" {',
    body.trimEnd(),
    "}",
    "",
  ].join("\n");
}

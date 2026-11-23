/**
 * A manual start's input as a form of fields, and back. A schema is a form's rows when it is an
 * object of plainly typed properties; anything else (a choice of types, a pattern, a nested
 * object) is the JSON box's alone, and `fieldsOf` says which part it could not show.
 */

export type FieldType = "string" | "number" | "integer" | "boolean";

export interface SchemaRow {
  name: string;
  type: FieldType;
  required: boolean;
  description: string;
  /** The shortest text, or the smallest number. */
  min: number | undefined;
  /** The longest text, or the largest number. */
  max: number | undefined;
}

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "string", label: "Text" },
  { value: "number", label: "Number" },
  { value: "integer", label: "Whole number" },
  { value: "boolean", label: "Yes or no" },
];

const KEYS = ["type", "description", "minLength", "maxLength", "minimum", "maximum"];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The rows a schema is, or the reason the form cannot show it. */
export function fieldsOf(
  schema: Record<string, unknown> | undefined,
): { rows: SchemaRow[] } | { why: string } {
  if (schema === undefined) return { rows: [] };
  const extra = Object.keys(schema).find(
    (key) => !["type", "properties", "required"].includes(key),
  );
  if (extra) return { why: `It uses ${extra}.` };
  if (schema.type !== "object") return { why: 'It is not of type "object".' };
  const properties = schema.properties ?? {};
  if (!isObject(properties)) return { why: "Its properties are not an object." };
  const required = schema.required ?? [];
  if (!Array.isArray(required) || required.some((one) => typeof one !== "string")) {
    return { why: "Its required list is not a list of names." };
  }
  const rows: SchemaRow[] = [];
  for (const [name, property] of Object.entries(properties)) {
    if (!isObject(property)) return { why: `"${name}" is not an object.` };
    const key = Object.keys(property).find((one) => !KEYS.includes(one));
    if (key) return { why: `"${name}" uses ${key}.` };
    const type = property.type;
    if (type !== "string" && type !== "number" && type !== "integer" && type !== "boolean") {
      return { why: `"${name}" has a type the form does not offer.` };
    }
    const text = type === "string";
    const [low, high] = text ? ["minLength", "maxLength"] : ["minimum", "maximum"];
    const stray = (text ? ["minimum", "maximum"] : ["minLength", "maxLength"]).find(
      (one) => one in property,
    );
    if (stray || (type === "boolean" && (low as string) in property)) {
      return { why: `"${name}" uses ${stray ?? low}, which does not fit its type.` };
    }
    const bound = (key: string | undefined) => {
      const value = key === undefined ? undefined : property[key];
      return typeof value === "number" ? value : undefined;
    };
    if (
      [low, high].some((one) => one !== undefined && one in property && bound(one) === undefined)
    ) {
      return { why: `"${name}" has a limit that is not a number.` };
    }
    if (property.description !== undefined && typeof property.description !== "string") {
      return { why: `"${name}" has a description that is not text.` };
    }
    rows.push({
      name,
      type,
      required: required.includes(name),
      description: (property.description as string | undefined) ?? "",
      min: type === "boolean" ? undefined : bound(low),
      max: type === "boolean" ? undefined : bound(high),
    });
  }
  if (required.some((one) => !(one in properties))) {
    return { why: "It requires a name that is not one of its properties." };
  }
  return { rows };
}

/** What is wrong with the rows, by the place of the row, or nothing when they are a schema. */
export function problemsOf(rows: readonly SchemaRow[]): Map<number, string> {
  const found = new Map<number, string>();
  rows.forEach((row, at) => {
    const name = row.name.trim();
    if (name === "") found.set(at, "Give the field a name.");
    else if (rows.some((other, index) => index !== at && other.name.trim() === name)) {
      found.set(at, "Another field has this name.");
    } else if (row.min !== undefined && row.max !== undefined && row.min > row.max) {
      found.set(at, "The smallest is larger than the largest.");
    }
  });
  return found;
}

/** The schema the rows make: nothing when there are none. */
export function schemaOf(rows: readonly SchemaRow[]): Record<string, unknown> | undefined {
  if (rows.length === 0) return undefined;
  const properties: Record<string, unknown> = {};
  for (const row of rows) {
    const text = row.type === "string";
    properties[row.name.trim()] = {
      type: row.type,
      ...(row.description.trim() ? { description: row.description.trim() } : {}),
      ...(row.type !== "boolean" && row.min !== undefined
        ? { [text ? "minLength" : "minimum"]: row.min }
        : {}),
      ...(row.type !== "boolean" && row.max !== undefined
        ? { [text ? "maxLength" : "maximum"]: row.max }
        : {}),
    };
  }
  const required = rows.filter((row) => row.required).map((row) => row.name.trim());
  return { type: "object", properties, ...(required.length > 0 ? { required } : {}) };
}

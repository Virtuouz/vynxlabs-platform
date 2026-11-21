// Walks a JSON Schema into the fields it describes, for a page of reference
// and for the descriptions the console shows beside a field.

/** `|` and a line break would end a table's cell. */
export const cell = (text) =>
  String(text ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\s*\n\s*/g, " ");

function typeOf(schema) {
  if (schema.const !== undefined) return `\`${JSON.stringify(schema.const)}\``;
  if (schema.enum) return schema.enum.map((one) => `\`${one}\``).join(", ");
  if (schema.oneOf || schema.anyOf) return "one of several forms";
  if (schema.type === "array") return `list of ${schema.items ? typeOf(schema.items) : "anything"}`;
  if (schema.type === "object")
    return schema.additionalProperties && !schema.properties ? "named values" : "object";
  if (Array.isArray(schema.type)) return schema.type.join(" or ");
  return schema.type ?? "anything";
}

/**
 * Every field of a schema: where it is, what it is, whether it is needed and
 * what the schema says of it. A field inside a list or under any name has `*`
 * in its path. A schema of several forms gives each form's fields, and a field
 * found in more than one is listed once.
 */
export function fieldsOf(schema, prefix = "", seen = new Map(), required = false) {
  if (!schema || typeof schema !== "object") return seen;
  for (const form of [...(schema.oneOf ?? []), ...(schema.anyOf ?? []), ...(schema.allOf ?? [])]) {
    fieldsOf(form, prefix, seen);
  }
  for (const [name, inner] of Object.entries(schema.properties ?? {})) {
    const path = prefix === "" ? name : `${prefix}.${name}`;
    const needed = (schema.required ?? []).includes(name);
    const found = seen.get(path);
    if (!found) {
      seen.set(path, {
        path,
        type: typeOf(inner),
        required: needed,
        description: inner.description ?? "",
      });
    } else {
      if (!found.description && inner.description) found.description = inner.description;
      // Needed in one form and not in another is not needed.
      found.required = found.required && needed;
    }
    fieldsOf(inner, path, seen);
  }
  if (schema.type === "array" && schema.items)
    fieldsOf(schema.items, prefix === "" ? "*" : `${prefix}.*`, seen);
  if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    fieldsOf(schema.additionalProperties, prefix === "" ? "*" : `${prefix}.*`, seen);
  }
  return seen;
}

/** A table of a schema's fields, as Markdown. */
export function fieldTable(fields) {
  if (fields.length === 0) return "It has no fields.";
  return [
    "| Field | Holds | Needed | What it is |",
    "| --- | --- | --- | --- |",
    ...fields.map(
      (field) =>
        `| \`${field.path}\` | ${cell(field.type)} | ${field.required ? "Yes" : ""} | ${cell(field.description)} |`,
    ),
  ].join("\n");
}

export const page = (frontmatter, body) =>
  `---\n${Object.entries(frontmatter)
    .map(
      ([key, value]) =>
        `${key}: ${typeof value === "string" || Array.isArray(value) ? JSON.stringify(value) : value}`,
    )
    .join("\n")}\n---\n\n${body.trim()}\n`;

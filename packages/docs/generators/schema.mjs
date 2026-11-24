// Walks a JSON Schema into the fields it describes, for a page of reference
// and for the descriptions the console shows beside a field.

/** `|` and a line break would end a table's cell. */
export const cell = (text) =>
  String(text ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\s*\n\s*/g, " ");

export function typeOf(schema) {
  if (schema.const !== undefined) return `\`${JSON.stringify(schema.const)}\``;
  if (schema.enum) return schema.enum.map((one) => `\`${one}\``).join(", ");
  const forms = schema.oneOf ?? schema.anyOf;
  if (forms) {
    const real = forms.filter((form) => form.type !== "null");
    const orNull = real.length < forms.length ? " or null" : "";
    if (real.length > 0 && real.every((form) => form.const !== undefined))
      return `${real.map((form) => `\`${JSON.stringify(form.const)}\``).join(", ")}${orNull}`;
    if (real.length === 1) return `${typeOf(real[0])}${orNull}`;
    return "one of several forms";
  }
  if (schema.type === "array") return `list of ${schema.items ? typeOf(schema.items) : "anything"}`;
  if (schema.type === "object")
    return schema.additionalProperties && !schema.properties ? "named values" : "object";
  if (Array.isArray(schema.type)) return schema.type.join(" or ");
  return schema.type ?? "anything";
}

/** What the schema bounds a field to, in a sentence: "Minimum 1. Maximum 3600. Default 60." */
function limitsOf(schema) {
  const said = [];
  if (schema.minimum !== undefined) said.push(`Minimum ${schema.minimum}.`);
  if (schema.maximum !== undefined) said.push(`Maximum ${schema.maximum}.`);
  if (schema.exclusiveMinimum !== undefined) said.push(`Above ${schema.exclusiveMinimum}.`);
  if (schema.exclusiveMaximum !== undefined) said.push(`Below ${schema.exclusiveMaximum}.`);
  if (schema.minLength !== undefined)
    said.push(
      `At least ${schema.minLength} ${schema.minLength === 1 ? "character" : "characters"}.`,
    );
  if (schema.maxLength !== undefined)
    said.push(
      `At most ${schema.maxLength} ${schema.maxLength === 1 ? "character" : "characters"}.`,
    );
  if (schema.minItems !== undefined)
    said.push(`At least ${schema.minItems} ${schema.minItems === 1 ? "item" : "items"}.`);
  if (schema.maxItems !== undefined)
    said.push(`At most ${schema.maxItems} ${schema.maxItems === 1 ? "item" : "items"}.`);
  if (schema.format) said.push(`Format ${schema.format}.`);
  if (schema.pattern) said.push(`Pattern \`${schema.pattern}\`.`);
  if (schema.default !== undefined) {
    const text = JSON.stringify(schema.default);
    if (text.length <= 80) said.push(`Default ${text.replace(/^"|"$/g, "")}.`);
  }
  const example = Array.isArray(schema.examples) ? schema.examples[0] : undefined;
  if (example !== undefined && JSON.stringify(example).length <= 80)
    said.push(`Example ${JSON.stringify(example)}.`);
  return said.join(" ");
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
        limits: limitsOf(inner),
      });
    } else {
      if (!found.description && inner.description) found.description = inner.description;
      if (!found.limits) found.limits = limitsOf(inner);
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

const isObjectForm = (form) =>
  form &&
  typeof form === "object" &&
  (form.properties || form.oneOf || form.anyOf || form.allOf || form.type === "array");

/** What tells the forms of a union apart: a property that every form fixes to one value. */
function discriminatorOf(forms) {
  const first = forms[0]?.properties ?? {};
  for (const name of Object.keys(first)) {
    const fixed = (form) => {
      const one = form.properties?.[name];
      return one?.const ?? (one?.enum?.length === 1 ? one.enum[0] : undefined);
    };
    if (forms.every((form) => fixed(form) !== undefined)) return { name, fixed };
  }
  return undefined;
}

/**
 * The tables of a schema's fields: the first holds every field that is always there,
 * and each form of a union, at any depth, has a table of its own, so that a field
 * needed by one form is not shown as needed by all. A table is
 * `{ root, form, fields }`: where in the body its form is, what names the form (for
 * example `type is "schedule"`, empty for the first table) and its fields.
 */
export function tablesOf(schema) {
  const tables = [];
  const start = (root, form, about = "") => {
    const table = { root, form, about, fields: new Map() };
    tables.push(table);
    return table;
  };
  const add = (table, path, inner, needed) => {
    const found = table.fields.get(path);
    if (!found) {
      table.fields.set(path, {
        path,
        type: typeOf(inner),
        required: needed,
        description: inner.description ?? "",
        limits: limitsOf(inner),
      });
    } else {
      if (!found.description && inner.description) found.description = inner.description;
      if (!found.limits) found.limits = limitsOf(inner);
      found.required = found.required && needed;
    }
  };
  const walk = (node, prefix, table) => {
    if (!node || typeof node !== "object") return;
    for (const part of node.allOf ?? []) walk(part, prefix, table);
    const union = node.oneOf ?? node.anyOf;
    if (union) {
      const forms = union.filter(isObjectForm);
      if (forms.length === 1) walk(forms[0], prefix, table);
      else if (forms.length > 1) {
        const tell = discriminatorOf(forms);
        forms.forEach((form, index) => {
          const name = tell
            ? `\`${tell.name}\` is \`${JSON.stringify(tell.fixed(form))}\``
            : (form.title ??
              (form.required?.length
                ? `with ${form.required.map((one) => `\`${one}\``).join(" and ")}`
                : `form ${index + 1}`));
          walk(form, prefix, start(prefix, name, form.description ?? ""));
        });
      }
    }
    for (const [name, inner] of Object.entries(node.properties ?? {})) {
      const path = prefix === "" ? name : `${prefix}.${name}`;
      add(table, path, inner, (node.required ?? []).includes(name));
      walk(inner, path, table);
    }
    const star = prefix === "" ? "*" : `${prefix}.*`;
    if (node.type === "array" && node.items) walk(node.items, star, table);
    if (node.additionalProperties && typeof node.additionalProperties === "object")
      walk(node.additionalProperties, star, table);
  };
  walk(schema, "", start("", ""));
  return tables.map((table) => ({ ...table, fields: [...table.fields.values()] }));
}

/** A table of a schema's fields, as Markdown. */
export function fieldTable(fields) {
  if (fields.length === 0) return "It has no fields.";
  return [
    "| Field | Holds | Needed | What it is |",
    "| --- | --- | --- | --- |",
    ...fields.map(
      (field) =>
        `| \`${field.path}\` | ${cell(field.type)} | ${field.required ? "Yes" : ""} | ${cell(`${field.description} ${field.limits ?? ""}`.trim())} |`,
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

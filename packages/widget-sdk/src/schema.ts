/**
 * A small JSON Schema check for what a widget's frame sends with an event. The host runs in
 * a page whose policy refuses `eval`, so a validator that builds functions (Ajv) cannot run
 * there; this one only walks the value. It reads the keywords an event's payload needs:
 * `type`, `enum`, `const`, `properties`, `required`, `additionalProperties`, `items`,
 * `minItems`, `maxItems`, `minLength`, `maxLength`, `pattern`, `minimum`, `maximum`,
 * `exclusiveMinimum`, `exclusiveMaximum`, `anyOf`, `oneOf`, `allOf`. A keyword it does not
 * know (`$ref`, `not`, `if`) fails the value: a schema it cannot read admits nothing.
 */

type Schema = Readonly<Record<string, unknown>>;

const KNOWN = new Set([
  "type",
  "enum",
  "const",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "pattern",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "anyOf",
  "oneOf",
  "allOf",
  // Annotations: no effect on what is valid.
  "$schema",
  "$id",
  "title",
  "description",
  "default",
  "examples",
  "x-volvel",
]);

const MAX_DEPTH = 32;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function check(schema: unknown, value: unknown, at: string, depth: number): string | undefined {
  if (schema === true) return undefined;
  if (!isObject(schema)) return `${at}: the schema is not one this check reads`;
  if (depth > MAX_DEPTH) return `${at}: nested too deeply`;
  for (const key of Object.keys(schema)) {
    if (!KNOWN.has(key)) return `${at}: the schema uses "${key}", which is not read`;
  }
  const here = at === "" ? "the payload" : at;
  const kind = typeOf(value);
  const types = schema.type === undefined ? undefined : [schema.type].flat();
  if (types && !types.some((one) => one === kind || (one === "number" && kind === "integer")))
    return `${here} must be ${types.join(" or ")}, not ${kind}`;
  if (Array.isArray(schema.enum) && !schema.enum.some((one) => sameJson(one, value)))
    return `${here} is not one of the values the event allows`;
  if ("const" in schema && !sameJson(schema.const, value))
    return `${here} is not the value the event requires`;

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength)
      return `${here} is shorter than ${schema.minLength}`;
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength)
      return `${here} is longer than ${schema.maxLength}`;
    if (typeof schema.pattern === "string") {
      try {
        if (!new RegExp(schema.pattern, "u").test(value))
          return `${here} does not match its pattern`;
      } catch {
        return `${here}: the pattern is not valid`;
      }
    }
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum)
      return `${here} is under ${schema.minimum}`;
    if (typeof schema.maximum === "number" && value > schema.maximum)
      return `${here} is over ${schema.maximum}`;
    if (typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum)
      return `${here} must be over ${schema.exclusiveMinimum}`;
    if (typeof schema.exclusiveMaximum === "number" && value >= schema.exclusiveMaximum)
      return `${here} must be under ${schema.exclusiveMaximum}`;
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems)
      return `${here} has fewer than ${schema.minItems} items`;
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems)
      return `${here} has more than ${schema.maxItems} items`;
    if (schema.items !== undefined) {
      for (const [index, item] of value.entries()) {
        const problem = check(schema.items, item, `${at}/${index}`, depth + 1);
        if (problem) return problem;
      }
    }
  }
  if (isObject(value)) {
    const properties = isObject(schema.properties) ? schema.properties : {};
    if (Array.isArray(schema.required)) {
      for (const name of schema.required) {
        if (typeof name === "string" && !(name in value)) return `${here} lacks "${name}"`;
      }
    }
    for (const [name, one] of Object.entries(value)) {
      if (name in properties) {
        const problem = check(properties[name], one, `${at}/${name}`, depth + 1);
        if (problem) return problem;
      } else if (schema.additionalProperties === false) {
        return `${here} has "${name}", which the event does not declare`;
      } else if (isObject(schema.additionalProperties)) {
        const problem = check(schema.additionalProperties, one, `${at}/${name}`, depth + 1);
        if (problem) return problem;
      }
    }
  }
  if (Array.isArray(schema.allOf)) {
    for (const one of schema.allOf) {
      const problem = check(one, value, at, depth + 1);
      if (problem) return problem;
    }
  }
  if (Array.isArray(schema.anyOf)) {
    if (!schema.anyOf.some((one) => check(one, value, at, depth + 1) === undefined))
      return `${here} fits none of the shapes the event allows`;
  }
  if (Array.isArray(schema.oneOf)) {
    const fits = schema.oneOf.filter((one) => check(one, value, at, depth + 1) === undefined);
    if (fits.length !== 1) return `${here} must fit exactly one of the shapes the event allows`;
  }
  return undefined;
}

/** What is wrong with a value against a JSON Schema, in words, or nothing when it fits. */
export function payloadProblem(schema: Schema, value: unknown): string | undefined {
  return check(schema, value, "", 0);
}

/**
 * What the top of a page may say, as JSON Schema, and a check of a value
 * against it. The schema is the one the console, the control plane, the CLI
 * and the public site all read. The check knows the few keywords the schema
 * uses and says what is wrong in a sentence an author can act on.
 */

export interface Schema {
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean";
  description?: string;
  properties?: Record<string, Schema>;
  required?: readonly string[];
  additionalProperties?: false;
  minProperties?: number;
  maxProperties?: number;
  items?: Schema;
  maxItems?: number;
  uniqueItems?: boolean;
  enum?: readonly string[];
  pattern?: string;
  minLength?: number;
  maxLength?: number;
}

/** A resource's path, as the platform writes one. */
export const PATH_PATTERN = "^[a-z0-9][a-z0-9_-]*(/[a-z0-9][a-z0-9_-]*)*$";
const ID_PATTERN = "^[a-z0-9][a-z0-9_-]*$";

/** The kinds of resource a page can say it documents. */
export const ABOUT_KINDS = ["table", "script", "flow", "app", "connection", "query"] as const;
export type AboutKind = (typeof ABOUT_KINDS)[number];

const path = (description: string): Schema => ({
  type: "string",
  description,
  pattern: PATH_PATTERN,
  maxLength: 255,
});

export const FRONTMATTER_SCHEMA = {
  type: "object",
  description: "What the top of a page of documentation says about it.",
  properties: {
    title: {
      type: "string",
      description: "The page's title, as shown at its top, in navigation and in search.",
      minLength: 1,
      maxLength: 120,
    },
    description: {
      type: "string",
      description:
        "One or two sentences on what the page is for. Shown in navigation, search and link previews.",
      maxLength: 500,
    },
    pages: {
      type: "array",
      description:
        "For a folder's index page: the order of what is in the folder, by name. A page is named by its file name without .md, and a folder by its own name. What the list leaves out comes after it, by title.",
      items: { type: "string", pattern: "^[a-z0-9][a-z0-9_-]*$", maxLength: 255 },
      maxItems: 500,
    },
    icon: {
      type: "string",
      description: "For a folder's index page: the name of the icon shown beside the folder.",
      pattern: ID_PATTERN,
      maxLength: 40,
    },
    key: {
      type: "string",
      description:
        "The page's identity, when that is not its path. Say it only when you move a page, as the path it had, so that it stays the same page with its history.",
      pattern: PATH_PATTERN,
      maxLength: 255,
    },
    topic: {
      type: "string",
      description:
        "A name for this page that stays the same when the page moves. Help, links and other pages can point at it.",
      pattern: ID_PATTERN,
      maxLength: 80,
    },
    terms: {
      type: "array",
      description:
        "Glossary terms this page defines. The page is where each one's definition leads.",
      maxItems: 50,
      items: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The term's name in links: `:term[RMA]{id=rma}`.",
            pattern: ID_PATTERN,
            maxLength: 80,
          },
          term: {
            type: "string",
            description: "The term as it is written in text.",
            minLength: 1,
            maxLength: 80,
          },
          aliases: {
            type: "array",
            description: "Other ways the term is written.",
            maxItems: 10,
            uniqueItems: true,
            items: { type: "string", minLength: 1, maxLength: 80 },
          },
          short: {
            type: "string",
            description: "What it means, in plain text.",
            minLength: 1,
            maxLength: 500,
          },
        },
        required: ["id", "term", "short"],
        additionalProperties: false,
      },
    },
    about: {
      type: "array",
      description: "Resources this page documents. The page is listed where each of them is shown.",
      maxItems: 50,
      items: {
        type: "object",
        description: "One resource, by its kind and path.",
        properties: Object.fromEntries(
          ABOUT_KINDS.map((kind) => [kind, path(`A ${kind}, by its path.`)]),
        ),
        minProperties: 1,
        maxProperties: 1,
        additionalProperties: false,
      },
    },
    extends: {
      type: "array",
      description: "Topics of the product's own help that this page adds your team's notes to.",
      maxItems: 20,
      uniqueItems: true,
      items: { type: "string", pattern: ID_PATTERN, maxLength: 80 },
    },
    since: {
      type: "string",
      description: "For the product's own pages: the version that brought what the page describes.",
      pattern: "^\\d+\\.\\d+(\\.\\d+)?$",
    },
  },
  required: ["title"],
  additionalProperties: false,
} as const satisfies Schema;

export interface TermDefinition {
  id: string;
  term: string;
  aliases?: string[];
  short: string;
}

export type About = { [Kind in AboutKind]?: string };

export interface Frontmatter {
  title: string;
  key?: string;
  description?: string;
  pages?: string[];
  icon?: string;
  topic?: string;
  terms?: TermDefinition[];
  about?: About[];
  extends?: string[];
  since?: string;
}

export interface SchemaProblem {
  /** Where in the value, as it would be written: `terms[1].short`. Empty for the value itself. */
  at: string;
  /** The last name in `at`, to find the line by. */
  key?: string;
  message: string;
}

const KIND = {
  object: "a set of named values",
  array: "a list",
  string: "text",
  number: "a number",
  integer: "a whole number",
  boolean: "true or false",
};

function isA(value: unknown, type: NonNullable<Schema["type"]>): boolean {
  switch (type) {
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    default:
      return typeof value === type;
  }
}

/** Checks a value against a schema. An empty list means it fits. */
export function check(value: unknown, schema: Schema, at = "", key?: string): SchemaProblem[] {
  const name = at === "" ? "This" : at;
  const problem = (message: string): SchemaProblem =>
    key === undefined ? { at, message } : { at, key, message };
  if (schema.type && !isA(value, schema.type)) {
    return [problem(`${name} is ${KIND[schema.type]}.`)];
  }
  const out: SchemaProblem[] = [];
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      out.push(problem(`${name} is empty.`));
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      out.push(
        problem(`${name} is ${value.length} characters. It can be ${schema.maxLength} at most.`),
      );
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      out.push(
        problem(
          schema.pattern === PATH_PATTERN || schema.pattern === ID_PATTERN
            ? `${name} is written in lowercase letters, digits, hyphens and underscores${schema.pattern === PATH_PATTERN ? ", in folders" : ""}. It is "${value}".`
            : `${name} is not written as it should be: "${value}".`,
        ),
      );
    }
    if (schema.enum && !schema.enum.includes(value)) {
      out.push(problem(`${name} is one of ${schema.enum.join(", ")}. It is "${value}".`));
    }
  }
  if (Array.isArray(value)) {
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      out.push(
        problem(`${name} has ${value.length} entries. It can have ${schema.maxItems} at most.`),
      );
    }
    if (
      schema.uniqueItems &&
      new Set(value.map((one) => JSON.stringify(one))).size !== value.length
    ) {
      out.push(problem(`${name} says the same thing twice.`));
    }
    if (schema.items) {
      value.forEach((one, index) => {
        out.push(...check(one, schema.items as Schema, `${at}[${index}]`, key));
      });
    }
  }
  if (isA(value, "object")) {
    const record = value as Record<string, unknown>;
    const names = Object.keys(record);
    const known = Object.keys(schema.properties ?? {});
    for (const one of names) {
      const inner = schema.properties?.[one];
      const where = at === "" ? one : `${at}.${one}`;
      if (inner) out.push(...check(record[one], inner, where, one));
      else if (schema.additionalProperties === false) {
        out.push({
          at: where,
          key: one,
          message: `There is no "${one}" ${at === "" ? "here" : `in ${at}`}. It can have: ${known.join(", ")}.`,
        });
      }
    }
    for (const one of schema.required ?? []) {
      if (record[one] === undefined)
        out.push(problem(`${at === "" ? "It" : at} needs ${at === "" ? `a ${one}` : one}.`));
    }
    if (schema.minProperties !== undefined && names.length < schema.minProperties) {
      out.push(problem(`${name} names nothing. It names one of: ${known.join(", ")}.`));
    }
    if (schema.maxProperties !== undefined && names.length > schema.maxProperties) {
      out.push(
        problem(`${name} names ${names.length} things (${names.join(", ")}). It names one.`),
      );
    }
  }
  return out;
}

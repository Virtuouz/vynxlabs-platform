import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import { KIND_PATTERN, Manifest, StoredResource } from "./envelope.js";
import {
  countNodes,
  MAX_VALUE_NODES,
  PatternError,
  re2RegExp,
  schemaProblem,
} from "./pattern-guard.js";

/** A resource kind: its name, the version of its body schema, and that schema. */
export interface KindDefinition {
  kind: string;
  schemaVersion: number;
  /** JSON Schema (draft 2020-12) for the manifest body. */
  body: object;
}

export interface ManifestIssue {
  /** JSON pointer into the manifest, for example /body/timeout. */
  path: string;
  message: string;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: ManifestIssue[] };

/**
 * What a value of each string format looks like, in words. zod writes each
 * format out as a long regular expression beside it, and "must match pattern"
 * followed by that expression tells a person, or an agent, nothing.
 */
const FORMATS: Record<string, string> = {
  "date-time": "must be a date and time in ISO 8601, such as 2026-11-17T10:00:00Z",
  date: "must be a date as YYYY-MM-DD, such as 2026-11-17",
  time: "must be a time as HH:MM:SS, such as 14:30:00",
  duration: "must be an ISO 8601 duration, such as PT30M",
  uuid: "must be a UUID, such as 0b8f6c3e-2a51-4d8e-9a6f-3c1e7d2b4a90",
  email: "must be an email address, such as name@example.com",
  uri: "must be a URL, such as https://example.com/page",
  url: "must be a URL, such as https://example.com/page",
  ipv4: "must be an IPv4 address, such as 192.0.2.10",
  ipv6: "must be an IPv6 address, such as 2001:db8::1",
};

function messageOf(error: ErrorObject): string {
  // A pattern that only restates a format is described by the format. Needs `verbose`.
  const format = (error.parentSchema as { format?: unknown } | undefined)?.format;
  if (error.keyword === "pattern" && typeof format === "string") {
    return FORMATS[format] ?? `must be in the ${format} format`;
  }
  // A field left empty is said to be empty, not to fail the grammar of what it was to hold.
  if (error.keyword === "pattern" && (error as { data?: unknown }).data === "") {
    return "is empty: it needs a value";
  }
  const extra =
    error.keyword === "additionalProperties" ? ` (${String(error.params.additionalProperty)})` : "";
  return `${error.message ?? "is invalid"}${extra}`;
}

/**
 * A value that must be one of several shapes (a step of a flow, by its `type`) is refused with
 * the faults of every shape it is not. Only the shape its discriminator names is what a person
 * can mend: the errors of a branch that fails on a `const` (the `type` itself) are dropped, with
 * the "must match exactly one schema" that sums them up. When no branch is named, all stay.
 */
function ofTheNamedShape(errors: ErrorObject[]): ErrorObject[] {
  const drop = new Set<ErrorObject>();
  for (const sum of errors) {
    if (sum.keyword !== "oneOf" && sum.keyword !== "anyOf") continue;
    const open = `${sum.schemaPath}/`;
    const inside = (error: ErrorObject) =>
      error.schemaPath.startsWith(open) &&
      (error.instancePath === sum.instancePath ||
        error.instancePath.startsWith(`${sum.instancePath}/`));
    const branches = new Map<string, ErrorObject[]>();
    for (const error of errors) {
      if (!inside(error)) continue;
      const branch = error.schemaPath.slice(open.length).split("/")[0] as string;
      branches.set(branch, [...(branches.get(branch) ?? []), error]);
    }
    const wrong = [...branches.values()].filter((group) =>
      group.some((error) => error.keyword === "const"),
    );
    if (wrong.length === 0 || wrong.length === branches.size) continue;
    drop.add(sum);
    for (const group of wrong) for (const error of group) drop.add(error);
  }
  return errors.filter((error) => !drop.has(error));
}

function toIssues(errors: ErrorObject[] | null | undefined, prefix = ""): ManifestIssue[] {
  return ofTheNamedShape(errors ?? []).map((error) => ({
    path: `${prefix}${error.instancePath}` || "/",
    message: messageOf(error),
  }));
}

/**
 * Holds the registered kinds and validates manifests against them. Adding a
 * kind is one `register` call. Nothing else in the platform changes.
 */
export class KindRegistry {
  // Body schemas may carry annotation keywords for editors, so unknown keywords are allowed.
  readonly #ajv = new Ajv2020({ allErrors: true, strict: false, verbose: true });
  readonly #manifest: ValidateFunction;
  readonly #stored: ValidateFunction;
  readonly #kinds = new Map<string, Map<number, ValidateFunction>>();

  constructor() {
    this.#manifest = this.#ajv.compile(Manifest);
    this.#stored = this.#ajv.compile(StoredResource);
  }

  register(definition: KindDefinition): this {
    const { kind, schemaVersion, body } = definition;
    if (!new RegExp(KIND_PATTERN).test(kind)) {
      throw new Error(`Kind name "${kind}" must match ${KIND_PATTERN}.`);
    }
    if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
      throw new Error(`Kind "${kind}" needs a positive integer schema version.`);
    }
    const versions = this.#kinds.get(kind) ?? new Map<number, ValidateFunction>();
    if (versions.has(schemaVersion)) {
      throw new Error(`Kind "${kind}" version ${schemaVersion} is already registered.`);
    }
    versions.set(schemaVersion, this.#ajv.compile(body));
    this.#kinds.set(kind, versions);
    return this;
  }

  /** The registered kinds and their schema versions, sorted. */
  kinds(): { kind: string; schemaVersions: number[] }[] {
    return [...this.#kinds.entries()]
      .map(([kind, versions]) => ({
        kind,
        schemaVersions: [...versions.keys()].sort((a, b) => a - b),
      }))
      .sort((a, b) => a.kind.localeCompare(b.kind));
  }

  validateManifest(input: unknown): ValidationResult<Manifest> {
    return this.#validate<Manifest>(this.#manifest, input);
  }

  validateStoredResource(input: unknown): ValidationResult<StoredResource> {
    return this.#validate<StoredResource>(this.#stored, input);
  }

  #validate<T extends Manifest>(envelope: ValidateFunction, input: unknown): ValidationResult<T> {
    if (!envelope(input)) {
      return { ok: false, issues: toIssues(envelope.errors) };
    }
    const value = input as T;
    const versions = this.#kinds.get(value.kind);
    if (!versions) {
      return { ok: false, issues: [{ path: "/kind", message: `unknown kind "${value.kind}"` }] };
    }
    const body = versions.get(value.schemaVersion);
    if (!body) {
      const known = [...versions.keys()].sort((a, b) => a - b).join(", ");
      return {
        ok: false,
        issues: [
          {
            path: "/schemaVersion",
            message: `kind "${value.kind}" has no schema version ${value.schemaVersion} (known: ${known})`,
          },
        ],
      };
    }
    if (!body(value.body)) {
      return { ok: false, issues: toIssues(body.errors, "/body") };
    }
    return { ok: true, value };
  }
}

// `verbose` keeps each error's schema, so a format's pattern can be described in words.
// The platform's own schemas (its kinds) keep the built-in engine; a tenant's run on RE2.
const OWN_OPTIONS = { allErrors: true, strict: false, verbose: true } as const;
const OPTIONS = {
  allErrors: true,
  strict: false,
  verbose: true,
  code: { regExp: re2RegExp },
} as const;

/**
 * Each schema is compiled by an Ajv of its own, so no schema can see another's `$id` (two tenants
 * naming theirs alike must not collide) and nothing is kept in a shared registry. The compiled
 * validators are held in a bounded list, newest last, keyed by the schema's text, so a schema read
 * again from the database at every run start is compiled once and the list does not grow with runs.
 */
const MAX_COMPILED = 256;
const compiled = new Map<string, ValidateFunction>();

/** How many schemas are held compiled (for the tests). */
export const compiledSchemaCount = (): number => compiled.size;

function compile(schema: object, own: boolean): ValidateFunction {
  const key = (own ? "own:" : "") + JSON.stringify(schema);
  const held = compiled.get(key);
  if (held) {
    compiled.delete(key);
    compiled.set(key, held);
    return held;
  }
  const validate = new Ajv2020(own ? OWN_OPTIONS : OPTIONS).compile(schema);
  compiled.set(key, validate);
  if (compiled.size > MAX_COMPILED) compiled.delete(compiled.keys().next().value as string);
  return validate;
}

/**
 * Checks a value against any JSON Schema. Returns the problems, or an empty list. The schema is
 * taken to be a tenant's: its patterns run on RE2, and one RE2 cannot run fails the check with the
 * reason. `own` is for the platform's own schemas only.
 */
export function validateJson(
  schema: object,
  value: unknown,
  prefix = "",
  own = false,
): ManifestIssue[] {
  if (!own) {
    const tooBig = schemaProblem(schema);
    if (tooBig) return [{ path: prefix || "/", message: `the schema is ${tooBig}` }];
    if (countNodes(value, MAX_VALUE_NODES) > MAX_VALUE_NODES)
      return [
        {
          path: prefix || "/",
          message: `is too large to be checked against a schema (more than ${MAX_VALUE_NODES} values)`,
        },
      ];
  }
  try {
    const validate = compile(schema, own);
    return validate(value) ? [] : toIssues(validate.errors, prefix);
  } catch (error) {
    // A pattern RE2 does not run, or a value too long for one: said in words, not run.
    if (error instanceof PatternError) return [{ path: prefix || "/", message: error.message }];
    throw error;
  }
}

/** Why a value is not a JSON Schema (draft 2020-12), in Ajv's words; nothing when it is one. */
export function jsonSchemaProblem(schema: unknown): string | undefined {
  const tooBig = schemaProblem(schema);
  if (tooBig) return `the schema is ${tooBig}`;
  try {
    new Ajv2020(OPTIONS).compile(schema as object);
    return undefined;
  } catch (error) {
    return (error as Error).message.replace(/^schema is invalid: /, "");
  }
}

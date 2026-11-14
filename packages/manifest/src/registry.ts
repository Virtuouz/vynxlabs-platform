import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import { KIND_PATTERN, Manifest, StoredResource } from "./envelope.js";

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
  const extra =
    error.keyword === "additionalProperties" ? ` (${String(error.params.additionalProperty)})` : "";
  return `${error.message ?? "is invalid"}${extra}`;
}

function toIssues(errors: ErrorObject[] | null | undefined, prefix = ""): ManifestIssue[] {
  return (errors ?? []).map((error) => ({
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
  readonly #ajv = new Ajv2020({ allErrors: true, strict: false });
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
const schemaValidator = new Ajv2020({ allErrors: true, strict: false, verbose: true });
const compiled = new WeakMap<object, ValidateFunction>();

/** Checks a value against any JSON Schema. Returns the problems, or an empty list. */
export function validateJson(schema: object, value: unknown, prefix = ""): ManifestIssue[] {
  let validate = compiled.get(schema);
  if (!validate) {
    validate = schemaValidator.compile(schema);
    compiled.set(schema, validate);
  }
  return validate(value) ? [] : toIssues(validate.errors, prefix);
}

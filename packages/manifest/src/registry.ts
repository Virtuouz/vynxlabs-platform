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

function toIssues(errors: ErrorObject[] | null | undefined, prefix = ""): ManifestIssue[] {
  return (errors ?? []).map((error) => {
    const extra =
      error.keyword === "additionalProperties"
        ? ` (${String(error.params.additionalProperty)})`
        : "";
    return {
      path: `${prefix}${error.instancePath}` || "/",
      message: `${error.message ?? "is invalid"}${extra}`,
    };
  });
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

const schemaValidator = new Ajv2020({ allErrors: true, strict: false });
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

import { parse, stringify } from "yaml";
import type { BundleManifest } from "./bundle.js";
import { KIND_PATTERN, PATH_PATTERN } from "./envelope.js";
import type { KindDefinition } from "./registry.js";

/**
 * Console-managed resources as files in a tenant's repository.
 *
 * Each resource is one YAML file, `<path>.<kind>.yaml`, under a reserved
 * folder. A resource with source keeps it beside the YAML, as
 * `<path>.<kind>.ts`. The path and the kind come from the file name alone, so
 * the two cannot disagree and renaming a resource is renaming its files.
 *
 * Writing is deterministic: the same resources always give the same bytes, so
 * a commit shows only what changed.
 */

/** The folder the files live in, relative to the repository's root, unless a repository says otherwise. */
export const RESOURCE_FOLDER = "platform";

export interface ResourceFile {
  /** Relative to the reserved folder, with forward slashes: `orders/sync.script.yaml`. */
  path: string;
  content: string;
}

/** The kinds whose manifest names code in the bundle, and so carries `entry` and may carry `source`. */
const CODE_KINDS = new Set(["script", "connector", "trigger_source"]);

/**
 * The export a console-managed resource has in the bundle. It is derived from
 * the path, never stored in a file, and no two paths give the same name.
 */
export function entryFor(kind: string, path: string): string {
  const mangled = path.replace(/[_/-]/g, (char) =>
    char === "_" ? "_u" : char === "-" ? "_d" : "_s",
  );
  return `ui_${kind}_${mangled}`;
}

const YAML_OPTIONS = { lineWidth: 0, version: "1.2" } as const;

type Schema = {
  properties?: Record<string, Schema>;
  additionalProperties?: Schema | boolean;
  items?: Schema;
  oneOf?: Schema[];
};

/**
 * Puts an object's keys in the order its schema lists them, at every depth the
 * schema describes. Keys the schema does not name keep the order they came in,
 * after the named ones: the nodes of a flow stay as their author arranged them.
 */
function ordered(value: unknown, schema: Schema | undefined): unknown {
  if (Array.isArray(value)) return value.map((item) => ordered(item, schema?.items));
  if (value === null || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  // One of several shapes: order by the one that names the most of the keys present.
  const shape =
    schema?.oneOf
      ?.map((option) => ({
        option,
        named: Object.keys(record).filter((key) => option.properties?.[key]).length,
      }))
      .sort((a, b) => b.named - a.named)[0]?.option ?? schema;
  const named = Object.keys(shape?.properties ?? {}).filter((key) => key in record);
  const rest = Object.keys(record).filter((key) => !shape?.properties?.[key]);
  const extra =
    typeof shape?.additionalProperties === "object" ? shape.additionalProperties : undefined;
  const result: Record<string, unknown> = {};
  for (const key of named) result[key] = ordered(record[key], shape?.properties?.[key]);
  for (const key of rest) result[key] = ordered(record[key], extra);
  return result;
}

/**
 * Writes manifests as files. `kinds` gives each kind's schema, which fixes the
 * order of keys. Files come back sorted by path.
 */
export function renderResourceFiles(
  manifests: readonly BundleManifest[],
  kinds: readonly KindDefinition[],
): ResourceFile[] {
  const files: ResourceFile[] = [];
  for (const manifest of manifests) {
    const schema = kinds.find(
      (kind) => kind.kind === manifest.kind && kind.schemaVersion === manifest.schemaVersion,
    )?.body as Schema | undefined;
    const {
      source,
      entry: _entry,
      ...rest
    } = manifest.body as {
      source?: { language: string; code: string };
      entry?: unknown;
    };
    const body = CODE_KINDS.has(manifest.kind) ? rest : { ...rest, ...(source ? { source } : {}) };
    const stem = `${manifest.path}.${manifest.kind}`;
    files.push({
      path: `${stem}.yaml`,
      content: stringify(
        { schemaVersion: manifest.schemaVersion, body: ordered(body, schema) },
        YAML_OPTIONS,
      ),
    });
    if (CODE_KINDS.has(manifest.kind) && source) {
      const code = source.code.replace(/\r\n?/g, "\n");
      files.push({ path: `${stem}.ts`, content: code.endsWith("\n") ? code : `${code}\n` });
    }
  }
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

const FILE_NAME = /^(.+)\.([a-z][a-z0-9_]*)\.(yaml|ts)$/;

export interface ParsedResources {
  manifests: BundleManifest[];
  /** What is wrong, each naming its file. Manifests with a problem are left out. */
  problems: string[];
}

/**
 * Reads files back into manifests, marked console-managed. It checks only what
 * the files themselves can get wrong: names, YAML, and source without a
 * resource. Whether each body is valid for its kind is checked with the rest
 * of the bundle.
 */
export function parseResourceFiles(files: readonly ResourceFile[]): ParsedResources {
  const problems: string[] = [];
  const yaml = new Map<string, ResourceFile & { resource: string; kind: string }>();
  const sources = new Map<string, ResourceFile>();
  const pathPattern = new RegExp(PATH_PATTERN);
  const kindPattern = new RegExp(KIND_PATTERN);

  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const match = FILE_NAME.exec(file.path);
    if (!match) {
      problems.push(`${file.path}: is not named <path>.<kind>.yaml or <path>.<kind>.ts.`);
      continue;
    }
    const [, resource = "", kind = "", extension] = match;
    if (!pathPattern.test(resource) || !kindPattern.test(kind)) {
      problems.push(
        `${file.path}: "${resource}" is not a resource path. Use lowercase letters, digits, hyphens and underscores, in folders.`,
      );
      continue;
    }
    if (extension === "ts") sources.set(`${resource}.${kind}`, file);
    else yaml.set(`${resource}.${kind}`, { ...file, resource, kind });
  }

  const manifests: BundleManifest[] = [];
  const seen = new Map<string, string>();
  for (const [stem, file] of yaml) {
    let document: unknown;
    try {
      document = parse(file.content, { version: "1.2" });
    } catch (error) {
      problems.push(`${file.path}: is not valid YAML. ${(error as Error).message.split("\n")[0]}`);
      continue;
    }
    const { schemaVersion, body, ...unknown } = (document ?? {}) as {
      schemaVersion?: unknown;
      body?: unknown;
    };
    if (!Number.isInteger(schemaVersion) || (schemaVersion as number) < 1) {
      problems.push(`${file.path}: needs a schemaVersion, a whole number from 1.`);
      continue;
    }
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      problems.push(`${file.path}: needs a body.`);
      continue;
    }
    if (Object.keys(unknown).length > 0) {
      problems.push(
        `${file.path}: has keys other than schemaVersion and body: ${Object.keys(unknown).join(", ")}.`,
      );
      continue;
    }
    // Paths are unique across kinds, in files as in a workspace.
    const other = seen.get(file.resource);
    if (other) {
      problems.push(`${file.path}: the path ${file.resource} is already used by ${other}.`);
      continue;
    }
    seen.set(file.resource, file.path);

    const source = sources.get(stem);
    const code = CODE_KINDS.has(file.kind);
    if (code && !source) {
      problems.push(`${file.path}: needs its source beside it, as ${stem}.ts.`);
      continue;
    }
    if (code && ("entry" in body || "source" in body)) {
      problems.push(`${file.path}: must not set entry or source. The source is ${stem}.ts.`);
      continue;
    }
    manifests.push({
      kind: file.kind,
      schemaVersion: schemaVersion as number,
      path: file.resource,
      ownership: "ui",
      body: {
        ...(body as Record<string, unknown>),
        ...(code
          ? {
              entry: entryFor(file.kind, file.resource),
              source: { language: "typescript", code: (source as ResourceFile).content },
            }
          : {}),
      },
    });
  }
  for (const [stem, file] of sources) {
    const kind = stem.split(".").at(-1) as string;
    if (!yaml.has(stem)) problems.push(`${file.path}: has no ${stem}.yaml beside it.`);
    else if (!CODE_KINDS.has(kind)) problems.push(`${file.path}: a ${kind} has no source.`);
  }
  return { manifests, problems };
}

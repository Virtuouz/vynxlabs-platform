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
    // The platform's own nodes are added again on every compose. They are not the repository's.
    if (manifest.path.startsWith("core/")) continue;
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
        {
          // Said only when they say something: a file without them is written as it always was.
          ...(manifest.key !== undefined && manifest.key !== manifest.path
            ? { key: manifest.key }
            : {}),
          ...(manifest.title !== undefined ? { title: manifest.title } : {}),
          schemaVersion: manifest.schemaVersion,
          body: ordered(body, schema),
        },
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
  const yaml = new Map<string, Located>();
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
    else yaml.set(`${resource}.${kind}`, { ...file, resource, kind, stem: `${resource}.${kind}` });
  }
  return read(yaml, sources, problems);
}

/** A resource's YAML file, with the path its place gives it, if its place gives one. */
type Located = ResourceFile & {
  /** The path the file's place gives the resource. None when it is outside every root. */
  resource: string | undefined;
  kind: string;
  /** The file's name without its extension: its source is beside it under the same name. */
  stem: string;
};

/**
 * Reads located files into manifests. A file may say beside its body: `key`,
 * the resource's identity when that is not its path; `path`, when the file is
 * kept somewhere that is not the path; and `title`.
 */
function read(
  yaml: Map<string, Located>,
  sources: Map<string, ResourceFile>,
  problems: string[],
  options: {
    roots?: readonly string[];
    note?: (manifest: BundleManifest, file: Located) => void;
  } = {},
): ParsedResources {
  const pathPattern = new RegExp(PATH_PATTERN);
  const manifests: BundleManifest[] = [];
  const seen = new Map<string, string>();
  const keys = new Map<string, string>();
  for (const [, file] of yaml) {
    let document: unknown;
    try {
      document = parse(file.content, { version: "1.2" });
    } catch (error) {
      problems.push(`${file.path}: is not valid YAML. ${(error as Error).message.split("\n")[0]}`);
      continue;
    }
    const {
      key,
      path: said,
      title,
      schemaVersion,
      body,
      ...unknown
    } = (document ?? {}) as {
      key?: unknown;
      path?: unknown;
      title?: unknown;
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
        `${file.path}: has keys other than key, path, title, schemaVersion and body: ${Object.keys(unknown).join(", ")}.`,
      );
      continue;
    }
    for (const [name, value] of [
      ["key", key],
      ["path", said],
    ] as const) {
      if (value !== undefined && (typeof value !== "string" || !pathPattern.test(value))) {
        problems.push(
          `${file.path}: its ${name} is written as a path is: lowercase letters, digits, hyphens and underscores, in folders.`,
        );
      }
    }
    if (
      (key !== undefined && (typeof key !== "string" || !pathPattern.test(key))) ||
      (said !== undefined && (typeof said !== "string" || !pathPattern.test(said)))
    ) {
      continue;
    }
    if (title !== undefined && (typeof title !== "string" || title.trim() === "")) {
      problems.push(`${file.path}: its title must be text.`);
      continue;
    }
    const resource = (said as string | undefined) ?? file.resource;
    if (resource === undefined) {
      problems.push(
        `${file.path}: is outside every folder that gives a resource its path (${(options.roots ?? []).join(", ")}). Say its path in the file, as path: <path>, or keep it under one of them.`,
      );
      continue;
    }
    const identity = (key as string | undefined) ?? resource;
    // Paths are unique across kinds, in files as in a workspace.
    const other = seen.get(resource);
    if (other) {
      problems.push(`${file.path}: the path ${resource} is already used by ${other}.`);
      continue;
    }
    seen.set(resource, file.path);
    const sameKey = keys.get(identity);
    if (sameKey) {
      problems.push(
        `${file.path}: the key ${identity} is already the key of ${sameKey}. A key belongs to one resource.`,
      );
      continue;
    }
    keys.set(identity, file.path);

    const source = sources.get(file.stem);
    const code = CODE_KINDS.has(file.kind);
    if (code && !source) {
      problems.push(`${file.path}: needs its source beside it, as ${file.stem}.ts.`);
      continue;
    }
    if (code && ("entry" in body || "source" in body)) {
      problems.push(`${file.path}: must not set entry or source. The source is ${file.stem}.ts.`);
      continue;
    }
    const manifest: BundleManifest = {
      kind: file.kind,
      schemaVersion: schemaVersion as number,
      path: resource,
      ...(identity !== resource ? { key: identity } : {}),
      ...(title !== undefined ? { title: title as string } : {}),
      ownership: "ui",
      body: {
        ...(body as Record<string, unknown>),
        ...(code
          ? {
              // Named by the key, so that moving the resource leaves its code as it is.
              entry: entryFor(file.kind, identity),
              source: { language: "typescript", code: (source as ResourceFile).content },
            }
          : {}),
      },
    };
    options.note?.(manifest, file);
    manifests.push(manifest);
  }
  for (const [stem, file] of sources) {
    const kind = stem.split(".").at(-1) as string;
    if (!yaml.has(stem)) problems.push(`${file.path}: has no ${stem}.yaml beside it.`);
    else if (!CODE_KINDS.has(kind)) problems.push(`${file.path}: a ${kind} has no source.`);
  }
  return { manifests, problems };
}

/** Folders that are never a repository's own: nothing in them is a resource. */
const NOT_THE_REPOSITORY = new Set(["node_modules", "dist", "build"]);

/** What a repository says about where its resource files are. All of it is optional. */
export interface RepositoryConfig {
  /**
   * Folders whose inside gives a resource its path: under `src`, the file
   * `src/lending/items.table.yaml` is the table `lending/items`. The folder
   * the console writes to is always one.
   */
  roots: string[];
  /** Folders to leave unread, beside those never read: `node_modules`, `dist`, `build`, and any whose name starts with a dot. */
  ignore: string[];
}

/** The name of the file at a repository's root that says where its resource files are. */
export const REPOSITORY_CONFIG = "vynxlabs.yaml";

/** Reads `vynxlabs.yaml`. A repository without one keeps its resource files in the one folder. */
export function parseRepositoryConfig(text: string | undefined): {
  config: RepositoryConfig;
  problems: string[];
} {
  const config: RepositoryConfig = { roots: [], ignore: [] };
  if (text === undefined) return { config, problems: [] };
  let document: unknown;
  try {
    document = parse(text, { version: "1.2" });
  } catch (error) {
    return {
      config,
      problems: [
        `${REPOSITORY_CONFIG}: is not valid YAML. ${(error as Error).message.split("\n")[0]}`,
      ],
    };
  }
  const problems: string[] = [];
  const { roots, ignore, ...unknown } = (document ?? {}) as { roots?: unknown; ignore?: unknown };
  if (Object.keys(unknown).length > 0) {
    problems.push(
      `${REPOSITORY_CONFIG}: has keys other than roots and ignore: ${Object.keys(unknown).join(", ")}.`,
    );
  }
  for (const [name, value] of [
    ["roots", roots],
    ["ignore", ignore],
  ] as const) {
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.some((one) => typeof one !== "string" || one === "")) {
      problems.push(`${REPOSITORY_CONFIG}: ${name} is a list of folders.`);
      continue;
    }
    config[name] = (value as string[]).map((one) => one.replace(/^\.?\/+|\/+$/g, ""));
  }
  return { config, problems };
}

/** Whether a folder is left unread, by its path from the repository's root. */
export function ignoredFolder(path: string, config: RepositoryConfig): boolean {
  const name = path.split("/").at(-1) ?? "";
  if (name.startsWith(".") || NOT_THE_REPOSITORY.has(name)) return true;
  return config.ignore.some((one) => path === one || path.startsWith(`${one}/`));
}

/**
 * Whether a file could be a resource's, by its name alone: `<name>.<kind>.yaml`
 * for a kind there is, or the `.ts` beside such a file for a kind that has
 * code. So `vite.config.ts` and `orders.test.ts` are nobody's.
 */
export function isResourceFile(path: string, kinds: ReadonlySet<string>): boolean {
  const match = FILE_NAME.exec(path);
  if (!match) return false;
  const [, , kind = "", extension] = match;
  return kinds.has(kind) && (extension === "yaml" || CODE_KINDS.has(kind));
}

/**
 * Reads resource files kept anywhere in a repository. Each file's path from the
 * repository's root is given. A file under a root gets its path from where it
 * is, under the longest root that holds it; a file anywhere may say its `path`.
 *
 * `folder` is where the console writes. A resource whose file is not where the
 * console would have written it is given `source`, so that whoever changes it
 * next writes it back where it was found.
 */
export function parseRepositoryFiles(
  files: readonly ResourceFile[],
  options: { folder: string; roots: readonly string[]; kinds: ReadonlySet<string> },
): ParsedResources & { files: Map<string, string> } {
  const roots = [...new Set([options.folder, ...options.roots])].sort(
    (a, b) => b.length - a.length,
  );
  const problems: string[] = [];
  const yaml = new Map<string, Located>();
  const sources = new Map<string, ResourceFile>();
  const pathPattern = new RegExp(PATH_PATTERN);
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    if (!isResourceFile(file.path, options.kinds)) continue;
    const [, stem = "", kind = "", extension] = FILE_NAME.exec(file.path) as RegExpExecArray;
    const name = `${stem}.${kind}`;
    if (extension === "ts") {
      sources.set(name, file);
      continue;
    }
    const root = roots.find((one) => stem.startsWith(`${one}/`));
    const inside = root === undefined ? undefined : stem.slice(root.length + 1);
    // A folder whose name is no part of a path: the file has to say its path itself.
    const resource = inside !== undefined && pathPattern.test(inside) ? inside : undefined;
    yaml.set(name, { ...file, resource, kind, stem: name });
  }
  const found = new Map<string, string>();
  const parsed = read(yaml, sources, problems, {
    roots,
    note: (manifest, file) => {
      found.set(manifest.key ?? manifest.path, file.path);
      if (file.path !== `${options.folder}/${manifest.path}.${manifest.kind}.yaml`) {
        manifest.source = { file: file.path, generated: false };
      }
    },
  });
  // A source with no resource beside it is only somebody's TypeScript, unless it is where the console writes.
  return {
    manifests: parsed.manifests,
    problems: parsed.problems.filter(
      (problem) =>
        !/: has no .* beside it\.$/.test(problem) || problem.startsWith(`${options.folder}/`),
    ),
    files: found,
  };
}

import {
  type Document,
  isMap,
  isScalar,
  isSeq,
  type Node,
  parse,
  parseDocument,
  stringify,
} from "yaml";
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

/** The kind of a page of documentation. Its file is Markdown, not YAML. */
export const DOC_KIND = "doc";

/**
 * A page of documentation is kept as it is read: one Markdown file,
 * `<path>.md`, under a folder of pages. The file is the page's whole source,
 * frontmatter and all, so what the console saves and what a repository holds
 * are the same bytes. Its path comes from where it is under that folder.
 *
 * The folders of pages are the ones a repository names under `docs:` in its
 * configuration. When it names none, there is one: `docs` inside the folder
 * the console writes to.
 */
export function docsRoots(config: Pick<RepositoryConfig, "docs"> | undefined, folder: string) {
  return config?.docs && config.docs.length > 0 ? config.docs : [`${folder}/docs`];
}

/** The page a Markdown file is, by where it is under a folder of pages. None when it is under none. */
function docStem(file: string, docs: readonly string[]): string | undefined {
  if (!file.endsWith(".md")) return undefined;
  const root = [...docs]
    .sort((a, b) => b.length - a.length)
    .find((one) => file.startsWith(`${one}/`));
  return root === undefined ? undefined : file.slice(root.length + 1, -".md".length);
}

const FENCE = /^---[ \t]*$/;

/** What the top of a page says of its own identity and title, when it can be read. */
function docNames(source: string): { key?: unknown; title?: unknown } {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  if (!FENCE.test(lines[0] ?? "")) return {};
  const close = lines.findIndex((line, index) => index > 0 && FENCE.test(line));
  if (close === -1) return {};
  try {
    const read = parse(lines.slice(1, close).join("\n"), { version: "1.2" });
    return read !== null && typeof read === "object" && !Array.isArray(read)
      ? (read as { key?: unknown; title?: unknown })
      : {};
  } catch {
    // What is wrong with it is said when the page itself is checked.
    return {};
  }
}

/** A page's file read into its manifest. Its body is the file. */
function docManifest(path: string, source: string): BundleManifest {
  const { key, title } = docNames(source);
  const identity = typeof key === "string" && new RegExp(PATH_PATTERN).test(key) ? key : path;
  return {
    kind: DOC_KIND,
    schemaVersion: 1,
    path,
    ...(identity !== path ? { key: identity } : {}),
    ...(typeof title === "string" && title.trim() !== "" ? { title: title.trim() } : {}),
    ownership: "ui",
    body: { source },
  };
}

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

/** One resource's files: its YAML at `file`, and its source beside it when it has code. */
function renderOne(
  manifest: BundleManifest,
  kinds: readonly KindDefinition[],
  file: string,
  /** Whether the file has to say the path, because where it is kept does not. */
  saysPath: boolean,
): ResourceFile[] {
  // A page is its own file: nothing is put around it and nothing in it is reordered.
  if (manifest.kind === DOC_KIND) {
    return [{ path: file, content: String((manifest.body as { source?: unknown }).source ?? "") }];
  }
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
  const files: ResourceFile[] = [
    {
      path: file,
      content: stringify(
        {
          // Said only when they say something: a file without them is written as it always was.
          ...(manifest.key !== undefined && manifest.key !== manifest.path
            ? { key: manifest.key }
            : {}),
          ...(saysPath ? { path: manifest.path } : {}),
          ...(manifest.title !== undefined ? { title: manifest.title } : {}),
          schemaVersion: manifest.schemaVersion,
          body: ordered(body, schema),
        },
        YAML_OPTIONS,
      ),
    },
  ];
  if (CODE_KINDS.has(manifest.kind) && source) {
    const code = source.code.replace(/\r\n?/g, "\n");
    files.push({
      path: file.replace(/\.yaml$/, ".ts"),
      content: code.endsWith("\n") ? code : `${code}\n`,
    });
  }
  return files;
}

const byPath = (a: ResourceFile, b: ResourceFile) =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : 0;

/**
 * Writes manifests as files. `kinds` gives each kind's schema, which fixes the
 * order of keys. Files come back sorted by path.
 */
export function renderResourceFiles(
  manifests: readonly BundleManifest[],
  kinds: readonly KindDefinition[],
): ResourceFile[] {
  return (
    manifests
      // The platform's own nodes are added again on every compose. They are not the repository's.
      .filter((manifest) => !manifest.path.startsWith("core/"))
      .flatMap((manifest) =>
        renderOne(
          manifest,
          kinds,
          manifest.kind === DOC_KIND
            ? `docs/${manifest.path}.md`
            : `${manifest.path}.${manifest.kind}.yaml`,
          false,
        ),
      )
      .sort(byPath)
  );
}

/**
 * The path a file's place gives its resource: what is left of its name under
 * the longest root that holds it. None when it is under no root, or when what
 * is left is not written as a path is.
 */
function pathFromPlace(stem: string, roots: readonly string[]): string | undefined {
  const root = [...roots]
    .sort((a, b) => b.length - a.length)
    .find((one) => stem.startsWith(`${one}/`));
  const inside = root === undefined ? undefined : stem.slice(root.length + 1);
  return inside !== undefined && new RegExp(PATH_PATTERN).test(inside) ? inside : undefined;
}

/**
 * Where a resource's YAML file is kept in a repository, from the repository's
 * root: where it was found, or in the folder the console writes to.
 */
export function fileOf(manifest: BundleManifest, folder: string): string {
  const found = manifest.source && !manifest.source.generated ? manifest.source.file : undefined;
  if (manifest.kind === DOC_KIND) {
    return found?.endsWith(".md") ? found : `${folder}/docs/${manifest.path}.md`;
  }
  return found?.endsWith(`.${manifest.kind}.yaml`)
    ? found
    : `${folder}/${manifest.path}.${manifest.kind}.yaml`;
}

/**
 * Where a file goes when its resource is renamed. A file named for the path
 * moves with it, in the folder it was in; one that says its path stays where
 * it is, and says the new one.
 */
export function movedFile(file: string, kind: string, from: string, to: string): string {
  if (kind === DOC_KIND) {
    // A page has no way to say its path, so its file always moves with it.
    const page = `/${from}.md`;
    return file.endsWith(page) ? `${file.slice(0, -page.length)}/${to}.md` : file;
  }
  const named = `/${from}.${kind}.yaml`;
  return file.endsWith(named) ? `${file.slice(0, -named.length)}/${to}.${kind}.yaml` : file;
}

/**
 * Whether two versions of a resource's file say the same thing, however each
 * is written: comments, the order of keys and the quoting are the author's.
 */
export function sameResourceFile(path: string, a: string, b: string): boolean {
  if (a === b) return true;
  // A page is its text: the same but for how its lines end is the same.
  if (path.endsWith(".md")) return a.replace(/\r\n?/g, "\n") === b.replace(/\r\n?/g, "\n");
  if (!path.endsWith(".yaml")) return false;
  const sorted = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(sorted)
      : value !== null && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, sorted((value as Record<string, unknown>)[key])]),
          )
        : value;
  try {
    const [one, other] = [a, b].map((text) =>
      JSON.stringify(sorted(parse(text, { version: "1.2" }))),
    );
    return one === other;
  } catch {
    return false;
  }
}

/**
 * Writes what `next` says into the file as its author wrote it: the comments, the
 * order of keys, the quoting and the blank lines of `written` stay wherever what
 * they sit beside is still there, and only what is said differently is changed.
 * A key that is new goes where `next` has it among the keys already there.
 *
 * The result is read back before it is given. If it does not say exactly what
 * `next` says, or `written` cannot be read, `next` is given as it is: a file in
 * the console's own form is always right, and keeping a comment is never worth
 * a file that says something else.
 */
export function ontoWritten(written: string, next: string): string {
  if (written === next) return next;
  try {
    const document = parseDocument(written, { version: "1.2" });
    const value = parse(next, { version: "1.2" });
    if (document.errors.length > 0 || !isMap(document.contents)) return next;
    document.contents = lay(document, document.contents, value, true) as typeof document.contents;
    // `[a, b]` or `[ a, b ]`: written back with the spacing the author used.
    const result = document.toString({
      ...YAML_OPTIONS,
      flowCollectionPadding: /[[{] \S/.test(written),
    });
    return sameResourceFile("it.yaml", result, next) ? result : next;
  } catch {
    return next;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

type Commented = { commentBefore?: string | null; spaceBefore?: boolean };
const commentOf = (key: unknown): Commented | undefined =>
  key !== null && typeof key === "object" ? (key as Commented) : undefined;

/**
 * Makes a node say `value`, changing as little of it as that takes.
 *
 * A comment above the first key of a file is the file's heading, and is kept on
 * whatever key comes first. Inside, a comment above a map's first key is about
 * that key: it leaves with the key, and stays with it when another goes before.
 */
function lay(document: Document, node: unknown, value: unknown, top = false): Node {
  if (isMap(node) && isRecord(value)) {
    const wanted = Object.keys(value);
    const nameOf = (pair: { key: unknown }) =>
      String(isScalar(pair.key) ? pair.key.value : pair.key);
    const first = node.items[0];
    node.items = node.items.filter((pair) => wanted.includes(nameOf(pair)));
    if (first && node.items[0] !== first) {
      const heading = commentOf(first.key)?.commentBefore;
      const next = commentOf(node.items[0]?.key);
      if (top && heading && next && !next.commentBefore) next.commentBefore = heading;
      if (!top) node.commentBefore = null;
    }
    for (const pair of node.items) pair.value = lay(document, pair.value, value[nameOf(pair)]);
    for (const [index, name] of wanted.entries()) {
      if (node.items.some((pair) => nameOf(pair) === name)) continue;
      // Before the first key already there that comes after it in what is to be said.
      const later = new Set(wanted.slice(index + 1));
      const at = node.items.findIndex((pair) => later.has(nameOf(pair)));
      const pair = document.createPair(name, value[name]);
      if (at === 0) {
        const was = commentOf(node.items[0]?.key);
        const now = commentOf(pair.key);
        if (top && was?.commentBefore && now) {
          now.commentBefore = was.commentBefore;
          was.commentBefore = null;
        } else if (!top && node.commentBefore && was) {
          was.commentBefore = node.commentBefore;
          node.commentBefore = null;
        }
      }
      node.items.splice(at === -1 ? node.items.length : at, 0, pair as (typeof node.items)[0]);
    }
    return node;
  }
  if (isSeq(node) && Array.isArray(value)) {
    node.items = value.map((item, index) =>
      index < node.items.length
        ? lay(document, node.items[index], item)
        : document.createNode(item),
    );
    return node;
  }
  if (isScalar(node) && (value === null || typeof value !== "object")) {
    if (node.value === value) return node;
    if (typeof node.value === typeof value && value !== null) {
      node.value = value;
      return node;
    }
  }
  // Another shape altogether: written afresh, under the comment the old one had.
  const fresh = document.createNode(value) as Node;
  const old = node as Partial<Pick<Node, "comment" | "commentBefore">> | null | undefined;
  if (old?.commentBefore) fresh.commentBefore = old.commentBefore;
  if (old?.comment) fresh.comment = old.comment;
  return fresh;
}

/**
 * Writes manifests as the files a repository keeps, each where it was found,
 * and in `folder` when it was made in the console. Paths are from the
 * repository's root. A file says its `path` only when its place does not.
 */
export function renderRepositoryFiles(
  manifests: readonly BundleManifest[],
  kinds: readonly KindDefinition[],
  options: { folder: string; roots: readonly string[] },
): ResourceFile[] {
  const roots = [...new Set([options.folder, ...options.roots])];
  return manifests
    .filter((manifest) => !manifest.path.startsWith("core/"))
    .flatMap((manifest) => {
      const file = fileOf(manifest, options.folder);
      if (manifest.kind === DOC_KIND) return renderOne(manifest, kinds, file, false);
      const stem = file.slice(0, -`.${manifest.kind}.yaml`.length);
      return renderOne(manifest, kinds, file, pathFromPlace(stem, roots) !== manifest.path);
    })
    .sort(byPath);
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

  // By file, as YAML files are kept: a file given twice is one file, and the later one is it.
  const pages = new Map<string, Page>();
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const page = docStem(file.path, ["docs"]);
    if (page !== undefined) {
      pages.set(file.path, { file, path: page });
      continue;
    }
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
  return read(yaml, sources, problems, { pages: [...pages.values()] });
}

/** A page's file, and the path its place gives it. */
interface Page {
  file: ResourceFile;
  path: string;
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
    /** Pages of documentation, read after everything else and held to the same rules of path and key. */
    pages?: readonly Page[];
    notePage?: (manifest: BundleManifest, file: ResourceFile) => void;
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
  for (const { file, path } of options.pages ?? []) {
    if (!pathPattern.test(path)) {
      problems.push(
        `${file.path}: a page's name and its folders are written in lowercase letters, digits, hyphens and underscores. Rename the file: nothing renames it for you.`,
      );
      continue;
    }
    const manifest = docManifest(path, file.content);
    const other = seen.get(path);
    if (other) {
      problems.push(`${file.path}: the path ${path} is already used by ${other}.`);
      continue;
    }
    seen.set(path, file.path);
    const identity = manifest.key ?? path;
    const sameKey = keys.get(identity);
    if (sameKey) {
      problems.push(
        `${file.path}: the key ${identity} is already the key of ${sameKey}. A key belongs to one resource.`,
      );
      continue;
    }
    keys.set(identity, file.path);
    options.notePage?.(manifest, file);
    manifests.push(manifest);
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
  /**
   * Folders of pages of documentation: under `handbook`, the file
   * `handbook/support/refunds.md` is the page `support/refunds`. When none is
   * named, the one folder of pages is `docs` inside the folder the console writes to.
   */
  docs: string[];
}

/** The name of the file at a repository's root that says where its resource files are. */
export const REPOSITORY_CONFIG = "volvel.yaml";

/** Reads `volvel.yaml`. A repository without one keeps its resource files in the one folder. */
export function parseRepositoryConfig(text: string | undefined): {
  config: RepositoryConfig;
  problems: string[];
} {
  const config: RepositoryConfig = { roots: [], ignore: [], docs: [] };
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
  const { roots, ignore, docs, ...unknown } = (document ?? {}) as {
    roots?: unknown;
    ignore?: unknown;
    docs?: unknown;
  };
  if (Object.keys(unknown).length > 0) {
    problems.push(
      `${REPOSITORY_CONFIG}: has keys other than roots, ignore and docs: ${Object.keys(unknown).join(", ")}.`,
    );
  }
  for (const [name, value] of [
    ["roots", roots],
    ["ignore", ignore],
    ["docs", docs],
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
export function isResourceFile(
  path: string,
  kinds: ReadonlySet<string>,
  /** The folders of pages. A Markdown file under one is a page; anywhere else it is nobody's. */
  docs: readonly string[] = [],
): boolean {
  if (docStem(path, docs) !== undefined) return true;
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
  options: {
    folder: string;
    roots: readonly string[];
    kinds: ReadonlySet<string>;
    /** The folders of pages, as `docsRoots` gives them. Left out, the one inside `folder`. */
    docs?: readonly string[];
  },
): ParsedResources & { files: Map<string, string> } {
  const docs = options.docs ?? docsRoots(undefined, options.folder);
  // By file, as YAML files are kept: a file given twice is one file, and the later one is it.
  const pages = new Map<string, Page>();
  const roots = [...new Set([options.folder, ...options.roots])].sort(
    (a, b) => b.length - a.length,
  );
  const problems: string[] = [];
  const yaml = new Map<string, Located>();
  const sources = new Map<string, ResourceFile>();
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const page = docStem(file.path, docs);
    if (page !== undefined) {
      if (options.kinds.has(DOC_KIND)) pages.set(file.path, { file, path: page });
      continue;
    }
    if (!isResourceFile(file.path, options.kinds)) continue;
    const [, stem = "", kind = "", extension] = FILE_NAME.exec(file.path) as RegExpExecArray;
    const name = `${stem}.${kind}`;
    if (extension === "ts") {
      sources.set(name, file);
      continue;
    }
    // A folder whose name is no part of a path: the file has to say its path itself.
    const resource = pathFromPlace(stem, roots);
    yaml.set(name, { ...file, resource, kind, stem: name });
  }
  const found = new Map<string, string>();
  const parsed = read(yaml, sources, problems, {
    roots,
    pages: [...pages.values()],
    notePage: (manifest, file) => {
      found.set(manifest.key ?? manifest.path, file.path);
      // Kept where the console would not have written it: it is the repository's to change.
      if (file.path !== `${options.folder}/docs/${manifest.path}.md`) {
        manifest.source = { file: file.path, generated: false };
      }
    },
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

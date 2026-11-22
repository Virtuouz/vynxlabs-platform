import { type BundleManifest, keyOf } from "./bundle.js";

/**
 * The fields of a body that name another resource, by what they are called.
 * A script's `uses` lists are named apart, since each is a list under `uses`.
 */
const NAMING = new Set([
  "script",
  "flow",
  "flows",
  "event",
  "source",
  "connector",
  "interface",
  "table",
  "references",
  "resource",
  "notify",
  "reads",
]);
const USES = new Set([
  "connections",
  "connectionGroups",
  "variables",
  "events",
  "tables",
  "sources",
]);

/**
 * Lets a reference written as text name a resource by its key as well as by
 * its path. After a resource moves, what refers to it by the path it had, which
 * is its key, keeps building: the reference is rewritten to the path it has now.
 *
 * A path always wins. Only a text that is no resource's path, and is the key of
 * one whose path is another, is rewritten. References made by handing over the
 * definition itself never need this: they carry the path already.
 *
 * Returns the manifests to build with, and a line for each reference it rewrote,
 * so that whoever builds can move it to the path at leisure.
 */
export function resolveKeyReferences(manifests: readonly BundleManifest[]): {
  manifests: BundleManifest[];
  rewritten: string[];
} {
  const paths = new Set(manifests.map((manifest) => manifest.path));
  const moved = new Map<string, string>();
  for (const manifest of manifests) {
    const key = keyOf(manifest);
    if (key !== manifest.path && !paths.has(key)) moved.set(key, manifest.path);
  }
  if (moved.size === 0) return { manifests: [...manifests], rewritten: [] };

  const rewritten: string[] = [];
  const swap = (owner: BundleManifest, where: string, value: unknown): unknown => {
    if (typeof value !== "string") return value;
    const now = moved.get(value);
    if (now === undefined) return value;
    rewritten.push(
      `${owner.path} (${owner.kind}): ${where} names "${value}" by its key. It is at "${now}" now.`,
    );
    return now;
  };
  /** `naming` says the value at `where` is a reference, or a list of them. */
  const walk = (owner: BundleManifest, where: string, value: unknown, naming: boolean): unknown => {
    if (typeof value === "string") return naming ? swap(owner, where, value) : value;
    if (Array.isArray(value)) {
      return value.map((item, index) =>
        walk(owner, `${where}/${index}`, item, naming && typeof item === "string"),
      );
    }
    if (value === null || typeof value !== "object") return value;
    const inUses = where.endsWith("/uses");
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([name, field]) => {
        // An action's target says its kind and its path: `{ kind, path }`.
        const target = name === "path" && where.endsWith("/target");
        const names = target || (inUses ? USES.has(name) : NAMING.has(name));
        return [name, walk(owner, `${where}/${name}`, field, names)];
      }),
    );
  };
  return {
    manifests: manifests.map((manifest) => ({
      ...manifest,
      body: walk(manifest, "/body", manifest.body, false) as Record<string, unknown>,
    })),
    rewritten,
  };
}

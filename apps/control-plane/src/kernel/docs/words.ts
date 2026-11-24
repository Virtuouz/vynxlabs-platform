import { statSync } from "node:fs";
import { join } from "node:path";
import { type DocSet, urlOf } from "@volvel/docs-engine";
import type { SiteView } from "@volvel/docs-site";
import { type FieldInfo, type Node, TERM_RESOURCES, type TermInfo, walk } from "@volvel/markup";
import type { Config } from "../../config.js";
import type { Db } from "../audit.js";
import { DESCRIBED } from "./describe.js";
import { helpFile } from "./help-files.js";
import { consoleDirectory } from "./product.js";

/** What the product's own help says of its words and its kinds' fields: public, as `/docs` is. */
export interface ProductWords {
  terms: Record<string, { short?: string; path?: string }>;
  fields: Record<string, string>;
}

const read = new Map<string, { stamp: string; words: ProductWords | undefined }>();

/**
 * The product's terms and the kinds' fields, from the help the console carries, read again when
 * the build changes. An instance with no console, or a help built before these were kept, has none
 * of them, and a page then draws its words as they are.
 */
export function productWords(config: Pick<Config, "consoleDir">): ProductWords | undefined {
  const folder = consoleDirectory(config);
  if (!folder) return undefined;
  let stamp: string;
  try {
    const info = statSync(join(folder, "help", "manifest.json"));
    stamp = `${info.mtimeMs}:${info.size}`;
  } catch {
    return undefined;
  }
  const had = read.get(folder);
  if (had?.stamp === stamp) return had.words;
  let words: ProductWords | undefined;
  try {
    const manifest = JSON.parse(helpFile(folder, "manifest.json")?.body.toString("utf8") ?? "{}");
    const fields = helpFile(folder, "fields.json")?.body.toString("utf8");
    words = {
      terms: manifest.terms ?? {},
      fields: fields ? JSON.parse(fields) : {},
    };
  } catch {
    words = undefined;
  }
  read.set(folder, { stamp, words });
  return words;
}

/** The key a term that names a resource is looked up by. */
const keyOf = (props: Record<string, string>) => {
  const kind = TERM_RESOURCES.find((one) => props[one] !== undefined);
  return kind ? `${kind}:${props[kind]}:${props.column ?? ""}` : undefined;
};

/** The resources a page's terms name, each once, by the key a term is looked up by. */
function resourceTerms(trees: Iterable<Node>) {
  const found = new Map<string, { kind: string; path: string; column: string | undefined }>();
  for (const tree of trees) {
    for (const { node } of walk(tree)) {
      if (node.type !== "component" || node.name !== "term" || node.props.id !== undefined)
        continue;
      const key = keyOf(node.props);
      const kind = TERM_RESOURCES.find((one) => node.props[one] !== undefined);
      if (key && kind) {
        found.set(key, { kind, path: node.props[kind] as string, column: node.props.column });
      }
    }
  }
  return found;
}

export interface WordsAt {
  config: Pick<Config, "consoleDir" | "publicUrl">;
  db: Db;
  workspaceId: string;
  set: DocSet;
  /** The pages about to be drawn, by their paths in the set. */
  pages: readonly string[];
  /** Whether the reader may know what a resource of a kind is for: `describer`'s answer. */
  mayKnow: (kind: string, resourceId: string) => Promise<boolean>;
}

/**
 * What a served page's words resolve to, for the pages about to be drawn. A term of the product's
 * own and a field of a kind come from the product's help, which is public. A term that names a
 * resource is looked up only for a reader who may use the resource, by the same rule the terms
 * route holds: to anyone else, a resource that is not described, one that does not exist and one
 * they may not read all draw the word alone, so that nothing tells them apart.
 */
export async function wordsFor(at: WordsAt): Promise<{
  term: (props: Record<string, string>) => TermInfo | null;
  field: (path: string) => FieldInfo | null;
}> {
  const product = productWords(at.config);
  const trees = at.pages.flatMap((path) => {
    const entry = at.set.pages.get(path);
    return entry ? [entry.tree] : [];
  });
  const wanted = resourceTerms(trees);
  const told = new Map<string, string>();
  if (wanted.size > 0) {
    const kinds = [...new Set([...wanted.values()].map((one) => one.kind))].filter(
      (kind) => DESCRIBED[kind],
    );
    const rows = await at.db
      .selectFrom("resource")
      .select(["id", "kind", "path", "body"])
      .where("workspace_id", "=", at.workspaceId)
      .where("kind", "in", kinds)
      .where(
        "path",
        "in",
        [...wanted.values()].map((one) => one.path),
      )
      .execute();
    const allowed = new Map<string, Promise<boolean>>();
    for (const [key, one] of wanted) {
      const row = rows.find((found) => found.kind === one.kind && found.path === one.path);
      if (!row) continue;
      const body = row.body as {
        description?: unknown;
        columns?: Record<string, { description?: unknown }>;
      };
      const said = one.column
        ? row.kind === "table"
          ? body.columns?.[one.column]?.description
          : undefined
        : body.description;
      if (typeof said !== "string" || said === "") continue;
      let may = allowed.get(row.id);
      if (!may) {
        may = at.mayKnow(row.kind, row.id);
        allowed.set(row.id, may);
      }
      if (await may) told.set(key, said);
    }
  }
  return {
    term: (props) => {
      if (props.id !== undefined) {
        const theirs = product?.terms[props.id];
        if (!theirs?.short) return null;
        return {
          short: theirs.short,
          ...(theirs.path ? { href: `${at.config.publicUrl}/docs/${urlOf(theirs.path)}` } : {}),
        };
      }
      const key = keyOf(props);
      const short = key ? told.get(key) : undefined;
      return short ? { short } : null;
    },
    field: (path) => {
      const description = product?.fields[path];
      return description ? { description } : null;
    },
  };
}

/** The site as drawn, told what its words mean. */
export function withWords(view: SiteView, words: Awaited<ReturnType<typeof wordsFor>>): SiteView {
  return {
    ...view,
    resolve: { ...view.resolve, term: (props) => words.term(props), field: words.field },
  };
}

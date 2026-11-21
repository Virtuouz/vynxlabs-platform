import type { DocEntry } from "./page.js";
import { type DocSet, resourceKey, type Term } from "./set.js";

/**
 * The help one reader can see: the product's own set first, then each of the
 * tenant's sets the reader may open. Which sets those are is decided by
 * whoever builds the stack, from what the reader is allowed. Nothing here
 * knows about permissions.
 *
 * The product's set is never replaced. A tenant's set adds terms and topics of
 * its own, attaches pages to resources, and adds notes to the product's topics.
 */
export interface Layer {
  /** A name for where the set is from: `product`, or a docs app's path. */
  id: string;
  set: DocSet;
}

export type Stack = readonly Layer[];

export interface Found {
  layer: string;
  page: DocEntry;
}

function pageOf(layer: Layer, path: string | undefined): Found | undefined {
  const page = path === undefined ? undefined : layer.set.pages.get(path);
  return page ? { layer: layer.id, page } : undefined;
}

/** The page that has a topic. The first layer that has it wins, and the product's is first. */
export function findTopic(stack: Stack, topic: string): Found | undefined {
  for (const layer of stack) {
    const found = pageOf(layer, layer.set.topics[topic]);
    if (found) return found;
  }
  return undefined;
}

/** A term, and the layer it is from. */
export function findTerm(stack: Stack, id: string): (Term & { layer: string }) | undefined {
  for (const layer of stack) {
    const term = layer.set.terms[id];
    if (term) return { ...term, layer: layer.id };
  }
  return undefined;
}

/** Every term a reader can see, the product's first. A later layer never hides an earlier one's. */
export function allTerms(stack: Stack): (Term & { layer: string })[] {
  const seen = new Set<string>();
  const out: (Term & { layer: string })[] = [];
  for (const layer of stack) {
    for (const term of Object.values(layer.set.terms)) {
      if (seen.has(term.id)) continue;
      seen.add(term.id);
      out.push({ ...term, layer: layer.id });
    }
  }
  return out;
}

/** The tenant's pages that add notes to one of the product's topics: "From your team". */
export function extensionsOf(stack: Stack, topic: string): Found[] {
  // The first layer is the product's, and does not extend itself.
  return stack
    .slice(1)
    .flatMap((layer) => (layer.set.extensions[topic] ?? []).map((path) => pageOf(layer, path)))
    .filter((found): found is Found => found !== undefined);
}

/** The pages that say they document a resource. */
export function attachedTo(stack: Stack, kind: string, path: string): Found[] {
  const key = resourceKey(kind, path);
  return stack
    .flatMap((layer) => (layer.set.attachments[key] ?? []).map((one) => pageOf(layer, one)))
    .filter((found): found is Found => found !== undefined);
}

/**
 * What two of a tenant's sets both define, which a workspace may not have:
 * terms and topics are the workspace's, not one docs app's.
 */
export function clashes(
  layers: readonly Layer[],
): { kind: "term" | "topic"; id: string; layers: [string, string] }[] {
  const out: { kind: "term" | "topic"; id: string; layers: [string, string] }[] = [];
  for (const kind of ["term", "topic"] as const) {
    const owner = new Map<string, string>();
    for (const layer of layers) {
      for (const id of Object.keys(kind === "term" ? layer.set.terms : layer.set.topics)) {
        const first = owner.get(id);
        if (first !== undefined && first !== layer.id)
          out.push({ kind, id, layers: [first, layer.id] });
        else owner.set(id, layer.id);
      }
    }
  }
  return out;
}

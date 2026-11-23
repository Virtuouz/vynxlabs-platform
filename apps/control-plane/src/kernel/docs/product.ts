import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp, type DocsApp, type ResourceLike } from "@volvel/docs-engine";
import type { Config } from "../../config.js";

/** Where the console's built files are: where the image put them, or beside this code in a checkout. */
export function consoleDirectory(config: Pick<Config, "consoleDir">): string | undefined {
  if (config.consoleDir) return config.consoleDir;
  const inRepo = fileURLToPath(new URL("../../../../console/dist", import.meta.url));
  return existsSync(inRepo) ? inRepo : undefined;
}

export interface ProductNames {
  terms: string[];
  topics: string[];
}

const read = new Map<string, ProductNames | undefined>();

/**
 * The terms and topics of the product's own help, which a tenant's pages may
 * use and add notes to and may not take the names of. They are read from the
 * help the console carries, so they are those of the version that is running.
 * An instance with no console has none, and holds no tenant to them.
 */
export function productNames(config: Pick<Config, "consoleDir">): ProductNames | undefined {
  const folder = consoleDirectory(config);
  if (!folder) return undefined;
  if (!read.has(folder)) {
    let names: ProductNames | undefined;
    try {
      const manifest = JSON.parse(readFileSync(join(folder, "help/manifest.json"), "utf8")) as {
        terms?: Record<string, unknown>;
        topics?: Record<string, unknown>;
      };
      names = {
        terms: Object.keys(manifest.terms ?? {}),
        topics: Object.keys(manifest.topics ?? {}),
      };
    } catch {
      names = undefined;
    }
    read.set(folder, names);
  }
  return read.get(folder);
}

/** The issues that mean a page took a name the product's own help has. */
export const PRODUCT_CLASHES = ["term_reserved", "topic_reserved"];

/**
 * A docs app built from a workspace's resources, held to the names the product keeps for its
 * own help, as a deploy holds it. Every place that builds a workspace's docs for someone to see
 * (a draft preview, search, the terms route) builds them here, so that none shows as fine what
 * a deploy would refuse.
 */
export function buildDocs(
  config: Pick<Config, "consoleDir">,
  app: DocsApp,
  resources: readonly ResourceLike[],
) {
  return buildApp(app, resources, { product: productNames(config) });
}

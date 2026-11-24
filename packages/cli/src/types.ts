import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ENV_TYPES_FILE, envDeclarations, type TypedManifest } from "@volvel/manifest";

/**
 * Writes `.platform/volvel-env.d.ts`: the names of the repository's tables, events,
 * variables and connections, as declarations that add to `@volvel/sdk`, so that scripts
 * are typed by them. Returns whether the file changed, so a watcher need not touch an
 * unchanged file and wake the editor's language service for nothing.
 */
export async function writeEnvTypes(
  directory: string,
  manifests: readonly TypedManifest[],
): Promise<boolean> {
  const file = join(directory, ENV_TYPES_FILE);
  const text = envDeclarations(manifests);
  if ((await readFile(file, "utf8").catch(() => null)) === text) return false;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
  return true;
}

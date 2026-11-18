import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileSchemas } from "@vynxlabs/manifest";

/** Where the schemas are written, from the repository's root. Ignored by git, as `.platform/` is. */
export const SCHEMA_FOLDER = ".platform/schemas";

export interface SchemasWritten {
  /** How many kinds have a schema. */
  kinds: number;
  /** Which schema checks which files, as the YAML extension of VS Code reads it. */
  mapping: Record<string, string[]>;
  /**
   * What became of `.vscode/settings.json`: written, already right, or left alone
   * because it could not be read as JSON (comments make it so) and is the developer's.
   */
  settings: "written" | "unchanged" | "manual";
}

/**
 * Writes the schema of each kind's file into the repository, and tells the
 * editor which files each checks: `<name>.<kind>.yaml` then completes and is
 * checked as it is typed. The schemas come with this CLI, so they describe the
 * files this CLI builds.
 */
export async function writeEditorSchemas(directory: string): Promise<SchemasWritten> {
  const folder = join(directory, SCHEMA_FOLDER);
  await mkdir(folder, { recursive: true });
  const mapping: Record<string, string[]> = {};
  const schemas = fileSchemas();
  for (const { kind, schema } of schemas) {
    await writeFile(join(folder, `${kind}.schema.json`), `${JSON.stringify(schema, null, 2)}\n`);
    mapping[`./${SCHEMA_FOLDER}/${kind}.schema.json`] = [`**/*.${kind}.yaml`];
  }

  const file = join(directory, ".vscode", "settings.json");
  const text = await readFile(file, "utf8").catch(() => null);
  let settings: Record<string, unknown> = {};
  if (text !== null && text.trim() !== "") {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error();
      settings = parsed;
    } catch {
      return { kinds: schemas.length, mapping, settings: "manual" };
    }
  }
  const before =
    typeof settings["yaml.schemas"] === "object" && settings["yaml.schemas"] !== null
      ? (settings["yaml.schemas"] as Record<string, unknown>)
      : {};
  const after = { ...before, ...mapping };
  if (JSON.stringify(before) === JSON.stringify(after)) {
    return { kinds: schemas.length, mapping, settings: "unchanged" };
  }
  await mkdir(join(directory, ".vscode"), { recursive: true });
  await writeFile(file, `${JSON.stringify({ ...settings, "yaml.schemas": after }, null, 2)}\n`);
  return { kinds: schemas.length, mapping, settings: "written" };
}

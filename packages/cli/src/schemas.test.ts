import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { run } from "./cli.js";
import { writeEditorSchemas } from "./schemas.js";

const made: string[] = [];
const repository = () => {
  const directory = mkdtempSync(join(tmpdir(), "vx-schemas-test-"));
  made.push(directory);
  return directory;
};
afterAll(() => {
  for (const directory of made) rmSync(directory, { recursive: true, force: true });
});
const json = (file: string) => JSON.parse(readFileSync(file, "utf8"));

test("each kind's file gets a schema, and the editor is told which files it checks", async () => {
  const directory = repository();
  const written = await writeEditorSchemas(directory);
  expect(written.settings).toBe("written");
  const variable = json(join(directory, ".platform/schemas/variable.schema.json"));
  expect(Object.keys(variable.properties)).toEqual([
    "key",
    "path",
    "title",
    "schemaVersion",
    "body",
  ]);
  // A tenant's access has a key and no path: where its file is says nothing about it.
  const group = json(join(directory, ".platform/schemas/group.schema.json"));
  expect(Object.keys(group.properties)).toEqual(["key", "title", "schemaVersion", "body"]);
  const settings = json(join(directory, ".vscode/settings.json"));
  expect(settings["yaml.schemas"]["./.platform/schemas/variable.schema.json"]).toEqual([
    "**/*.variable.yaml",
  ]);
  expect(Object.keys(settings["yaml.schemas"])).toHaveLength(written.kinds);
  expect(written.kinds).toBeGreaterThan(15);

  expect((await writeEditorSchemas(directory)).settings).toBe("unchanged");
});

test("the developer's own settings are kept, and ones it cannot read are left alone", async () => {
  const directory = repository();
  mkdirSync(join(directory, ".vscode"));
  const file = join(directory, ".vscode/settings.json");
  writeFileSync(
    file,
    JSON.stringify({
      "editor.tabSize": 2,
      "yaml.schemas": { "https://example.com/compose.json": ["compose.yaml"] },
    }),
  );
  expect((await writeEditorSchemas(directory)).settings).toBe("written");
  const settings = json(file);
  expect(settings["editor.tabSize"]).toBe(2);
  expect(settings["yaml.schemas"]["https://example.com/compose.json"]).toEqual(["compose.yaml"]);
  expect(settings["yaml.schemas"]["./.platform/schemas/flow.schema.json"]).toEqual([
    "**/*.flow.yaml",
  ]);

  // Comments make it something a JSON reader cannot read back. It is theirs: say what to add.
  const commented = '{\n  // mine\n  "editor.tabSize": 2\n}\n';
  writeFileSync(file, commented);
  const out: string[] = [];
  const code = await run(["schemas", "--dir", directory], {
    out: (line) => out.push(line),
    err: (line) => out.push(line),
    env: {},
  });
  expect(code).toBe(0);
  expect(readFileSync(file, "utf8")).toBe(commented);
  expect(out.join("\n")).toContain("Add this to it:");
  expect(out.join("\n")).toContain('"./.platform/schemas/script.schema.json"');
});

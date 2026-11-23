import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const pack = JSON.parse(readFileSync(join(HERE, "..", "package.json"), "utf8")) as {
  exports: Record<string, string>;
};

test("the package gives what a reader of the docs needs: the fields, the pictures and the API's description (DOC-MP4)", () => {
  // What the console reads beside the manifest, and what a site that serves the docs copies.
  expect(pack.exports["./fields.json"]).toBe("./dist/fields.json");
  expect(pack.exports["./assets/*"]).toBe("./dist/assets/*");
  expect(pack.exports["./openapi.json"]).toBe("./generated/openapi.json");
  // The built ones are where the export says, and are found by the package's own name.
  const found = createRequire(import.meta.url).resolve("@volvel/docs/fields.json");
  expect(found).toBe(join(HERE, "..", "dist", "fields.json"));
  expect(existsSync(found)).toBe(true);
  expect(typeof JSON.parse(readFileSync(found, "utf8"))).toBe("object");
});

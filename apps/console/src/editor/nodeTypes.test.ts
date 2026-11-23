import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test } from "vitest";
import { NODE_TYPES } from "./nodeTypes.ts";

const tsc = fileURLToPath(new URL("../../../../node_modules/.bin/tsc", import.meta.url));

/** The editor's compiler options and declarations over one file: what the editor would underline. */
async function problems(code: string, declarations: string) {
  const dir = await mkdtemp(join(tmpdir(), "editor-"));
  try {
    await writeFile(join(dir, "script.ts"), code);
    await writeFile(join(dir, "node.d.ts"), declarations);
    await writeFile(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ESNext",
          module: "ESNext",
          moduleResolution: "bundler",
          strict: true,
          noEmit: true,
          allowSyntheticDefaultImports: true,
          lib: ["es2023", "webworker"],
          types: [],
        },
        files: ["script.ts", "node.d.ts"],
      }),
    );
    try {
      await promisify(execFile)(tsc, ["-p", dir]);
      return "";
    } catch (error) {
      return (error as { stdout: string }).stdout;
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const SCRIPT =
  'import fs from "node:fs";\nimport { createHash } from "node:crypto";\n' +
  "export default async () => ({ a: typeof fs, b: createHash, c: Buffer.from('x'), d: process.env.HOME });\n";

test("node: imports, Buffer and process are not underlined", async () => {
  expect(await problems(SCRIPT, "")).toContain("Cannot find name 'node:fs'");
  expect(await problems(SCRIPT, NODE_TYPES)).toBe("");
  // A module that is not Node's is still missed.
  expect(
    await problems('import x from "nothing-here";\nexport default x;\n', NODE_TYPES),
  ).toContain("nothing-here");
}, 60_000);

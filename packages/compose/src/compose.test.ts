import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { type BundleManifest, bundleDigest, entryFor } from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  CONSOLE_MARKER,
  ComposeError,
  composeBundle,
  composeCode,
  type UnsignedBundle,
} from "./index.js";

const sdkEntry = fileURLToPath(new URL("../../sdk/dist/index.js", import.meta.url));
const options = { sdkEntry };
let scratch: string;

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), "compose-test-"));
  await writeFile(join(scratch, "secret.txt"), "TOPSECRET");
});
afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

/** A console-managed script with this source. */
const script = (path: string, code: string): BundleManifest => ({
  kind: "script",
  schemaVersion: 1,
  path,
  ownership: "ui",
  body: {
    entry: entryFor("script", path),
    input: {},
    output: {},
    timeoutSeconds: 30,
    retries: { limit: 0, delaySeconds: 0, backoff: false },
    uses: { connections: [], secrets: [], variables: [] },
    source: { language: "typescript", code },
  },
});
const fromRepo: BundleManifest = {
  kind: "script",
  schemaVersion: 1,
  path: "orders/check",
  ownership: "code",
  body: { entry: "check" },
};
// What the CLI writes for a repository: a banner, the code, and its exports.
const baseCode =
  'import { createRequire as __createRequire } from "node:module";\n' +
  "const require = __createRequire(import.meta.url);\n" +
  "const check = { execute: async (input) => ({ checked: input.id }) };\n" +
  "export { check };\n";
const base: UnsignedBundle = {
  formatVersion: 1,
  sdkVersion: "0.5.0",
  core: { min: "0.5.0", below: "0.6.0" },
  manifests: [fromRepo],
  code: baseCode,
};
const hello = script(
  "orders/hello",
  'import type { ScriptContext } from "@volvel/sdk";\n' +
    'import { SDK_VERSION } from "@volvel/sdk";\n' +
    'import { hostname } from "node:os";\n' +
    "export default async function (input: { name: string }, ctx: ScriptContext) {\n" +
    '  if (input.name === "boom") throw new Error("boom from the console");\n' +
    "  return { hello: input.name, host: typeof hostname(), sdk: SDK_VERSION, ctx: typeof ctx };\n" +
    "}\n",
);

let loads = 0;
async function load(code: string) {
  const file = join(scratch, `module-${loads++}.mjs`);
  await writeFile(file, code);
  return (await import(pathToFileURL(file).href)) as Record<
    string,
    { execute: (input: unknown, ctx: unknown) => Promise<unknown> }
  >;
}

describe("composing a bundle", () => {
  test("a repository's script and a console script run from one module, as a worker calls them", async () => {
    const bundle = await composeBundle(base, [hello], options);
    expect(bundle.formatVersion).toBe(3);
    expect(bundle.manifests.map((manifest) => [manifest.path, manifest.ownership])).toEqual([
      ["orders/check", "code"],
      ["orders/hello", "ui"],
    ]);
    expect(bundle.digest).toBe(bundleDigest(bundle));

    const module = await load(bundle.code);
    expect(await module.check?.execute({ id: 7 }, {})).toEqual({ checked: 7 });
    const entry = hello.body.entry as string;
    expect(await module[entry]?.execute({ name: "ada" }, {})).toEqual({
      hello: "ada",
      host: "string",
      sdk: expect.stringMatching(/^\d+\.\d+\.\d+$/),
      ctx: "object",
    });
    // A failure names the function, so it can be found.
    await expect(module[entry]?.execute({ name: "boom" }, {})).rejects.toThrow(
      "boom from the console",
    );
  });

  test("what a console script declares as input and output is read as JSON Schema from the bundle", async () => {
    const typed = script(
      "orders/typed",
      'import { z } from "@volvel/sdk";\n' +
        "export const input = z.object({ name: z.string(), count: z.number().int().default(1) });\n" +
        "export const output = z.object({ greeting: z.string() });\n" +
        'export default async (input: { name: string }) => ({ greeting: "hi " + input.name });\n',
    );
    const bundle = await composeBundle(base, [hello, typed], options);
    const module = (await load(bundle.code)) as unknown as {
      __vx_describe: (entry: string) => Record<string, unknown>;
    };
    expect(module.__vx_describe(typed.body.entry as string)).toMatchObject({
      input: {
        type: "object",
        properties: { name: { type: "string" }, count: { type: "integer", default: 1 } },
        required: ["name"],
      },
      output: { type: "object", properties: { greeting: { type: "string" } } },
    });
    // One that declares nothing, and a name that is no script, find nothing.
    expect(module.__vx_describe(hello.body.entry as string)).toEqual({});
    expect(module.__vx_describe("toString")).toEqual({});
  });

  test("a console script's input and output are parsed, as defineScript does", async () => {
    const typed = script(
      "orders/parsed",
      'import { z } from "@volvel/sdk";\n' +
        "export const input = z.object({ name: z.string(), count: z.coerce.number().default(2) });\n" +
        "export const output = z.object({ twice: z.number() });\n" +
        "export default async (input: { count: number }) => ({ twice: input.count * 2 });\n",
    );
    const bundle = await composeBundle(base, [typed], options);
    const module = await load(bundle.code);
    const entry = typed.body.entry as string;
    expect(await module[entry]?.execute({ name: "a" }, {})).toEqual({ twice: 4 });
    expect(await module[entry]?.execute({ name: "a", count: "5" }, {})).toEqual({ twice: 10 });
    await expect(module[entry]?.execute({ count: 1 }, {})).rejects.toThrow(
      "The script's input does not match its schema",
    );
  });

  test("composing again replaces the console-managed part and leaves the repository's code alone", async () => {
    const once = await composeCode(baseCode, [hello], options);
    const twice = await composeCode(once, [hello], options);
    expect(twice).toBe(once);
    expect(once.startsWith(baseCode)).toBe(true);
    expect(once.split(CONSOLE_MARKER)).toHaveLength(2);

    // With nothing console-managed the code is the repository's again, and the format is kept.
    expect(await composeCode(once, [], options)).toBe(baseCode);
    const plain = await composeBundle({ ...base, code: once }, [], options);
    expect(plain.formatVersion).toBe(1);
    expect(plain.code).toBe(baseCode);
    expect(plain.digest).toBe(bundleDigest(base));
  });

  test("a console-managed resource takes the place of a repository's at the same path", async () => {
    const takeover = script("orders/check", "export default async () => ({ checked: 'here' });\n");
    const bundle = await composeBundle(base, [takeover], options);
    expect(bundle.manifests).toHaveLength(1);
    expect(bundle.manifests[0]?.ownership).toBe("ui");
    const module = await load(bundle.code);
    expect(await module[takeover.body.entry as string]?.execute({}, {})).toEqual({
      checked: "here",
    });
  });

  test("console source cannot read the machine it is compiled on", async () => {
    const secret = JSON.stringify(join(scratch, "secret.txt"));
    // A tsconfig.json beside the sources would remap the SDK, if it were honored.
    const attempts: Record<string, string> = {
      relative: 'import x from "../secret.txt"; export default async () => x;',
      absolute: `import x from ${secret}; export default async () => x;`,
      require: `const x = require(${secret}); export default async () => x;`,
      dynamic: `export default async () => (await import(${secret})).default;`,
      package: 'import x from "esbuild"; export default async () => x;',
      insideSdk: 'import x from "@volvel/sdk/package.json"; export default async () => x;',
      asText: `import x from ${secret} with { type: "text" }; export default async () => x;`,
      otherSource:
        'import x from "vx-source:orders/hello.script.ts"; export default async () => x;',
    };
    for (const [name, code] of Object.entries(attempts)) {
      const attempt = composeCode(
        baseCode,
        [script(`attack/${name.toLowerCase()}`, code)],
        options,
      );
      await expect(attempt, name).rejects.toThrow(/may import only @volvel\/sdk and node: modules/);
    }
    // A URL is not an import: it builds, and nothing is read.
    const url = await composeCode(
      baseCode,
      [
        script(
          "attack/url",
          'export default async () => new URL("./secret.txt", import.meta.url).href;',
        ),
      ],
      options,
    );
    expect(url).not.toContain("TOPSECRET");
  });

  test("what is wrong with a source is said with its file and line", async () => {
    const problems = async (manifest: BundleManifest) =>
      composeCode(baseCode, [manifest], options).then(
        () => [],
        (error: unknown) => {
          expect(error).toBeInstanceOf(ComposeError);
          return (error as ComposeError).problems;
        },
      );
    expect(
      await problems(script("bad/syntax", "export default async () => {\n  return (;\n};\n")),
    ).toEqual([expect.stringMatching(/^bad\/syntax\.script\.ts:2: /)]);
    expect((await problems(script("bad/nothing", "export const helper = 1;\n")))[0]).toMatch(
      /^bad\/nothing\.script\.ts: needs a default export\./,
    );
    const renamed = script("bad/entry", "export default async () => 1;\n");
    renamed.body.entry = "something_else";
    expect(await problems(renamed)).toEqual([
      "bad/entry.script.ts: its entry must be ui_script_bad_sentry.",
    ]);
    const empty = script("bad/empty", "");
    delete empty.body.source;
    expect(await problems(empty)).toEqual(["bad/empty.script.ts: has no source."]);
    // A repository-managed manifest is not something to compose in.
    await expect(composeBundle(base, [fromRepo], options)).rejects.toThrow(
      "orders/check (script) is not console-managed.",
    );
  });
});

import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { buildBundle } from "./build.js";
import { run } from "./cli.js";

const example = fileURLToPath(new URL("../../../examples/acme", import.meta.url));
const scratch: string[] = [];
afterAll(() => Promise.all(scratch.map((dir) => rm(dir, { recursive: true }))));

async function repository() {
  const dir = await mkdtemp(join(tmpdir(), "widget-"));
  scratch.push(dir);
  await mkdir(join(dir, "node_modules", "@volvel"), { recursive: true });
  await symlink(
    join(example, "node_modules", "@volvel", "sdk"),
    join(dir, "node_modules", "@volvel", "sdk"),
  );
  await writeFile(join(dir, "package.json"), '{"type":"module"}');
  return dir;
}

async function cli(args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(args, {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    env: {},
  });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

describe("volvel widget new", () => {
  test("writes a definition, a view and a fixture, and the next build finds the widget", async () => {
    const dir = await repository();
    const made = await cli(["widget", "new", "daily-goal", "--dir", dir]);
    expect(made.code).toBe(0);
    expect(made.out).toContain("x/daily-goal");
    for (const file of ["widget.ts", "view.tsx", "fixture.json"]) {
      expect((await stat(join(dir, "src/widgets/daily-goal", file))).isFile()).toBe(true);
    }
    expect(await readFile(join(dir, "src/index.ts"), "utf8")).toContain(
      'export * from "./widgets/daily-goal/widget.js";',
    );
    const bundle = await buildBundle({ directory: dir });
    expect(bundle.manifests.map((m) => `${m.kind} ${m.path}`)).toEqual(["widget x/daily-goal"]);
    expect(bundle.manifests[0]?.body).toMatchObject({ entry: "src/widgets/daily-goal/view.tsx" });
    // The fixture is the props a view is given, so a view can be tried with it.
    expect(
      JSON.parse(await readFile(join(dir, "src/widgets/daily-goal/fixture.json"), "utf8")),
    ).toMatchObject({
      state: { status: "ready" },
      data: { value: { shape: "summary" } },
    });
  });

  test("keeps what the entry already exports, and two widgets sit side by side", async () => {
    const dir = await repository();
    await mkdir(join(dir, "src"));
    await writeFile(join(dir, "src/index.ts"), "// mine");
    await cli(["widget", "new", "one", "--dir", dir]);
    await cli(["widget", "new", "two", "--dir", dir]);
    const entry = await readFile(join(dir, "src/index.ts"), "utf8");
    expect(entry).toBe(
      '// mine\nexport * from "./widgets/one/widget.js";\nexport * from "./widgets/two/widget.js";\n',
    );
    const bundle = await buildBundle({ directory: dir });
    expect(bundle.manifests.map((m) => m.path)).toEqual(["x/one", "x/two"]);
  });

  test("refuses a name that is not one, a widget already there, and a missing name", async () => {
    const dir = await repository();
    expect((await cli(["widget", "new", "Bad Name", "--dir", dir])).err).toContain(
      '"Bad Name" is not a name for a widget',
    );
    await cli(["widget", "new", "again", "--dir", dir]);
    expect((await cli(["widget", "new", "again", "--dir", dir])).err).toContain("is already there");
    expect((await cli(["widget", "--dir", dir])).err).toContain("Usage: volvel widget new <name>");
  });
});

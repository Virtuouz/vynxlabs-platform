import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ENV_TYPES_FILE, envDeclarations } from "@volvel/manifest";
import { afterAll, describe, expect, test } from "vitest";
import { buildRepository } from "./build.js";
import { run } from "./cli.js";
import { writeEnvTypes } from "./types.js";

const example = fileURLToPath(new URL("../../../examples/acme", import.meta.url));
const scratch: string[] = [];
afterAll(() => Promise.all(scratch.map((dir) => rm(dir, { recursive: true }))));

const FILES: Record<string, string> = {
  // Two tables as YAML, written by the console or by hand.
  "platform/clinics.table.yaml": `schemaVersion: 1
body:
  description: Clinics the practice runs.
  columns:
    name: { type: text, required: true }
    capacity: { type: integer }
    open: { type: boolean, required: true, default: true }
    status: { type: enum, required: true, values: [open, closed] }
    tags: { type: enum_list, values: [a, b] }
    opened_on: { type: date }
    extra: { type: json }
`,
  "platform/visits.table.yaml": `schemaVersion: 1
body:
  columns:
    clinic: { type: reference, references: clinics, required: true }
`,
  "platform/limit.variable.yaml": "schemaVersion: 1\nbody:\n  default: '5'\n",
  "platform/paid.event.yaml": `schemaVersion: 1
body:
  payload:
    type: object
    properties:
      order: { type: string }
      total: { type: integer }
    required: [order]
    additionalProperties: false
`,
  // The same kinds from code.
  "src/index.ts": `import { column, defineConnection, defineEvent, defineTable, defineVariable, z } from "@volvel/sdk";
export const devices = defineTable({
  path: "devices",
  columns: { label: column.text({ required: true }), weight: column.number() },
});
export const prefix = defineVariable({ path: "prefix", default: "x" });
export const shipped = defineEvent({ path: "shipped", payload: z.object({ id: z.string() }) });
export const shop = defineConnection({ path: "shop", connector: "http" });
`,
};

async function fixture(extra: Record<string, string> = {}) {
  const dir = await mkdtemp(join(tmpdir(), "typed-"));
  scratch.push(dir);
  await mkdir(join(dir, "node_modules", "@volvel"), { recursive: true });
  await symlink(
    join(example, "node_modules", "@volvel", "sdk"),
    join(dir, "node_modules", "@volvel", "sdk"),
  );
  await writeFile(join(dir, "package.json"), '{"type":"module"}');
  for (const [name, text] of Object.entries({ ...FILES, ...extra })) {
    await mkdir(dirname(join(dir, name)), { recursive: true });
    await writeFile(join(dir, name), text);
  }
  return dir;
}

const tsc = fileURLToPath(new URL("../../../node_modules/.bin/tsc", import.meta.url));

/** What `tsc` says of the files in a directory, with the generated declarations beside them. */
function diagnose(dir: string, files: string[]): string[] {
  const project = join(dir, "tsconfig.check.json");
  writeFileSync(
    project,
    JSON.stringify({
      compilerOptions: {
        target: "ES2023",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: [],
      },
      files,
    }),
  );
  const done = spawnSync(tsc, ["-p", project, "--pretty", "false"], { cwd: dir, encoding: "utf8" });
  return done.stdout.split("\n").filter((line) => line.includes("error TS"));
}

const USES = `import type { ScriptContext } from "@volvel/sdk";
export async function ok(ctx: ScriptContext) {
  const clinics = ctx.table("clinics");
  const row = await clinics.insert({ name: "North", status: "open" });
  const name: string = row.name;
  const cap: number | null = row.capacity;
  const open: boolean = row.open;
  const status: "open" | "closed" = row.status;
  const visit = await ctx.table("visits").insert({ clinic: row.id });
  const devices = await ctx.table("devices").find();
  const label: string = devices[0]!.label;
  await ctx.events.publish("paid", { order: "1", total: 3 });
  await ctx.events.publish("shipped", { id: "a" });
  await ctx.variable("limit");
  await ctx.variable("prefix");
  await ctx.connection("shop");
  // Names the repository does not have stay as they were.
  const other = await ctx.table("elsewhere").find();
  const anything: unknown = other[0]?.whatever;
  await ctx.events.publish("not-declared", { any: 1 });
  return [name, cap, open, status, visit.clinic, label, anything];
}
`;

describe("the generated types", () => {
  test("a repository's scripts compile against them, names from YAML and from code alike", async () => {
    const dir = await fixture({ "src/uses.ts": USES });
    const built = await buildRepository({ directory: dir, withoutAppSources: true });
    expect(await writeEnvTypes(dir, built.bundle.manifests)).toBe(true);
    expect(diagnose(dir, ["src/uses.ts", ENV_TYPES_FILE])).toEqual([]);
  });

  test("without the file, the same names are untyped and a wrong column is not caught", async () => {
    const dir = await fixture({ "src/uses.ts": USES });
    // `row.name` is unknown without the declarations, so the typed reads do not compile.
    expect(diagnose(dir, ["src/uses.ts"]).length).toBeGreaterThan(0);
  });

  test.each([
    [
      "a column the table does not have",
      'ctx.table("clinics").insert({ name: "a", status: "open", nope: 1 })',
    ],
    ["a value of the wrong type", 'ctx.table("clinics").insert({ name: 4, status: "open" })'],
    [
      "an enum value that is not listed",
      'ctx.table("clinics").insert({ name: "a", status: "gone" })',
    ],
    ["a required column left out", 'ctx.table("clinics").insert({ status: "open" })'],
    ["a column read that is not there", 'ctx.table("clinics").get("x").then((r) => r?.missing)'],
    ["a column of a code table", 'ctx.table("devices").insert({ label: 1 })'],
    ["an event payload of the wrong shape", 'ctx.events.publish("paid", { order: 1 })'],
    [
      "a payload property the schema forbids",
      'ctx.events.publish("paid", { order: "a", more: 1 })',
    ],
  ])("%s does not compile", async (_what, call) => {
    const dir = await fixture({
      "src/wrong.ts": `import type { ScriptContext } from "@volvel/sdk";\nexport const f = (ctx: ScriptContext) => ${call};\n`,
    });
    const built = await buildRepository({ directory: dir, withoutAppSources: true });
    await writeEnvTypes(dir, built.bundle.manifests);
    expect(diagnose(dir, ["src/wrong.ts", ENV_TYPES_FILE]).length).toBeGreaterThan(0);
  });

  test("a defineTable export keeps its own types beside the generated ones", async () => {
    const dir = await fixture({
      "src/phantom.ts": `import type { ScriptContext } from "@volvel/sdk";
import { devices } from "./index";
export async function f(ctx: ScriptContext) {
  const rows = await ctx.table(devices).find();
  const label: string = rows[0]!.label;
  return label;
}
`,
    });
    const built = await buildRepository({ directory: dir, withoutAppSources: true });
    await writeEnvTypes(dir, built.bundle.manifests);
    expect(diagnose(dir, ["src/phantom.ts", ENV_TYPES_FILE])).toEqual([]);
  });

  test("Row, Insert and TableOf name a table's types by its path, where typeof a definition was used", async () => {
    const dir = await fixture({
      "src/named.ts": `import type { Insert, Row, TableOf } from "@volvel/sdk";
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
export type Clinic = Row<"clinics">;
export const given: Insert<"clinics"> = { name: "North", status: "open" };
export const status: "open" | "closed" = ({} as Clinic).status;
// What an app's table<Definition>(path) reads from its argument: the row and insert types.
type RowOf<T> = T extends { readonly __row?: infer R } ? NonNullable<R> : never;
type InsertOf<T> = T extends { readonly __insert?: infer I } ? NonNullable<I> : never;
export const same: Same<RowOf<TableOf<"clinics">>, Clinic> = true;
export const sameInsert: Same<InsertOf<TableOf<"clinics">>, Insert<"clinics">> = true;
`,
      "src/named-wrong.ts": `import type { Insert, Row } from "@volvel/sdk";
export const a: Insert<"clinics"> = { name: 4, status: "open" };
export const b: Row<"not-a-table"> = {};
`,
    });
    const built = await buildRepository({ directory: dir, withoutAppSources: true });
    await writeEnvTypes(dir, built.bundle.manifests);
    expect(diagnose(dir, ["src/named.ts", ENV_TYPES_FILE])).toEqual([]);
    expect(diagnose(dir, ["src/named-wrong.ts", ENV_TYPES_FILE]).length).toBeGreaterThanOrEqual(2);
  });

  test("a row is typed as the SDK types a defineTable row, for the same columns", async () => {
    const dir = await fixture({
      "src/parity.ts": `import { column, defineTable } from "@volvel/sdk";
import type { VolvelTables } from "@volvel/sdk";
const table = defineTable({
  path: "parity",
  columns: {
    a: column.text({ required: true }),
    b: column.text(),
    c: column.integer({ required: true, default: 1 }),
    d: column.boolean({ default: false }),
    e: column.enum(["x", "y"], { required: true }),
    f: column.enumList(["x", "y"]),
    g: column.json(),
    h: column.reference("other", { required: true }),
    i: column.date({ required: true }),
  },
});
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Generated = VolvelTables["parity"];
type Mine = typeof table extends { __row?: infer R; __insert?: infer I } ? { row: NonNullable<R>; insert: NonNullable<I> } : never;
// Mutual assignability, so that how an object type is spelled does not matter.
export const rowToSdk = (x: Generated["row"]): Mine["row"] => x;
export const rowFromSdk = (x: Mine["row"]): Generated["row"] => x;
export const insertToSdk = (x: Generated["insert"]): Mine["insert"] => x;
export const insertFromSdk = (x: Mine["insert"]): Generated["insert"] => x;
export type { Same };
`,
    });
    const text = envDeclarations([
      {
        kind: "table",
        path: "parity",
        body: {
          columns: {
            a: { type: "text", required: true },
            b: { type: "text" },
            c: { type: "integer", required: true, default: 1 },
            d: { type: "boolean", default: false },
            e: { type: "enum", required: true, values: ["x", "y"] },
            f: { type: "enum_list", values: ["x", "y"] },
            g: { type: "json" },
            h: { type: "reference", references: "other", required: true },
            i: { type: "date", required: true },
          },
        },
      },
    ]);
    await mkdir(join(dir, ".platform"), { recursive: true });
    await writeFile(join(dir, ENV_TYPES_FILE), text);
    expect(diagnose(dir, ["src/parity.ts", ENV_TYPES_FILE])).toEqual([]);
  });

  test("a flow's manual input compiles as its schema says, and any object without one", async () => {
    const dir = await fixture({
      "src/flows.ts": `import type { VolvelFlows } from "@volvel/sdk";
export const typed: VolvelFlows["onboard"]["input"] = { who: "ana" };
export const bare: VolvelFlows["bare"]["input"] = { anything: 1 };
// @ts-expect-error who is a string
export const wrong: VolvelFlows["onboard"]["input"] = { who: 1 };
// @ts-expect-error a bare manual start takes an object, not a number
export const notObject: VolvelFlows["bare"]["input"] = 3;
`,
    });
    const manual = (input?: unknown) => ({
      nodes: { go: { type: "trigger", trigger: { type: "manual", ...(input ? { input } : {}) } } },
    });
    const text = envDeclarations([
      {
        kind: "flow",
        path: "onboard",
        body: manual({ type: "object", properties: { who: { type: "string" } } }),
      },
      { kind: "flow", path: "bare", body: manual() },
    ]);
    await mkdir(join(dir, ".platform"), { recursive: true });
    await writeFile(join(dir, ENV_TYPES_FILE), text);
    expect(diagnose(dir, ["src/flows.ts", ENV_TYPES_FILE])).toEqual([]);
  });

  test("a script's and a flow's schemas, a variable and a connection are declared", () => {
    const text = envDeclarations([
      {
        kind: "script",
        path: "sync",
        body: {
          description: "Syncs */ things.",
          input: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
          output: { type: "array", items: { type: "number" } },
        },
      },
      {
        kind: "flow",
        path: "onboard",
        body: {
          nodes: {
            go: {
              type: "trigger",
              trigger: {
                type: "manual",
                input: { type: "object", properties: { who: { type: "string" } } },
              },
            },
          },
        },
      },
      {
        kind: "flow",
        path: "bare",
        body: { nodes: { go: { type: "trigger", trigger: { type: "manual" } } } },
      },
      {
        kind: "flow",
        path: "nightly",
        body: {
          nodes: { go: { type: "trigger", trigger: { type: "schedule", cron: "0 3 * * *" } } },
        },
      },
      { kind: "variable", path: "limit", body: { default: "5" } },
      { kind: "connection", path: "shop", body: { connector: "http" } },
    ]);
    // A manual start with no schema takes any object; a flow with no manual start says unknown.
    expect(text).toContain('"bare": { input: (Record<string, unknown>) }');
    expect(text).toContain('"nightly": { input: unknown }');
    expect(text).toContain("interface VolvelScripts");
    expect(text).toContain('"sync": { input: { id: string; }; output: (number)[] }');
    expect(text).toContain('"onboard": { input: ({ who?: string; }) }');
    expect(text).toContain('"limit": { default: string }');
    expect(text).toContain('"shop": { connector: "http" }');
    // A comment cannot end early from a description.
    expect(text).not.toMatch(/Syncs \*\/ things/);
  });
});

describe("the commands", () => {
  const capture = () => {
    const out: string[] = [];
    return { out, io: { out: (l: string) => out.push(l), err: () => {}, env: {} } };
  };

  test("types writes the file, and build writes it too", async () => {
    const dir = await fixture();
    const typesOut = capture();
    expect(await run(["types", "--dir", dir], typesOut.io as never)).toBe(0);
    const file = join(dir, ENV_TYPES_FILE);
    const text = await readFile(file, "utf8");
    expect(text).toContain("interface VolvelTables");
    expect(text).toContain('"clinics"');
    expect(text).toContain('"devices"');
    expect(typesOut.out.join("\n")).toContain(ENV_TYPES_FILE);
    await rm(file);
    expect(await run(["build", "--dir", dir], capture().io as never)).toBe(0);
    expect(await readFile(file, "utf8")).toBe(text);
  });

  test("a file that would not change is left alone", async () => {
    const dir = await fixture();
    const built = await buildRepository({ directory: dir, withoutAppSources: true });
    expect(await writeEnvTypes(dir, built.bundle.manifests)).toBe(true);
    expect(await writeEnvTypes(dir, built.bundle.manifests)).toBe(false);
  });
});

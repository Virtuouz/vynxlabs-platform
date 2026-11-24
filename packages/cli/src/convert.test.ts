import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { buildRepository } from "./build.js";
import { run } from "./cli.js";
import { convertRepository, scan } from "./convert.js";
import { BuildError } from "./errors.js";

const example = (name: string) =>
  fileURLToPath(new URL(`../../../examples/${name}`, import.meta.url));
const scratch: string[] = [];
afterAll(() => Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true }))));

/** A copy of an example, with its dependencies linked, to be changed. */
async function copyOf(name: string) {
  const dir = await mkdtemp(join(tmpdir(), `convert-${name}-`));
  scratch.push(dir);
  await cp(example(name), dir, {
    recursive: true,
    filter: (source) => !/\/(node_modules|dist|\.platform)(\/|$)/.test(source),
  });
  await symlink(join(example(name), "node_modules"), join(dir, "node_modules"));
  // The copy is not beside the repository's base configuration.
  const config = join(dir, "tsconfig.json");
  await writeFile(
    config,
    (await readFile(config, "utf8")).replace(
      "../../tsconfig.base.json",
      fileURLToPath(new URL("../../../tsconfig.base.json", import.meta.url)),
    ),
  );
  return dir;
}

const tsc = fileURLToPath(new URL("../../../node_modules/.bin/tsc", import.meta.url));

/** What the TypeScript compiler says of a copy of an example. */
function diagnostics(dir: string): string[] {
  const out = spawnSync(tsc, ["-p", dir, "--noEmit", "--pretty", "false"], { encoding: "utf8" });
  return `${out.stdout}${out.stderr}`.split("\n").filter((line) => /error TS/.test(line));
}

/** A small repository of files, with the SDK linked. */
async function fixture(files: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), "convert-fixture-"));
  scratch.push(dir);
  await mkdir(join(dir, "node_modules", "@volvel"), { recursive: true });
  await symlink(
    join(example("acme"), "node_modules", "@volvel", "sdk"),
    join(dir, "node_modules", "@volvel", "sdk"),
  );
  await writeFile(join(dir, "package.json"), '{"type":"module"}');
  for (const [name, text] of Object.entries(files)) {
    await mkdir(dirname(join(dir, name)), { recursive: true });
    await writeFile(join(dir, name), text);
  }
  return dir;
}

/** Every file of a folder and what is in it, apart from what a build leaves. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const found: Record<string, string> = {};
  const walk = async (folder: string, under: string) => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".platform") continue;
      const path = join(folder, entry.name);
      const name = under === "" ? entry.name : `${under}/${entry.name}`;
      if (entry.isDirectory()) await walk(path, name);
      else found[name] = await readFile(path, "utf8");
    }
  };
  await walk(dir, "");
  return found;
}

const built = (dir: string) => buildRepository({ directory: dir, withoutAppSources: true });
const keys = (manifests: { kind: string; path: string }[]) =>
  manifests.map((one) => `${one.kind} ${one.path}`).sort();

/** What converting must leave alone: every manifest, byte for byte, but who owns it. */
async function sameBundle(before: Awaited<ReturnType<typeof built>>, dir: string) {
  const after = await built(dir);
  expect(keys(after.bundle.manifests)).toEqual(keys(before.bundle.manifests));
  expect(after.bundle.manifests.length).toBe(before.bundle.manifests.length);
  const was = new Map(
    before.bundle.manifests.map((one) => [`${one.kind} ${one.path}`, one] as const),
  );
  for (const one of after.bundle.manifests) {
    const old = was.get(`${one.kind} ${one.path}`);
    expect(one.body, `${one.kind} ${one.path}`).toEqual(old?.body);
    expect(one.key).toEqual(old?.key);
    expect(one.schemaVersion).toEqual(old?.schemaVersion);
  }
  return after;
}

describe("the scanner", () => {
  test("keeps strings, templates, regular expressions and comments from being read as code", () => {
    const { tokens, comments } = scan(
      'const a = "}" + `x${"`"}y` /* } */; // )\nconst r = /[}\\/]/g; const d = 4 / 2;',
    );
    expect(comments).toHaveLength(2);
    expect(tokens.filter((token) => token.text === "}")).toHaveLength(0);
    expect(tokens.some((token) => token.text.startsWith("/["))).toBe(true);
    expect(tokens.filter((token) => token.text === "/")).toHaveLength(1);
  });
});

describe("a fixture repository", () => {
  const FILES = {
    "src/index.ts": 'export * from "./model.js";\nexport * from "./rest.js";\n',
    "src/model.ts": `import { column, defineEvent, defineTable, z } from "@volvel/sdk";

/** The clinics. */
export const clinics = defineTable({
  path: "clinics",
  columns: { name: column.text({ required: true }), size: column.number({ default: -1 }) },
});

// Said when one is opened.
export const opened = defineEvent({
  path: "clinics/opened",
  payload: z.object({ id: z.string(), tags: z.array(z.string()).optional() }),
}); // trailing
`,
    "src/rest.ts": `import { column, defineEvent, defineTable, defineVariable, z } from "@volvel/sdk";
import { clinics } from "./model.js";

const shared = { name: column.text() };
const base = "5";

export const clinicPath = clinics.path;
export const spread = defineTable({ path: "spread", columns: { ...shared } });
export const computed = defineVariable({ path: "limit", default: base });
export const template = defineVariable({ path: "tpl", default: \`a\${base}\` });
export const call = defineVariable({ path: "call", default: String(5) });
export const note = defineEvent({ path: "note", payload: z.object({ id: z.string() }) });
export const plain = defineVariable({
  path: "plain",
  // Not the YAML's business.
  default: "x",
});
`,
  };

  test("what converts, what stays and why; and a dry run changes nothing", async () => {
    const dir = await fixture(FILES);
    const before = await snapshot(dir);
    const result = await convertRepository({ directory: dir, dryRun: true });
    expect(await snapshot(dir)).toEqual(before);
    expect(result.dryRun).toBe(true);
    // A dry run does not say it wrote the file it would make.
    expect(result.notes.join("\n")).toContain("Would write volvel.yaml");
    expect(result.notes.join("\n")).not.toContain("Wrote volvel.yaml");
    expect(result.converted.map((one) => one.export).sort()).toEqual(["note", "opened", "plain"]);
    const why = Object.fromEntries(result.left.map((one) => [one.export, one.reason]));
    expect(why.spread).toContain("spread");
    expect(why.computed).toContain("`base`");
    expect(why.template).toContain("template");
    expect(why.call).toContain("`String`");
    expect(why.clinics).toContain("src/rest.ts:");
    expect(why.clinics).toContain("where a path cannot stand for it");
    expect(why.clinics).toContain('ctx.table("path")');
  });

  test("converting writes the files, takes the exports and their imports out, and builds the same", async () => {
    const dir = await fixture(FILES);
    const was = await built(dir);
    const result = await convertRepository({ directory: dir });
    expect(result.notes.join("\n")).toContain("volvel.yaml");
    expect(await readFile(join(dir, "volvel.yaml"), "utf8")).toBe("resources: resources\n");
    const plain = await readFile(join(dir, "resources/plain.variable.yaml"), "utf8");
    expect(plain).toBe("schemaVersion: 1\nbody:\n  default: x\n");
    expect(plain).not.toContain("YAML's business");
    expect(result.droppedComments).toBeGreaterThan(0);
    const rest = await readFile(join(dir, "src/rest.ts"), "utf8");
    expect(rest).not.toContain("plain");
    expect(rest).not.toContain("defineEvent(");
    expect(rest).toContain("import { column, defineTable, defineVariable } from");
    expect(rest).not.toMatch(/defineEvent[,\s]/);
    expect(rest).not.toContain("Not the YAML");
    const after = await sameBundle(was, dir);
    expect(
      after.bundle.manifests.filter((one) => one.path === "plain").map((one) => one.ownership),
    ).toEqual(["ui"]);
    // opened was the only export left in model.ts but clinics stays, so the file stays.
    const model = await readFile(join(dir, "src/model.ts"), "utf8");
    expect(model).toContain("defineTable");
    expect(model).not.toContain("defineEvent");
    expect(model).not.toContain("trailing");
    expect(model).not.toContain("z }");
    // Nothing more converts.
    const again = await convertRepository({ directory: dir, dryRun: true });
    expect(again.converted).toEqual([]);
  });

  test("what a script that stays names becomes a path, listed, and the code still compiles", async () => {
    const dir = await fixture({
      "tsconfig.json": JSON.stringify({
        extends: fileURLToPath(new URL("../../../tsconfig.base.json", import.meta.url)),
        compilerOptions: {
          composite: false,
          declaration: false,
          declarationMap: false,
          noEmit: true,
          allowImportingTsExtensions: true,
        },
        include: ["src", ".platform/*.d.ts"],
      }),
      "src/index.ts": 'export * from "./model.js";\nexport * from "./script.js";\n',
      "src/model.ts": `import { column, defineConnection, defineEvent, defineTable, defineVariable, z } from "@volvel/sdk";
export const visits = defineTable({ path: "visits", columns: { name: column.text({ required: true }) } });
export const seen = defineEvent({ path: "visits/seen", payload: z.object({ id: z.string() }) });
export const limit = defineVariable({ path: "limit", default: "5" });
export const shop = defineConnection({ path: "shop" });
`,
      "src/script.ts": `import { defineScript, z } from "@volvel/sdk";
import * as model from "./model.js";
import { limit, seen, shop, visits } from "./model.js";

export const count = defineScript({
  path: "count",
  input: z.object({}),
  output: z.object({ n: z.number() }),
  tables: [visits],
  events: [seen],
  variables: [model.limit],
  connections: [shop],
  async run(_input, ctx) {
    const rows = await ctx.table(visits).find();
    await ctx.events.publish(seen, { id: "x" });
    return { n: rows.length + Number(limit.path.length) };
  },
});
`,
    });
    const planned = await convertRepository({ directory: dir, dryRun: true });
    expect(planned.left.map((one) => one.export)).toContain("count");
    // limit.path is not a place a path can stand for it.
    expect(planned.converted.map((one) => one.export).sort()).toEqual(["seen", "shop", "visits"]);
    expect(planned.left.find((one) => one.export === "limit")?.reason).toContain("script.ts:");
    expect(planned.rewrites.map((one) => one.after)).toContain('tables: ["visits"],');
    expect(planned.rewrites.map((one) => one.after)).toContain(
      'const rows = await ctx.table("visits").find();',
    );
    expect(planned.rewrites.map((one) => one.after)).toContain(
      'await ctx.events.publish("visits/seen", { id: "x" });',
    );
    const was = await built(dir);
    await convertRepository({ directory: dir });
    const code = await readFile(join(dir, "src/script.ts"), "utf8");
    expect(code).toContain('import { limit } from "./model.js";');
    expect(code).toContain('connections: ["shop"]');
    expect(await readFile(join(dir, "src/model.ts"), "utf8")).not.toContain("defineTable");
    await sameBundle(was, dir);
    expect(await readFile(join(dir, ".platform/volvel-env.d.ts"), "utf8")).toContain("visits");
  }, 60000);

  test("--keep-references leaves what a definition that stays names", async () => {
    const dir = await fixture({
      "src/index.ts": `import { defineConnection, defineScript, z } from "@volvel/sdk";
export const shop = defineConnection({ path: "shop" });
export const ping = defineScript({
  path: "ping",
  input: z.object({}),
  output: z.object({}),
  connections: [shop],
  async run() {
    return {};
  },
});
`,
    });
    const kept = await convertRepository({ directory: dir, dryRun: true, keepReferences: true });
    expect(kept.converted).toEqual([]);
    expect(kept.left.find((one) => one.export === "shop")?.reason).toContain("--keep-references");
    const result = await convertRepository({ directory: dir });
    expect(result.converted.map((one) => one.export)).toEqual(["shop"]);
    expect((await snapshot(dir))["src/index.ts"]).toContain('connections: ["shop"]');
  });

  test("--only keeps to the kinds named", async () => {
    const dir = await fixture(FILES);
    const result = await convertRepository({ directory: dir, only: ["variable"] });
    expect(result.converted.map((one) => one.export)).toEqual(["plain"]);
    expect(result.left.every((one) => one.kind === "variable")).toBe(true);
  });

  test("a file left empty goes, and what re-exported it", async () => {
    const dir = await fixture({
      "src/index.ts": 'export * from "./model.js";\nexport * from "./rest.js";\n',
      "src/model.ts": `import { defineVariable } from "@volvel/sdk";\nexport const one = defineVariable({ path: "one", default: "1" });\n`,
      "src/rest.ts": `import { defineVariable } from "@volvel/sdk";\nconst base = "2";\nexport const two = defineVariable({ path: "two", default: base });\n`,
    });
    const result = await convertRepository({ directory: dir });
    expect(result.converted.map((one) => one.export)).toEqual(["one"]);
    const files = await snapshot(dir);
    expect(files["src/model.ts"]).toBeUndefined();
    expect(files["src/index.ts"]).toBe('export * from "./rest.js";\n');
    expect(result.notes.join("\n")).toContain("src/model.ts is left empty, and removed");
  });

  test("an entry file left empty is kept", async () => {
    const dir = await fixture({
      "src/index.ts": `import { defineVariable } from "@volvel/sdk";\nexport const one = defineVariable({ path: "one", default: "1" });\n`,
    });
    await convertRepository({ directory: dir });
    expect((await snapshot(dir))["src/index.ts"]).toBe("export {};\n");
    expect(keys((await built(dir)).bundle.manifests)).toEqual(["variable one"]);
  });

  test("a repository whose build differs after converting is put back as it was", async () => {
    const dir = await fixture(FILES);
    const before = await snapshot(dir);
    await expect(
      convertRepository({ directory: dir, verify: () => ["the bundle is not the same"] }),
    ).rejects.toThrow(BuildError);
    expect(await snapshot(dir)).toEqual(before);
  });

  test("a file in the way is not written over", async () => {
    const dir = await fixture({
      ...FILES,
      "resources/plain.variable.yaml": "schemaVersion: 1\nbody:\n  default: other\n",
    });
    await expect(convertRepository({ directory: dir })).rejects.toThrow();
  });

  test("the command, with a dry run and with a run", async () => {
    const dir = await fixture(FILES);
    const out: string[] = [];
    const io = { out: (line: string) => out.push(line), err: () => {}, env: {} };
    expect(await run(["convert", "--dry-run", "--dir", dir], io as never)).toBe(0);
    expect(out.join("\n")).toContain("Would convert 3 definitions");
    expect(out.join("\n")).toContain("Dry run: nothing was written.");
    out.length = 0;
    expect(await run(["convert", "--dir", dir, "--only", "variable"], io as never)).toBe(0);
    expect(out.join("\n")).toContain("Converted 1 definition");
  });
});

describe("the examples, as copies", () => {
  test("acme", async () => {
    const dir = await copyOf("acme");
    const before = await snapshot(dir);
    const was = await built(dir);
    const errors = diagnostics(dir);
    const planned = await convertRepository({ directory: dir, dryRun: true });
    expect(await snapshot(dir)).toEqual(before);
    expect(keys(planned.converted)).toEqual([
      "app invoice-desk",
      "binding access/customers-orders",
      "binding access/customers-portal",
      "binding access/customers-request",
      "binding access/public-notices",
      "binding access/public-page",
      "connection alerts",
      "connection erp",
      "connection shop",
      "event messages/received",
      "event orders/synced",
      "flow orders/handle",
      "interface screens/invoices",
      "role roles/order-requester",
      "role roles/public-reader",
      "schedule orders/sync-every-five-minutes",
      "table invoices",
      "table messages",
      "theme theme",
      "trigger orders/placed",
      "variable orders/batch-size",
    ]);
    const why = Object.fromEntries(planned.left.map((one) => [one.export, one.reason]));
    expect(why.orders).toContain("apps/portal/main.tsx:");
    expect(why.syncOrders).toContain("a script is code");
    expect(why.portal).toContain("made of files");
    expect(why.orderReceived).toContain("`Order`");
    expect(why.contact).toContain("not a plain value");
    // The script that stays names what moved by its path.
    const syncs = planned.rewrites.filter((one) => one.after.includes("connections: [shop"));
    expect(syncs.length).toBeGreaterThan(0);
    expect(
      planned.rewrites.some((one) => one.after.includes('variables: ["orders/batch-size"]')),
    ).toBe(true);

    await convertRepository({ directory: dir });
    expect(await readFile(join(dir, "volvel.yaml"), "utf8")).toBe("resources: resources\n");
    const table = await readFile(join(dir, "resources/invoices.table.yaml"), "utf8");
    expect(table).toMatch(/^schemaVersion: 1\nbody:\n/);
    const code = await readFile(join(dir, "src/index.ts"), "utf8");
    for (const gone of [
      "invoiceScreen",
      "invoiceApp",
      "defineInterface",
      "defineTheme",
      "defineBinding",
    ]) {
      expect(code, gone).not.toContain(gone);
    }
    expect(code).toContain("defineTable");
    expect(code).toContain('variables: ["orders/batch-size"]');
    // The code that is left still compiles, with no import left over: no error that was not there.
    expect(diagnostics(dir)).toEqual(errors);
    const after = await sameBundle(was, dir);
    expect(
      after.bundle.manifests
        .filter((one) =>
          ["invoices", "invoice-desk", "screens/invoices", "theme"].includes(one.path),
        )
        .map((one) => one.ownership),
    ).toEqual(["ui", "ui", "ui", "ui"]);
    expect((await convertRepository({ directory: dir, dryRun: true })).converted).toEqual([]);
  }, 120000);

  test("fernhill", async () => {
    const dir = await copyOf("fernhill");
    const before = await snapshot(dir);
    const was = await built(dir);
    const errors = diagnostics(dir);
    const planned = await convertRepository({ directory: dir, dryRun: true });
    expect(await snapshot(dir)).toEqual(before);
    expect(planned.converted).toHaveLength(34);
    expect(keys(planned.converted)).toEqual(
      expect.arrayContaining([
        "app operations",
        "app handbook",
        "binding access/owners-book",
        "connection sms",
        "event inventory/low",
        "query reports/vet-workload",
        "role roles/runs-script",
        "schedule reminders/hourly",
        "table purchase_orders",
        "table visit_requests",
        "trigger payments/payfern",
        "variable billing/exam-fee",
      ]),
    );
    const why = Object.fromEntries(planned.left.map((one) => [one.export, one.reason]));
    expect(why.appointments).toContain("apps/front-desk/shared.tsx:");
    expect(why.appointments).toContain("typeof appointments");
    expect(why.myAccount).toContain("spread");
    expect(why.bookAppointment).toContain("script");
    expect(why.frontDesk).toContain("made of files");
    expect(why.agentFinds).toContain("`AGENT`");
    // What scripts name by identifier is their path now.
    const rewritten = planned.rewrites.map((one) => `${one.file} ${one.after}`);
    expect(rewritten).toContain('src/scripts.ts connections: ["sms"],');
    expect(rewritten.some((line) => line.includes('ctx.table("purchase_orders")'))).toBe(true);

    // Resources already go to platform/, which the repository has: no volvel.yaml is made.
    await convertRepository({ directory: dir });
    expect((await snapshot(dir))["volvel.yaml"]).toBeUndefined();
    expect((await snapshot(dir))["platform/visit_requests.table.yaml"]).toBeDefined();
    expect(diagnostics(dir)).toEqual(errors);
    await sameBundle(was, dir);
    expect((await convertRepository({ directory: dir, dryRun: true })).converted).toEqual([]);
  }, 180000);

  test("higher-ed-devices", async () => {
    const dir = await copyOf("higher-ed-devices");
    const before = await snapshot(dir);
    const was = await built(dir);
    const errors = diagnostics(dir);
    const planned = await convertRepository({ directory: dir, dryRun: true });
    expect(await snapshot(dir)).toEqual(before);
    expect(keys(planned.converted)).toEqual([
      "binding access/desk-approvals",
      "event loans/overdue",
      "role roles/connects",
      "role roles/decides-approvals",
      "role roles/opens-app",
      "role roles/reads-data",
      "role roles/runs-script",
      "role roles/starts-flow",
    ]);
    const why = Object.fromEntries(planned.left.map((one) => [one.export, one.reason]));
    expect(why.devices).toContain("typeof devices.__row");
    expect(why.requestSubmitted).toContain("`Kind`");
    expect(why.review).toContain("template");
    await convertRepository({ directory: dir });
    const code = await readFile(join(dir, "src/apps.ts"), "utf8");
    expect(code).not.toContain("startsFlow = defineRole");
    expect(diagnostics(dir)).toEqual(errors);
    await sameBundle(was, dir);
  }, 120000);
});

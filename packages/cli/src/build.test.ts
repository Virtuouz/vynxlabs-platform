import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleDigest } from "@volvel/manifest";
import { afterAll, describe, expect, test } from "vitest";
import { BuildError, buildBundle, buildRepository, describeBundle } from "./build.js";

const example = fileURLToPath(new URL("../../../examples/acme", import.meta.url));
const scratch: string[] = [];
afterAll(() => Promise.all(scratch.map((dir) => rm(dir, { recursive: true }))));

/** A throwaway tenant repository that can import the SDK. */
async function repository(source: string) {
  const dir = await mkdtemp(join(tmpdir(), "tenant-"));
  scratch.push(dir);
  await mkdir(join(dir, "src"));
  await mkdir(join(dir, "node_modules", "@volvel"), { recursive: true });
  await symlink(
    join(example, "node_modules", "@volvel", "sdk"),
    join(dir, "node_modules", "@volvel", "sdk"),
  );
  await writeFile(join(dir, "package.json"), '{"type":"module"}');
  await writeFile(join(dir, "src", "index.ts"), source);
  return dir;
}

const problems = async (source: string) => {
  try {
    await buildBundle({ directory: await repository(source) });
    return [];
  } catch (error) {
    if (error instanceof BuildError) return error.problems;
    throw error;
  }
};

describe("building the example repository", () => {
  test("carries the repository's own TypeScript and a map to it, and no dependency", async () => {
    const bundle = await buildBundle({ directory: example });
    const files = bundle.sources?.files.map((file) => file.path) ?? [];
    expect(files).toContain("src/index.ts");
    expect(files.some((path) => path.includes("node_modules"))).toBe(false);
    expect(JSON.parse(bundle.sources?.map ?? "{}").version).toBe(3);
    expect(bundle.code).not.toContain("sourceMappingURL");
  });

  test("produces one manifest per resource, in deploy order, and one module of code", async () => {
    const bundle = await buildBundle({ directory: example });
    expect(bundle.manifests.map((manifest) => `${manifest.kind} ${manifest.path}`)).toEqual([
      "role roles/order-requester",
      "role roles/public-reader",
      "connection alerts",
      "connection erp",
      "connection shop",
      "variable orders/batch-size",
      "table invoices",
      "table messages",
      "table notices",
      "table orders",
      "event messages/received",
      "event orders/received",
      "event orders/synced",
      "script alerts/run-failed",
      "script core/publish-event",
      "script core/table-write",
      "script orders/check",
      "script orders/receive",
      "script orders/record",
      "script orders/request",
      "script orders/send-to-erp",
      "script orders/sync",
      "schedule orders/sync-every-five-minutes",
      "trigger orders/placed",
      "flow contact",
      "flow orders/handle",
      "theme theme",
      "interface screens/invoices",
      "app invoice-desk",
      "app portal",
      "app public",
      "binding access/customers-orders",
      "binding access/customers-portal",
      "binding access/customers-request",
      "binding access/public-notices",
      "binding access/public-page",
    ]);
    // Its contact flow is made of core nodes, which the build adds as the platform has them. They
    // are the only resources in it that the repository's own code does not define.
    expect(
      bundle.manifests.filter((manifest) => manifest.ownership === "ui").map((m) => m.path),
    ).toEqual(["core/publish-event", "core/table-write"]);
    // A bundle that carries them is written as format 3.
    expect(bundle).toMatchObject({
      formatVersion: 3,
      sdkVersion: "0.5.0",
      core: { min: "0.5.0", below: "0.6.0" },
    });
    expect(bundle.digest).toBe(bundleDigest(bundle));
    expect(describeBundle(bundle)[0]).toContain(bundle.digest.slice(0, 12));

    const pages = (bundle.assets ?? []).filter((asset) => asset.path === "index.html");
    expect(pages.map((asset) => asset.app)).toEqual(["portal", "public"]);
    const scripts = (bundle.assets ?? []).filter((asset) => asset.path.endsWith(".js"));
    expect(scripts.length).toBeGreaterThan(1);
    expect(scripts.every((asset) => asset.contentType.startsWith("text/javascript"))).toBe(true);
    expect((bundle.assets ?? []).some((asset) => asset.path.endsWith(".css"))).toBe(true);

    const sync = bundle.manifests.find((manifest) => manifest.path === "orders/sync");
    expect(sync).toMatchObject({
      ownership: "code",
      schemaVersion: 1,
      body: {
        entry: "syncOrders",
        timeoutSeconds: 120,
        retries: { limit: 3, delaySeconds: 30, backoff: true },
        concurrency: 1,
        uses: {
          connections: ["shop", "erp"],
          secrets: [],
          variables: ["orders/batch-size"],
          events: ["orders/synced"],
        },
        onFailure: { script: "alerts/run-failed", notify: "alerts" },
        input: { type: "object", properties: { since: { type: "string" } } },
        output: { type: "object", required: ["sent", "skipped"] },
      },
    });
    // The flow is written as nodes and edges, and that is exactly what the manifest holds.
    const flow = bundle.manifests.find((manifest) => manifest.path === "orders/handle");
    expect(flow?.body).toMatchObject({
      nodes: {
        from_event: { type: "trigger", trigger: { type: "event", event: "orders/received" } },
        by_hand: { type: "trigger", trigger: { type: "manual" } },
        check: { type: "script", script: "orders/check", input: "{'order': trigger}" },
        route: {
          type: "branch",
          cases: [
            { name: "invalid", when: "!steps.check.output.valid" },
            { name: "large", when: "trigger.total > 1000.0" },
          ],
        },
        approve: { type: "approval", title: "Approve a large order" },
      },
    });
    const edges = (flow?.body.edges ?? []) as object[];
    expect(edges).toContainEqual({
      from: "route",
      to: "approve",
      output: "large",
    });
    expect(edges).toContainEqual({
      from: "send",
      to: "report",
      error: true,
    });
    // No manifest names a workspace: the same bundle deploys anywhere.
    expect(bundle.manifests.every((manifest) => !("workspace" in manifest))).toBe(true);
    // The code is self-contained and exports each script under its entry name.
    const file = join(dirname(example), "acme", ".platform", "check.mjs");
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, bundle.code);
    const loaded = await import(file);
    await rm(file);
    expect(typeof loaded.syncOrders.execute).toBe("function");
  });

  test("building twice gives the same digest", async () => {
    const [first, second] = [
      await buildBundle({ directory: example }),
      await buildBundle({ directory: example }),
    ];
    expect(first.digest).toBe(second.digest);
  });
});

describe("a repository with mistakes", () => {
  const head = 'import { defineScript, defineSchedule, defineConnection, z } from "@volvel/sdk";\n';
  const script = (extra = "") =>
    `export const s = defineScript({ path: "jobs/a", input: z.object({}), output: z.object({}), ${extra} async run() { return {}; } });\n`;

  test("names the resource and the field", async () => {
    expect(await problems(head + script("timeoutSeconds: 99999,"))).toEqual([
      "jobs/a (script): /body/timeoutSeconds must be <= 3600",
    ]);
    expect(
      await problems(
        `${head}export const s = defineScript({ path: "Bad Path", input: z.object({}), output: z.object({}), async run() { return {}; } });`,
      ),
    ).toEqual([expect.stringContaining("Bad Path (script): /path must match pattern")]);
  });

  test("catches references to things that are not there", async () => {
    expect(
      await problems(
        `${head}${script('connections: ["crm"], onFailure: { script: "jobs/missing" },')}export const every = defineSchedule({ path: "jobs/nightly", script: "jobs/other", cron: "0 2 * * *" });`,
      ),
    ).toEqual([
      'jobs/a (script): connections refers to "crm", which is not a connection in this repository.',
      'jobs/a (script): onFailure.script refers to "jobs/missing", which is not a script in this repository.',
      'jobs/nightly (schedule): script refers to "jobs/other", which is not a script in this repository.',
    ]);
  });

  test("catches a flow that does not hold together", async () => {
    const flowHead = 'import { defineFlow, defineScript, step, trigger, z } from "@volvel/sdk";\n';
    const source = `${flowHead}${script()}export const f = defineFlow({
      path: "flows/broken",
      nodes: {
        start: trigger.manual(),
        work: step.script("jobs/missing", { input: "trigger.n >" }),
        choose: step.branch({ big: "trigger.n > 10.0" }),
        lonely: step.set({ x: "1" }),
      },
      edges: [["start", "work"], ["work", "choose"], ["choose", "work", { when: "huge" }]],
    });`;
    expect(await problems(source)).toEqual([
      'flows/broken (flow): /body/edges/2/output the branch "choose" has no case "huge"',
      "flows/broken (flow): /body/nodes/lonely no trigger leads to this node",
      "flows/broken (flow): /body/nodes/work the flow loops back on itself: work -> choose -> work. Use a foreach to repeat",
      'flows/broken (flow): /body/nodes/work/script refers to "jobs/missing", which is not a script in this repository.',
      expect.stringMatching(
        /^flows\/broken \(flow\): \/body\/nodes\/work\/input is not a valid expression: /,
      ),
    ]);
  });

  test("catches a name no expression of a flow has, such as `input` (FLW-11)", async () => {
    const source = `import { defineFlow, defineScript, step, trigger, z } from "@volvel/sdk";\n${script()}export const f = defineFlow({
      path: "flows/wrong-name",
      nodes: {
        start: trigger.manual(),
        size: step.branch({ big: "input.amount > 100" }),
        a: step.set({ x: "1" }),
      },
      edges: [["start", "size"], ["size", "a", { when: "big" }]],
    });`;
    expect(await problems(source)).toEqual([
      expect.stringMatching(/^flows\/wrong-name \(flow\): .*is not a valid expression: .*input/),
    ]);
  });

  test("catches a path used twice, an empty repository and code that does not compile", async () => {
    expect(
      await problems(`${head}${script()}export const c = defineConnection({ path: "jobs/a" });`),
    ).toEqual(["jobs/a: used by both a connection and a script. Paths must be unique."]);
    // What refers to a path used twice is not reported again: the one problem is the clash.
    expect(
      await problems(
        `import { column, defineApp, defineInterface, defineTable } from "@volvel/sdk";
export const pets = defineTable({ path: "pets", columns: { name: column.text() } });
export const app = defineApp({ path: "pets", title: "Pets", interface: "screens/pets" });
export const visits = defineTable({ path: "visits", columns: { pet: column.reference("pets") } });
export const screen = defineInterface({ path: "screens/pets", title: "Pets", pages: [{ id: "p", title: "Pets", widgets: [] }] });`,
      ),
    ).toEqual(["pets: used by both a table and an app. Paths must be unique."]);
    expect(await problems("export const nothing = 1;")).toEqual([
      "src/index.ts exports no resources. Export what you define with the SDK.",
    ]);
    expect((await problems("export const broken = ;"))[0]).toMatch(/^src\/index\.ts:1: /);
  });
});

describe("keys and titles", () => {
  const head =
    'import { column, defineSchedule, defineScript, defineTable, z } from "@volvel/sdk";\n';
  const script = (options: string) =>
    `export const submit = defineScript({ ${options} input: z.object({}), output: z.object({}), async run() { return {}; } });\n`;

  test("a repository that says neither builds as it always did, in the oldest format", async () => {
    const bundle = await buildBundle({
      directory: await repository(`${head}${script('path: "requests/submit",')}`),
    });
    expect(bundle.formatVersion).toBe(1);
    expect(Object.keys(bundle.manifests[0] ?? {}).sort()).toEqual([
      "body",
      "kind",
      "ownership",
      "path",
      "schemaVersion",
    ]);
  });

  test("a moved resource says the key it had, and the bundle is written in format 4", async () => {
    const bundle = await buildBundle({
      directory: await repository(
        `${head}${script('path: "lending/requests/file", key: "requests/submit", title: "Submit a device request",')}`,
      ),
    });
    expect(bundle.formatVersion).toBe(4);
    expect(bundle.manifests[0]).toMatchObject({
      path: "lending/requests/file",
      key: "requests/submit",
      title: "Submit a device request",
    });
    // A key that is the path is not written: it says nothing.
    const same = await buildBundle({
      directory: await repository(
        `${head}${script('path: "requests/submit", key: "requests/submit",')}`,
      ),
    });
    expect(same.formatVersion).toBe(1);
    expect(same.manifests[0]).not.toHaveProperty("key");
  });

  test("a script says the name of its tool, which then does not follow its path", async () => {
    const bundle = await buildBundle({
      directory: await repository(
        `${head}${script('path: "requests/submit", mcp: { name: "submit_device_request" },')}`,
      ),
    });
    expect(bundle.formatVersion).toBe(4);
    expect(bundle.manifests[0]?.mcp).toEqual({ name: "submit_device_request" });
    expect(
      await problems(`${head}${script('path: "requests/submit", mcp: { name: "Submit It" },')}`),
    ).toEqual([expect.stringContaining("requests/submit (script): /mcp/name must match pattern")]);
  });

  test("a reference written as text may name a resource by its key, and is built as its path", async () => {
    const source = `${head}${script('path: "lending/requests/file", key: "requests/submit", tables: ["items"],')}
export const items = defineTable({ path: "lending/items", key: "items", columns: { name: column.text() } });
export const nightly = defineSchedule({ path: "nightly", script: "requests/submit", cron: "0 2 * * *" });`;
    const built = await buildRepository({ directory: await repository(source) });
    const body = (path: string) =>
      built.bundle.manifests.find((manifest) => manifest.path === path)?.body as {
        script?: string;
        uses: { tables: string[] };
      };
    expect(body("nightly").script).toBe("lending/requests/file");
    expect(body("lending/requests/file").uses.tables).toEqual(["lending/items"]);
    expect([...built.notes].sort()).toEqual([
      'lending/requests/file (script): /body/uses/tables/0 names "items" by its key. It is at "lending/items" now.',
      'nightly (schedule): /body/script names "requests/submit" by its key. It is at "lending/requests/file" now.',
    ]);
  });
});

describe("a definition the entry file does not export", () => {
  const script = (name: string, path: string) =>
    `import { defineScript, z } from "@volvel/sdk";\nexport const ${name} = defineScript({ path: "${path}", input: z.object({}), output: z.object({}), async run() { return {}; } });\n`;

  test("is refused by name, where it would have gone missing without a word", async () => {
    expect(
      await problems(
        `${script("kept", "jobs/kept")}const forgotten = defineScript({ path: "jobs/forgotten", input: z.object({}), output: z.object({}), async run() { return {}; } });\nvoid forgotten;`,
      ),
    ).toEqual([
      expect.stringMatching(
        /^jobs\/forgotten \(script\) is defined, but src\/index\.ts does not export it/,
      ),
    ]);
  });

  test("two files exporting the same name through export * are both named", async () => {
    const dir = await repository('export * from "./a.js";\nexport * from "./b.js";\n');
    await writeFile(join(dir, "src", "a.ts"), script("submit", "requests/submit"));
    await writeFile(join(dir, "src", "b.ts"), script("submit", "returns/submit"));
    const failure = await buildBundle({ directory: dir }).catch((error) => error);
    expect(failure).toBeInstanceOf(BuildError);
    expect(
      (failure as BuildError).problems.map((problem) => problem.split(" is defined")[0]),
    ).toEqual(["requests/submit (script)", "returns/submit (script)"]);
  });

  test("the same definition exported under two names is fine", async () => {
    const dir = await repository(`${script("one", "jobs/one")}export { one as alsoOne };\n`);
    const bundle = await buildBundle({ directory: dir }).catch((error) => error);
    // Exported twice is its own mistake, caught as a path used twice or not at all: never as missing.
    if (bundle instanceof BuildError) {
      expect(bundle.problems.join("\n")).not.toContain("does not export it");
    }
  });
});

describe("resources managed in the console, as files in the repository", () => {
  const source = `
    import { defineScript, z } from "@volvel/sdk";
    export const check = defineScript({
      path: "orders/check",
      input: z.object({}),
      output: z.object({}),
      execute: async () => ({}),
    });
  `;
  const yaml =
    "schemaVersion: 1\nbody:\n  description: Says hello.\n  input: {}\n  output: {}\n" +
    "  timeoutSeconds: 30\n  retries:\n    limit: 0\n    delaySeconds: 0\n    backoff: false\n" +
    "  uses:\n    connections: []\n    secrets: []\n    variables: []\n";
  const withFiles = async (files: Record<string, string>) => {
    const dir = await repository(source);
    for (const [name, content] of Object.entries(files)) {
      await mkdir(dirname(join(dir, name)), { recursive: true });
      await writeFile(join(dir, name), content);
    }
    return dir;
  };
  const failing = async (files: Record<string, string>) => {
    try {
      await buildBundle({ directory: await withFiles(files) });
      return [];
    } catch (error) {
      if (error instanceof BuildError) return error.problems;
      throw error;
    }
  };

  test("they are built into the same bundle, marked console-managed, and run beside the code", async () => {
    const dir = await withFiles({
      "platform/orders/hello.script.yaml": yaml,
      "platform/orders/hello.script.ts":
        "export default async (input: { name: string }) => ({ hello: input.name });\n",
      "platform/orders/greeting.variable.yaml": "schemaVersion: 1\nbody:\n  default: hi\n",
    });
    const bundle = await buildBundle({ directory: dir });
    expect(bundle.formatVersion).toBe(3);
    expect(bundle.manifests.map((m) => `${m.kind} ${m.path} ${m.ownership}`)).toEqual([
      "variable orders/greeting ui",
      "script orders/check code",
      "script orders/hello ui",
    ]);
    expect(bundle.digest).toBe(bundleDigest(bundle));

    const file = join(dir, "bundle.mjs");
    await writeFile(file, bundle.code);
    const module = await import(file);
    expect(await module.ui_script_orders_shello.execute({ name: "ada" })).toEqual({ hello: "ada" });
    expect(typeof module.check.execute).toBe("function");

    // Without the folder the same repository is still written in the old format.
    expect((await buildBundle({ directory: await repository(source) })).formatVersion).toBe(1);
  });

  test("files are read wherever the repository keeps them, and say where each is when that is not the console's folder", async () => {
    const dir = await withFiles({
      "volvel.yaml": "roots: [src]\n",
      // Beside the feature it belongs to. Its path is where it is, under the root.
      "src/lending/greeting.variable.yaml":
        "title: Greeting\nschemaVersion: 1\nbody:\n  default: hi\n",
      // Kept somewhere that gives no path: it says its own.
      "ops/limits.variable.yaml": 'path: lending/limit\nschemaVersion: 1\nbody:\n  default: "5"\n',
      "platform/orders/size.variable.yaml": 'schemaVersion: 1\nbody:\n  default: "9"\n',
      // Not resources: a test, a kind there is not, and whatever a dependency ships.
      "src/lending/greeting.test.ts": "export {};\n",
      "src/lending/notes.memo.yaml": "anything: goes\n",
      "node_modules/dep/broken.variable.yaml": "not: [valid",
    });
    const bundle = await buildBundle({ directory: dir });
    expect(
      bundle.manifests
        .filter((one) => one.ownership === "ui")
        .map((one) => [one.path, one.title ?? null, one.source?.file ?? null]),
    ).toEqual([
      ["lending/greeting", "Greeting", "src/lending/greeting.variable.yaml"],
      ["lending/limit", null, "ops/limits.variable.yaml"],
      ["orders/size", null, null],
    ]);
    // It carries what only format 4 can: where a file is, and a title.
    expect(bundle.formatVersion).toBe(4);
  });

  test("a path defined in the code and in a file is refused, as is anything wrong with a file", async () => {
    expect(
      await failing({
        "platform/orders/check.script.yaml": yaml,
        "platform/orders/check.script.ts": "export default async () => ({});\n",
      }),
    ).toEqual([
      "orders/check is defined in src/index.ts and again in platform/orders/check.script.yaml. Keep one. A resource taken over in the console is removed from the code.",
    ]);
    expect(await failing({ "platform/orders/hello.script.yaml": yaml })).toEqual([
      "platform/orders/hello.script.yaml: needs its source beside it, as platform/orders/hello.script.ts.",
    ]);
    expect(
      await failing({
        "platform/orders/hello.script.yaml": yaml,
        "platform/orders/hello.script.ts":
          'import { readFileSync } from "../../src/index.ts";\nexport default async () => readFileSync;\n',
      }),
    ).toEqual([
      expect.stringMatching(
        /^platform\/orders\/hello\.script\.ts:1: Code written in the console may import only/,
      ),
    ]);
    // A body that is not valid for its kind is caught with the rest of the bundle.
    expect(
      (
        await failing({
          "platform/orders/hello.script.yaml": yaml.replace(
            "timeoutSeconds: 30",
            "timeoutSeconds: 0",
          ),
          "platform/orders/hello.script.ts": "export default async () => ({});\n",
        })
      ).join("\n"),
    ).toContain("timeoutSeconds");
  });
});

describe("a repository with documentation", () => {
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  );
  const source = `
    import { defineApp, defineBinding } from "@volvel/sdk";
    export const help = defineApp({ path: "help", title: "Handbook", docs: "handbook" });
    export const open = defineBinding({
      path: "bindings/help",
      role: "portal_user",
      principal: { type: "anonymous" },
      resource: help,
    });
  `;
  const withPages = async (pages: Record<string, string | Buffer>, config?: string) => {
    const dir = await repository(source);
    if (config !== undefined) await writeFile(join(dir, "volvel.yaml"), config);
    for (const [name, content] of Object.entries(pages)) {
      await mkdir(dirname(join(dir, name)), { recursive: true });
      await writeFile(join(dir, name), content);
    }
    return dir;
  };

  test("reads its pages from the folder of pages, as they are, and its pictures as the app's files", async () => {
    const home =
      "---\ntitle: Handbook\n---\n\nSee [refunds](support/refunds).\n\n![The till](img/till.png)\n";
    const refunds = "---\ntitle: Refund an order\ntopic: support-refunds\n---\n\nAsk first.\n";
    const directory = await withPages({
      "platform/docs/handbook/index.md": home,
      "platform/docs/handbook/support/refunds.md": refunds,
      "platform/docs/handbook/img/till.png": PNG,
      // Not a page: it is in no folder of pages.
      "README.md": "# Read me\n\n[broken](nowhere)\n",
    });
    const built = await buildRepository({ directory });
    const docs = built.bundle.manifests.filter((manifest) => manifest.kind === "doc");
    expect(docs.map((doc) => [doc.path, doc.title, doc.ownership])).toEqual([
      ["handbook/index", "Handbook", "ui"],
      ["handbook/support/refunds", "Refund an order", "ui"],
    ]);
    expect(docs[0]?.body).toEqual({ source: home });
    expect(built.bundle.manifests.map((manifest) => manifest.kind)).toEqual([
      "doc",
      "doc",
      "app",
      "binding",
    ]);
    expect(built.bundle.assets).toEqual([
      {
        app: "help",
        path: "img/till.png",
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        size: PNG.length,
        contentType: "image/png",
      },
    ]);
    expect(built.files.get(built.bundle.assets?.[0]?.sha256 as string)).toEqual(PNG);
  });

  test("pages with types and subjects build, and what could be better is said as warnings, never as a refusal", async () => {
    const directory = await withPages({
      "platform/docs/handbook/index.md": "---\ntitle: Handbook\n---\n\nHello.\n",
      "platform/docs/handbook/how/index.md": "---\ntitle: How\ntype: how-to\n---\n",
      "platform/docs/handbook/how/refund.md":
        "---\ntitle: Refund an order\nsubjects: [refunds]\nmoved_from: [old/refund]\n---\n\nJust words.\n",
    });
    const built = await buildRepository({ directory });
    expect(built.warnings.join("\n")).toContain("handbook/how/refund (doc)");
    expect(built.warnings.join("\n")).toContain("no numbered steps");
    expect(built.warnings.join("\n")).toContain('subject "refunds"');
  });

  test("a site that uses none of it has no warnings", async () => {
    const directory = await withPages({
      "platform/docs/handbook/index.md": "---\ntitle: Handbook\n---\n\nHello.\n",
    });
    expect((await buildRepository({ directory })).warnings).toEqual([]);
  });

  test("reads them from the folders a repository names, and from nowhere else", async () => {
    const directory = await withPages(
      {
        "docs/handbook/index.md": "---\ntitle: Handbook\n---\n",
        "platform/docs/handbook/ignored.md": "---\ntitle: Not read\n---\n",
      },
      "docs: [docs]\n",
    );
    const built = await buildRepository({ directory });
    expect(
      built.bundle.manifests.filter((manifest) => manifest.kind === "doc").map((doc) => doc.path),
    ).toEqual(["handbook/index"]);
  });

  test("does not build when a page does not read or a link leads nowhere", async () => {
    const directory = await withPages({
      "platform/docs/handbook/index.md": "---\ntitle: Handbook\n---\n\n[gone](missing)\n\n::nope\n",
      "platform/docs/handbook/Bad Name.md": "---\ntitle: Bad\n---\n",
    });
    await expect(buildRepository({ directory })).rejects.toMatchObject({
      problems: [
        "platform/docs/handbook/Bad Name.md: a page's name and its folders are written in lowercase letters, digits, hyphens and underscores. Rename the file: nothing renames it for you.",
      ],
    });
    await rm(join(directory, "platform/docs/handbook/Bad Name.md"));
    await expect(buildRepository({ directory })).rejects.toMatchObject({
      problems: [
        'handbook/index (doc): line 5: The link to "missing" leads nowhere: there is no page at missing.',
        expect.stringContaining(
          'handbook/index (doc): line 7: There is no component named "nope".',
        ),
      ],
    });
  });
});

describe("a widget in a repository", () => {
  const widget = (extra = "") => `import { defineWidget } from "@volvel/sdk";
export const goal = defineWidget({
  type: "x/goal", version: "1.0.0", title: "Goal", description: "Progress toward a target",
  category: "understand", icon: "target", surfaces: ["app"],
  data: { value: { shape: "summary" } },
  config: { type: "object", properties: { target: { type: "number", "x-volvel": { tab: "display", control: "number", label: "Target" } } } },
  events: {}, layout: { min: { w: 2, h: 2 }, default: { w: 3, h: 3 } },
  entry: "widgets/goal/view.tsx",${extra}
});`;

  test("is built as a widget manifest owned by the code, when its view is there", async () => {
    const dir = await repository(widget());
    await mkdir(join(dir, "widgets", "goal"), { recursive: true });
    await writeFile(join(dir, "widgets", "goal", "view.tsx"), "export {};");
    const bundle = await buildBundle({ directory: dir });
    expect(bundle.manifests.map((m) => `${m.kind} ${m.path} ${m.ownership}`)).toEqual([
      "widget x/goal code",
    ]);
  });

  test("is refused when its view is not in the repository, naming the file", async () => {
    expect(await problems(widget())).toEqual([
      'x/goal (widget): the view "widgets/goal/view.tsx" is not a file in this repository.',
    ]);
  });

  test("is refused by the definition's own checks, before anything is built", async () => {
    expect(await problems(widget().replace('"x/goal"', '"acme/goal"'))).toEqual([
      expect.stringContaining('a widget of your own is "x/<name>"'),
    ]);
  });
});

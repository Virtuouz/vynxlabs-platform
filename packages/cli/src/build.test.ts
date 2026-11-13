import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleDigest } from "@vynxlabs/manifest";
import { afterAll, describe, expect, test } from "vitest";
import { BuildError, buildBundle, describeBundle } from "./build.js";

const example = fileURLToPath(new URL("../../../examples/acme", import.meta.url));
const scratch: string[] = [];
afterAll(() => Promise.all(scratch.map((dir) => rm(dir, { recursive: true }))));

/** A throwaway tenant repository that can import the SDK. */
async function repository(source: string) {
  const dir = await mkdtemp(join(tmpdir(), "tenant-"));
  scratch.push(dir);
  await mkdir(join(dir, "src"));
  await mkdir(join(dir, "node_modules", "@vynxlabs"), { recursive: true });
  await symlink(
    join(example, "node_modules", "@vynxlabs", "sdk"),
    join(dir, "node_modules", "@vynxlabs", "sdk"),
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
  const head =
    'import { defineScript, defineSchedule, defineConnection, z } from "@vynxlabs/sdk";\n';
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
    const flowHead =
      'import { defineFlow, defineScript, step, trigger, z } from "@vynxlabs/sdk";\n';
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

  test("catches a path used twice, an empty repository and code that does not compile", async () => {
    expect(
      await problems(`${head}${script()}export const c = defineConnection({ path: "jobs/a" });`),
    ).toEqual(["jobs/a: used by both a connection and a script. Paths must be unique."]);
    expect(await problems("export const nothing = 1;")).toEqual([
      "src/index.ts exports no resources. Export what you define with the SDK.",
    ]);
    expect((await problems("export const broken = ;"))[0]).toMatch(/^src\/index\.ts:1: /);
  });
});

describe("resources managed in the console, as files in the repository", () => {
  const source = `
    import { defineScript, z } from "@vynxlabs/sdk";
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
      "platform/orders/hello.script.yaml: needs its source beside it, as orders/hello.script.ts.",
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

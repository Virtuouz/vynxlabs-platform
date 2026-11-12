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
      "connection alerts",
      "connection erp",
      "connection shop",
      "variable orders/batch-size",
      "event orders/received",
      "event orders/synced",
      "script alerts/run-failed",
      "script orders/check",
      "script orders/receive",
      "script orders/send-to-erp",
      "script orders/sync",
      "schedule orders/sync-every-five-minutes",
      "trigger orders/placed",
      "flow orders/handle",
    ]);
    expect(bundle).toMatchObject({
      formatVersion: 1,
      sdkVersion: "0.2.0",
      core: { min: "0.2.0", below: "0.3.0" },
    });
    expect(bundle.digest).toBe(bundleDigest(bundle));
    expect(describeBundle(bundle)[0]).toContain(bundle.digest.slice(0, 12));

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

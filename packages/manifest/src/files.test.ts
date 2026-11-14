import { describe, expect, test } from "vitest";
import type { BundleManifest } from "./bundle.js";
import { entryFor, parseResourceFiles, renderResourceFiles } from "./files.js";
import { platformKinds } from "./kinds.js";

const script: BundleManifest = {
  kind: "script",
  schemaVersion: 1,
  path: "orders/sync",
  ownership: "ui",
  body: {
    // Written out of order on purpose: the file follows the schema's order.
    uses: { connections: ["shop"], secrets: [], variables: [] },
    retries: { backoff: true, limit: 2, delaySeconds: 30 },
    timeoutSeconds: 60,
    output: { type: "object" },
    input: { type: "object", properties: { since: { type: "string" } } },
    description: "Copies new orders.",
    entry: entryFor("script", "orders/sync"),
    source: {
      language: "typescript",
      code: "export default async function (input: { since: string }) {\n  return { sent: 0 };\n}\n",
    },
  },
};
const flow: BundleManifest = {
  kind: "flow",
  schemaVersion: 1,
  path: "orders/handle",
  ownership: "ui",
  body: {
    description: "Checks an order.",
    nodes: {
      start: { type: "trigger", trigger: { type: "manual" } },
      check: { type: "script", script: "orders/sync", input: "{'order': trigger}" },
      route: {
        type: "branch",
        cases: [{ name: "large", when: "trigger.total > 1000.0 &&\n  trigger.currency == 'USD'" }],
      },
    },
    edges: [
      { from: "start", to: "check" },
      { from: "check", to: "route" },
    ],
  },
};
const variable: BundleManifest = {
  kind: "variable",
  schemaVersion: 1,
  path: "orders/batch-size",
  ownership: "ui",
  body: { description: "no", default: "1e3" },
};

describe("resources as files", () => {
  test("each resource is one YAML file named by its path and kind, with source beside it", () => {
    const files = renderResourceFiles([script, flow, variable], platformKinds);
    expect(files.map((file) => file.path)).toEqual([
      "orders/batch-size.variable.yaml",
      "orders/handle.flow.yaml",
      "orders/sync.script.ts",
      "orders/sync.script.yaml",
    ]);
    const yaml = files.find((file) => file.path === "orders/sync.script.yaml")?.content ?? "";
    // Neither the entry nor the source is in the YAML: one is derived, the other is the .ts file.
    expect(yaml).not.toContain("entry");
    expect(yaml).not.toContain("export default");
    // Keys follow the schema, whatever order the manifest held them in.
    expect([...yaml.matchAll(/^ {2}([a-zA-Z]+):/gm)].map((match) => match[1])).toEqual([
      "description",
      "input",
      "output",
      "timeoutSeconds",
      "retries",
      "uses",
    ]);
    expect(yaml).toContain("retries:\n    limit: 2\n    delaySeconds: 30\n    backoff: true\n");
    expect(files.find((file) => file.path.endsWith(".ts"))?.content).toBe(
      (script.body.source as { code: string }).code,
    );
  });

  test("a flow keeps its nodes in the order their author gave them, and strings that look like something else stay strings", () => {
    const files = renderResourceFiles([flow, variable], platformKinds);
    const text = files.find((file) => file.path.endsWith(".flow.yaml"))?.content ?? "";
    expect(text.indexOf("start:")).toBeLessThan(text.indexOf("check:"));
    expect(text.indexOf("check:")).toBeLessThan(text.indexOf("route:"));
    const back = parseResourceFiles(files);
    expect(back.problems).toEqual([]);
    expect(back.manifests.find((manifest) => manifest.kind === "variable")?.body).toEqual({
      description: "no",
      default: "1e3",
    });
  });

  test("reading the files gives the manifests back, and writing them again gives the same bytes", () => {
    const files = renderResourceFiles([script, flow, variable], platformKinds);
    const back = parseResourceFiles(files);
    expect(back.problems).toEqual([]);
    expect(back.manifests.every((manifest) => manifest.ownership === "ui")).toBe(true);
    const sync = back.manifests.find((manifest) => manifest.path === "orders/sync");
    expect(sync?.body).toEqual(script.body);
    expect(sync?.body.entry).toBe("ui_script_orders_ssync");
    expect(back.manifests.find((manifest) => manifest.path === "orders/handle")?.body).toEqual(
      flow.body,
    );
    expect(renderResourceFiles(back.manifests, platformKinds)).toEqual(files);
  });

  test("generated bodies of awkward strings survive the trip", () => {
    const awkward = ["no", "yes", "null", "~", "1e3", "0x1F", "2026-11-13", "", " lead", "a: b"];
    awkward.push("# not a comment", "- dash", "multi\nline\n", "'q'", '"dq"', "{a}", "*x", "é中");
    let seed = 11;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const pick = () => awkward[Math.floor(random() * awkward.length)] as string;
    const value = (depth: number): unknown => {
      const roll = random();
      if (depth > 3 || roll < 0.35) return pick();
      if (roll < 0.45) return Math.floor(random() * 1000) - 500;
      if (roll < 0.5) return random() < 0.5;
      if (roll < 0.55) return null;
      if (roll < 0.75)
        return Array.from({ length: Math.floor(random() * 4) }, () => value(depth + 1));
      return Object.fromEntries(
        Array.from({ length: Math.floor(random() * 4) }, (_, index) => [
          `k${index}`,
          value(depth + 1),
        ]),
      );
    };
    for (let round = 0; round < 300; round++) {
      const manifest: BundleManifest = {
        kind: "variable",
        schemaVersion: 1,
        path: `gen/v${round}`,
        ownership: "ui",
        body: { description: pick(), extra: value(0) },
      };
      const files = renderResourceFiles([manifest], platformKinds);
      const back = parseResourceFiles(files);
      expect(back.problems).toEqual([]);
      expect(back.manifests[0]?.body).toEqual(manifest.body);
      expect(renderResourceFiles(back.manifests, platformKinds)).toEqual(files);
    }
  });

  test("no two paths share an entry", () => {
    const paths = ["a/b", "a_b", "a-b", "a/b_c", "a_b/c", "a-b-c", "a_sb", "a_ub"];
    expect(new Set(paths.map((path) => entryFor("script", path))).size).toBe(paths.length);
    expect(entryFor("script", "orders/send-to_erp")).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  test("what is wrong with the files is said, naming each file", () => {
    const { manifests, problems } = parseResourceFiles([
      { path: "README.md", content: "" },
      { path: "Orders/Sync.script.yaml", content: "schemaVersion: 1\nbody: {}\n" },
      { path: "bad.variable.yaml", content: "schemaVersion: 1\nbody: [unclosed\n" },
      { path: "nobody.variable.yaml", content: "schemaVersion: 1\n" },
      { path: "extra.variable.yaml", content: "schemaVersion: 1\nbody: {}\npath: other\n" },
      { path: "lonely.script.ts", content: "export default async () => 1;\n" },
      { path: "bare.script.yaml", content: "schemaVersion: 1\nbody: {}\n" },
      { path: "note.variable.ts", content: "x" },
      { path: "note.variable.yaml", content: "schemaVersion: 1\nbody: {}\n" },
      { path: "twice.variable.yaml", content: "schemaVersion: 1\nbody: {}\n" },
      { path: "twice.event.yaml", content: "schemaVersion: 1\nbody: {}\n" },
      { path: "ok/fine.variable.yaml", content: "schemaVersion: 1\nbody:\n  default: a\n" },
    ]);
    expect(problems).toEqual([
      'Orders/Sync.script.yaml: "Orders/Sync" is not a resource path. Use lowercase letters, digits, hyphens and underscores, in folders.',
      "README.md: is not named <path>.<kind>.yaml or <path>.<kind>.ts.",
      expect.stringMatching(/^bad\.variable\.yaml: is not valid YAML\./),
      "bare.script.yaml: needs its source beside it, as bare.script.ts.",
      "extra.variable.yaml: has keys other than schemaVersion and body: path.",
      "nobody.variable.yaml: needs a body.",
      "twice.variable.yaml: the path twice is already used by twice.event.yaml.",
      "lonely.script.ts: has no lonely.script.yaml beside it.",
      "note.variable.ts: a variable has no source.",
    ]);
    expect(manifests.map((manifest) => manifest.path)).toEqual(["note", "ok/fine", "twice"]);
  });
});

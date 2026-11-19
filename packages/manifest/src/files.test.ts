import { describe, expect, test } from "vitest";
import type { BundleManifest } from "./bundle.js";
import { renderSchemas } from "./emit.js";
import {
  entryFor,
  ignoredFolder,
  movedFile,
  ontoWritten,
  parseRepositoryConfig,
  parseRepositoryFiles,
  parseResourceFiles,
  renderRepositoryFiles,
  renderResourceFiles,
  sameResourceFile,
} from "./files.js";
import { platformKinds } from "./kinds.js";
import { validateJson } from "./registry.js";

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
      { path: "extra.variable.yaml", content: "schemaVersion: 1\nbody: {}\nowner: me\n" },
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
      "extra.variable.yaml: has keys other than key, path, title, schemaVersion and body: owner.",
      "nobody.variable.yaml: needs a body.",
      "twice.variable.yaml: the path twice is already used by twice.event.yaml.",
      "lonely.script.ts: has no lonely.script.yaml beside it.",
      "note.variable.ts: a variable has no source.",
    ]);
    expect(manifests.map((manifest) => manifest.path)).toEqual(["note", "ok/fine", "twice"]);
  });
});

describe("what a file says beside its body", () => {
  const kinds = new Set(platformKinds.map((kind) => kind.kind));
  const variable = (extra = "") => `${extra}schemaVersion: 1\nbody:\n  default: "5"\n`;

  test("a key and a title are read, written back only when they say something, and the bytes of a file without them do not move", () => {
    const plain = parseResourceFiles([{ path: "limits/size.variable.yaml", content: variable() }]);
    expect(plain.manifests[0]).toEqual({
      kind: "variable",
      schemaVersion: 1,
      path: "limits/size",
      ownership: "ui",
      body: { default: "5" },
    });
    expect(renderResourceFiles(plain.manifests, platformKinds)[0]?.content).toBe(variable());

    const moved = parseResourceFiles([
      {
        path: "lending/limits/size.variable.yaml",
        content: variable("key: limits/size\ntitle: Batch size\n"),
      },
    ]);
    expect(moved.problems).toEqual([]);
    expect(moved.manifests[0]).toMatchObject({
      path: "lending/limits/size",
      key: "limits/size",
      title: "Batch size",
    });
    expect(renderResourceFiles(moved.manifests, platformKinds)).toEqual([
      {
        path: "lending/limits/size.variable.yaml",
        content: variable("key: limits/size\ntitle: Batch size\n"),
      },
    ]);
    // A key that is the path says nothing, and is not written.
    const same = parseResourceFiles([
      { path: "limits/size.variable.yaml", content: variable("key: limits/size\n") },
    ]);
    expect(renderResourceFiles(same.manifests, platformKinds)[0]?.content).toBe(variable());
  });

  test("a script's code is named by its key, so moving it leaves the code's name as it was", () => {
    const yaml =
      "input: {}\noutput: {}\ntimeoutSeconds: 30\nretries: { limit: 0, delaySeconds: 0, backoff: false }\nuses: { connections: [], secrets: [], variables: [] }\n"
        .split("\n")
        .filter(Boolean)
        .map((line) => `  ${line}`)
        .join("\n");
    const files = (path: string, head = "") => [
      { path: `${path}.script.yaml`, content: `${head}schemaVersion: 1\nbody:\n${yaml}\n` },
      { path: `${path}.script.ts`, content: "export default async () => ({});\n" },
    ];
    const before = parseResourceFiles(files("requests/submit")).manifests[0];
    const after = parseResourceFiles(files("lending/file", "key: requests/submit\n")).manifests[0];
    expect(after?.body.entry).toBe(before?.body.entry);
    expect(after?.path).toBe("lending/file");
  });

  test("a key or a path that is not written as one, and a key used twice, are said by file", () => {
    expect(
      parseResourceFiles([
        { path: "a.variable.yaml", content: variable("key: Not A Key\n") },
        { path: "b.variable.yaml", content: variable("key: shared\n") },
        { path: "c.variable.yaml", content: variable("key: shared\n") },
        { path: "d.variable.yaml", content: variable("title: 4\n") },
      ]).problems,
    ).toEqual([
      "a.variable.yaml: its key is written as a path is: lowercase letters, digits, hyphens and underscores, in folders.",
      "c.variable.yaml: the key shared is already the key of b.variable.yaml. A key belongs to one resource.",
      "d.variable.yaml: its title must be text.",
    ]);
  });

  test("files are found anywhere in a repository, each getting its path from the root it is under", () => {
    const parsed = parseRepositoryFiles(
      [
        { path: "platform/limits/size.variable.yaml", content: variable() },
        { path: "src/lending/limits/count.variable.yaml", content: variable() },
        { path: "src/Features/Desk/open.variable.yaml", content: variable("path: desk/open\n") },
        {
          path: "docs/notes/elsewhere.variable.yaml",
          content: variable("path: notes/elsewhere\n"),
        },
        { path: "docs/lost.variable.yaml", content: variable() },
        // Nobody's: not a kind, a test, a config, and code beside no resource.
        { path: "src/orders.test.ts", content: "" },
        { path: "vite.config.ts", content: "" },
        { path: "src/helpers.script.ts", content: "export const x = 1;" },
        {
          path: "src/lending/tech-desk.group.yaml",
          content: "title: Tech Desk\nschemaVersion: 1\n",
        },
      ],
      { folder: "platform", roots: ["src"], kinds },
    );
    expect(parsed.problems).toEqual([
      "docs/lost.variable.yaml: is outside every folder that gives a resource its path (platform, src). Say its path in the file, as path: <path>, or keep it under one of them.",
    ]);
    expect(parsed.manifests.map((one) => [one.path, one.source?.file ?? null])).toEqual([
      ["notes/elsewhere", "docs/notes/elsewhere.variable.yaml"],
      // Where the console would have written it: it need not say where it is.
      ["limits/size", null],
      ["desk/open", "src/Features/Desk/open.variable.yaml"],
      ["lending/limits/count", "src/lending/limits/count.variable.yaml"],
    ]);
    expect(parsed.files.get("lending/limits/count")).toBe("src/lending/limits/count.variable.yaml");
  });

  test("a repository says its roots and what to leave unread in volvel.yaml", () => {
    expect(parseRepositoryConfig(undefined)).toEqual({
      config: { roots: [], ignore: [] },
      problems: [],
    });
    const read = parseRepositoryConfig("roots: [src/, ./features]\nignore:\n  - vendor\n");
    expect(read).toEqual({
      config: { roots: ["src", "features"], ignore: ["vendor"] },
      problems: [],
    });
    expect(ignoredFolder("vendor/lib", read.config)).toBe(true);
    expect(ignoredFolder("src/node_modules", read.config)).toBe(true);
    expect(ignoredFolder(".platform", read.config)).toBe(true);
    expect(ignoredFolder("src/lending", read.config)).toBe(false);
    expect(parseRepositoryConfig("roots: src\nfolders: [a]\n").problems).toEqual([
      "volvel.yaml: has keys other than roots and ignore: folders.",
      "volvel.yaml: roots is a list of folders.",
    ]);
  });
});

describe("the published schema of a file", () => {
  const schema = (name: string) =>
    JSON.parse(renderSchemas()[`files/${name}.v1.schema.json`] ?? "{}");

  test("accepts what the reader accepts, and names a key it does not know", () => {
    const variable = schema("variable");
    expect(
      validateJson(variable, {
        key: "limits/size",
        path: "lending/limits/size",
        title: "Batch size",
        schemaVersion: 1,
        body: { default: "5" },
      }),
    ).toEqual([]);
    expect(validateJson(variable, { schemaVersion: 1, body: {}, owner: "me" })).toEqual([
      expect.objectContaining({ message: expect.stringContaining("owner") }),
    ]);
    // A script's code is in the file beside it, so its file says neither entry nor source.
    expect(Object.keys(schema("script").properties.body.properties)).not.toContain("source");
    expect(schema("script").properties.body.required).not.toContain("entry");
    // One of a tenant's access has a key and no path, and may be nothing but a title.
    expect(validateJson(schema("group"), { title: "Tech Desk", schemaVersion: 1 })).toEqual([]);
    expect(Object.keys(schema("group").properties)).not.toContain("path");
  });
});

describe("files written back where a repository keeps them", () => {
  const kinds = new Set(platformKinds.map((kind) => kind.kind));
  const options = { folder: "platform", roots: ["src"] };
  const files = [
    {
      path: "platform/limits/size.variable.yaml",
      content: 'schemaVersion: 1\nbody:\n  default: "1"\n',
    },
    {
      path: "src/lending/limit.variable.yaml",
      content: 'schemaVersion: 1\nbody:\n  default: "5"\n',
    },
    {
      path: "tools/keep.variable.yaml",
      content: 'path: lending/retention\nschemaVersion: 1\nbody:\n  default: "30"\n',
    },
    {
      path: "src/requests/submit.script.yaml",
      content: "key: old/submit\nschemaVersion: 1\nbody:\n  timeoutSeconds: 30\n",
    },
    { path: "src/requests/submit.script.ts", content: "export default async () => 1;\n" },
  ];

  test("each file comes back at its own place with its own bytes, and says its path only when its place does not", () => {
    const parsed = parseRepositoryFiles(files, { ...options, kinds });
    expect(parsed.problems).toEqual([]);
    expect(renderRepositoryFiles(parsed.manifests, platformKinds, options)).toEqual(
      [...files].sort((a, b) => (a.path < b.path ? -1 : 1)),
    );
    // A repository that does not list src as a root: the file there has to say its path.
    const limit = parsed.manifests.filter((manifest) => manifest.path === "lending/limit");
    expect(
      renderRepositoryFiles(limit, platformKinds, { folder: "platform", roots: [] })[0]?.content,
    ).toBe('path: lending/limit\nschemaVersion: 1\nbody:\n  default: "5"\n');
  });

  test("a file named for the path moves with a rename, and one that says its path stays", () => {
    expect(
      movedFile("src/lending/limit.variable.yaml", "variable", "lending/limit", "lending/cap"),
    ).toBe("src/lending/cap.variable.yaml");
    expect(
      movedFile("tools/keep.variable.yaml", "variable", "lending/retention", "lending/keep"),
    ).toBe("tools/keep.variable.yaml");
  });

  test("two files say the same whatever their comments, order and quoting, and source only when identical", () => {
    expect(
      sameResourceFile(
        "a.variable.yaml",
        "# Ours\nbody: { default: '5' }\nschemaVersion: 1\n",
        'schemaVersion: 1\nbody:\n  default: "5"\n',
      ),
    ).toBe(true);
    expect(
      sameResourceFile(
        "a.variable.yaml",
        "schemaVersion: 1\nbody: {}\n",
        "schemaVersion: 2\nbody: {}\n",
      ),
    ).toBe(false);
    expect(sameResourceFile("a.script.ts", "export default 1;\n", "export default 1; \n")).toBe(
      false,
    );
  });
});

describe("a change written into a file as its author wrote it", () => {
  const written = [
    "# How the desk lends.",
    "schemaVersion: 1",
    "",
    "body:",
    "  # Two weeks, unless the desk says otherwise.",
    "  default: '14' # days",
    "  description: How long a loan lasts.",
    "  tags: [lending, desk]",
    "",
  ].join("\n");

  test("only what is said differently changes: comments, quotes, blank lines and order stay", () => {
    const next =
      'schemaVersion: 1\nbody:\n  description: How long a loan lasts.\n  default: "21"\n  tags:\n    - lending\n    - desk\n';
    expect(ontoWritten(written, next)).toBe(written.replace("'14'", "'21'"));
    expect(ontoWritten(written, written)).toBe(written);
  });

  test("a key that is new goes where it belongs, and one that is gone leaves with its comment", () => {
    const next =
      "key: loans/days\ntitle: Loan length\nschemaVersion: 1\nbody:\n  description: How long a loan lasts.\n  tags:\n    - lending\n";
    expect(ontoWritten(written, next)).toBe(
      [
        "# How the desk lends.",
        "key: loans/days",
        "title: Loan length",
        "schemaVersion: 1",
        "",
        "body:",
        "  description: How long a loan lasts.",
        "  tags: [lending]",
        "",
      ].join("\n"),
    );
  });

  test("what it gives always says what was to be said, or is the console's own form", () => {
    const cases = [
      // A value of another shape.
      "schemaVersion: 1\nbody:\n  default:\n    from: env\n  description: How long a loan lasts.\n",
      // A list that grew, and text over several lines.
      'schemaVersion: 1\nbody:\n  default: "14"\n  description: "One line.\\nAnother."\n  tags:\n    - a\n    - b\n    - c\n',
    ];
    for (const next of cases) {
      const result = ontoWritten(written, next);
      expect(sameResourceFile("x.yaml", result, next)).toBe(true);
      expect(result).toContain("# How the desk lends.");
    }
    // An alias would change two places at once: what cannot be kept right is not kept.
    const shared = "schemaVersion: 1\nbody:\n  a: &one { n: 1 }\n  b: *one\n";
    const apart = "schemaVersion: 1\nbody:\n  a:\n    n: 2\n  b:\n    n: 1\n";
    expect(sameResourceFile("x.yaml", ontoWritten(shared, apart), apart)).toBe(true);
    // A file that cannot be read is replaced.
    expect(ontoWritten("body: [unclosed", cases[0] as string)).toBe(cases[0]);
  });
});

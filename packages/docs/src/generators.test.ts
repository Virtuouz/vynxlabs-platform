import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describeApi } from "@volvel/control-plane/testing";
import {
  fileSchemas,
  platformKinds,
  resourceFileName,
  TENANT_KINDS,
  tenantFileName,
} from "@volvel/manifest";
import { beforeAll, expect, test } from "vitest";
import { expected, GENERATED, stale, write } from "../generate.mjs";
import { apiPages } from "../generators/api.mjs";
import { generate } from "../generators/reference.mjs";
import { tablesOf } from "../generators/schema.mjs";

const pages = generate();
const text = (name) => pages.get(name) ?? "";
// biome-ignore lint/suspicious/noExplicitAny: the description is read as data
let description: any;
let api: Map<string, string>;
beforeAll(async () => {
  description = await describeApi("1.0.0");
  api = apiPages(description);
});

/** The part of a page after a heading, up to the next heading. */
const under = (page, heading) => {
  const from = page.indexOf(heading);
  expect(from, `${heading} is on the page`).toBeGreaterThan(-1);
  const rest = page.slice(from + heading.length);
  const next = rest.search(/\n#{1,3} /);
  return next === -1 ? rest : rest.slice(0, next);
};

test("a field only one form of a union needs is needed under that form's table and nowhere else (API-01)", () => {
  const flow = text("kinds/flow.md");
  expect(under(flow, '### `nodes.*.trigger` when `type` is `"schedule"`')).toMatch(
    /\| `nodes\.\*\.trigger\.cron` \| string \| Yes \|/,
  );
  expect(under(flow, '### `nodes.*.trigger` when `type` is `"manual"`')).not.toContain("cron");
  // The first table holds what every flow has, and no field of one form.
  const first = flow.slice(0, flow.indexOf("\n### "));
  expect(first).not.toContain("trigger.cron");
  // The same for a schema of forms at its top.
  expect(
    tablesOf({
      oneOf: [
        { properties: { kind: { const: "a" }, x: { type: "string" } }, required: ["kind", "x"] },
        { properties: { kind: { const: "b" }, y: { type: "string" } }, required: ["kind"] },
      ],
    }).map((table) => [table.form, table.fields.map((f) => `${f.path}:${f.required}`)]),
  ).toEqual([
    ["", []],
    ['`kind` is `"a"`', ["kind:true", "x:true"]],
    ['`kind` is `"b"`', ["kind:true", "y:false"]],
  ]);
});

test("every kind page names the file the manifest package writes (API-02, API-04)", () => {
  for (const kind of platformKinds) {
    const name = resourceFileName(kind.kind, "<path>");
    expect(text(`kinds/${kind.kind.replace(/_/g, "-")}.md`), kind.kind).toContain(`\`${name}\``);
  }
  expect(text("kinds/doc.md")).toContain("`docs/<path>.md`");
  expect(text("kinds/doc.md")).not.toContain("doc.yaml");
  for (const kind of TENANT_KINDS) {
    expect(text(`kinds/${kind.kind.replace(/_/g, "-")}.md`), kind.kind).toContain(
      `\`${tenantFileName(kind, "<key>")}\``,
    );
  }
});

test("the file's own fields and the article are on the kinds' pages (API-04)", () => {
  const index = text("kinds/index.md");
  for (const field of ["key", "path", "title", "schemaVersion"])
    expect(index).toContain(`\`${field}\``);
  expect(text("kinds/app.md")).toContain("What an app may say.");
  expect(text("kinds/app.md")).not.toContain("a app");
});

test("a field a file does not carry is not on its kind's page (API-03)", () => {
  for (const kind of ["script", "connector", "trigger-source"]) {
    const page = text(`kinds/${kind}.md`);
    expect(page, kind).not.toMatch(/\| `entry` \|/);
    expect(page, kind).not.toMatch(/\| `source` \|/);
  }
  // Every field on a page is one the file's schema has.
  for (const { kind, schema } of fileSchemas()) {
    const roots = new Set(Object.keys(schema.properties.body.properties ?? {}));
    const page = text(`kinds/${kind.replace(/_/g, "-")}.md`);
    for (const found of page.matchAll(/^\| `([^`.*]+)[`.]/gm)) {
      if (["Field"].includes(found[1])) continue;
      expect(roots.has(found[1]) || roots.size === 0, `${kind}: ${found[1]}`).toBe(true);
    }
  }
});

test("a kind's table says defaults, values, limits and patterns (API-05)", () => {
  const flow = text("kinds/flow.md");
  expect(flow).toContain("Default 300.");
  expect(flow).toContain("`hmac-sha256`, `hmac-sha1`");
  expect(flow).toContain("Maximum 86400.");
  expect(flow).toMatch(/Pattern `\^\[a-z\]\[a-z0-9_\]\*\$`/);
});

test("there is one page of the API for each tag, and each route is on its tag's page (API-06)", () => {
  const tags = description.tags.map((tag) => tag.name);
  expect(tags.length).toBe(33);
  for (const tag of tags) {
    const name = `api/${tag.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`;
    expect(api.has(name), name).toBe(true);
  }
  expect([...api.keys()].filter((name) => name !== "api/index.md").length).toBe(tags.length);
  // The route made for a test is not the API's, and no operation is left on a page of "other".
  expect(api.has("api/other.md")).toBe(false);
  for (const [path, item] of Object.entries(description.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (!operation.tags) continue;
      const tag = operation.tags[0];
      const page = api.get(`api/${tag.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`);
      expect(page, `${method} ${path}`).toContain(
        `## \`${method.toUpperCase()} ${path.replace(/^\/api\/v1/, "")}\``,
      );
    }
  }
});

test("a route says what it needs in its own words, and what it takes and answers (API-06)", () => {
  const all = [...api.values()].join("\n");
  expect(all).not.toContain("Decided by what is asked for");
  const custom = Object.values(description.paths)
    .flatMap((item) => Object.values(item))
    .find((operation) => operation["x-access"]?.kind === "custom");
  expect(all).toContain(custom["x-access"].says.replace(/^Needs /, ""));
  const audit = api.get("api/audit.md");
  expect(audit).toContain("**Needs:** `audit:read` on the instance.");
  expect(audit).toContain("**Parameters**");
  expect(audit).toContain("**200 answer**");
  const sso = api.get("api/single-sign-on.md");
  expect(sso).toContain("**Request body**");
});

test("the sign-in library's routes are on one page, and the ones the instance has off are not (API-07)", () => {
  const page = api.get("api/sign-in.md");
  expect(page).toContain("`POST /auth/sign-in/email`");
  for (const off of ["sign-up/email", "sign-in/social", "change-email", "delete-user"]) {
    expect(page).not.toContain(`/auth/${off}`);
  }
  expect(api.get("api/index.md")).toContain("## Signing in");
});

test("the API's pages are among the generated ones, so a route that changed makes them old (API-14, API-23)", async () => {
  const files = await expected();
  expect(files.has("develop/reference/api/index.md")).toBe(true);
  expect(files.has("openapi.json")).toBe(true);
  expect(files.get("develop/reference/index.md")).toContain("(api/index)");
  await write();
  expect(await stale()).toEqual([]);
  for (const name of ["develop/reference/api/audit.md", "openapi.json"]) {
    const file = join(GENERATED, name);
    const kept = readFileSync(file, "utf8");
    try {
      writeFileSync(file, `${kept}\nA route that has since changed.\n`);
      expect(await stale()).toContain(`generated/${name} is not what the code says now.`);
    } finally {
      writeFileSync(file, kept);
    }
  }
});

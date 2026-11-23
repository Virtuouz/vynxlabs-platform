import { describe, expect, test } from "vitest";
import {
  checkTenantResources,
  parseTenantFiles,
  renderTenantFiles,
  type TenantResource,
} from "./tenant.js";

const desk: TenantResource = {
  kind: "group",
  key: "tech-desk",
  body: {
    title: "Tech Desk",
    description: "Lends and repairs devices.",
    membership: { sso: { values: ["it-tech-desk"] } },
  },
};
const lender: TenantResource = {
  kind: "tenant_role",
  key: "device_lender",
  body: { description: "Lends devices.", permissions: ["run:write", "data:read"] },
};
const binding: TenantResource = {
  kind: "tenant_binding",
  key: "tech-desk-lends",
  body: {
    role: "device_lender",
    principal: { type: "group", key: "tech-desk" },
    workspace: "main",
  },
};

describe("a tenant's access as files", () => {
  test("is written one file each, with the title beside the body, and read back the same", () => {
    const files = renderTenantFiles([binding, desk, lender]);
    expect(files.map((file) => file.path)).toEqual([
      "bindings/tech-desk-lends.tenant_binding.yaml",
      "groups/tech-desk.group.yaml",
      "roles/device_lender.tenant_role.yaml",
    ]);
    expect(files[1]?.content).toBe(
      [
        "title: Tech Desk",
        "schemaVersion: 1",
        "body:",
        "  description: Lends and repairs devices.",
        "  membership:",
        "    sso:",
        "      values:",
        "        - it-tech-desk",
        "",
      ].join("\n"),
    );
    expect(parseTenantFiles(files)).toEqual({ resources: [lender, desk, binding], problems: [] });
  });

  test("a file's key is its name, wherever it is kept, unless it says another", () => {
    const parsed = parseTenantFiles([
      { path: "src/lending/tech-desk.group.yaml", content: "title: Tech Desk\nschemaVersion: 1\n" },
      {
        path: "tenant/groups/desk.group.yaml",
        content: "key: service-desk\ntitle: Service Desk\nschemaVersion: 1\n",
      },
      // Not a tenant kind: somebody else's file, and left alone.
      { path: "platform/orders.table.yaml", content: "schemaVersion: 1\nbody: {}\n" },
      { path: "vite.config.ts", content: "export default {};" },
    ]);
    expect(parsed.problems).toEqual([]);
    expect(parsed.resources.map((one) => [one.kind, one.key, one.body.title])).toEqual([
      ["group", "service-desk", "Service Desk"],
      ["group", "tech-desk", "Tech Desk"],
    ]);
  });

  test("what is wrong with a file names the file", () => {
    expect(
      parseTenantFiles([
        { path: "tenant/a.group.yaml", content: "title: A\nschemaVersion: 1\nname: A\n" },
        { path: "tenant/b.group.yaml", content: "title: [" },
        { path: "tenant/c.group.yaml", content: "title: C\n" },
      ]).problems,
    ).toEqual([
      "tenant/a.group.yaml: has keys other than key, title, schemaVersion and body: name.",
      expect.stringMatching(/^tenant\/b\.group\.yaml: is not valid YAML\. /),
      "tenant/c.group.yaml: needs schemaVersion: 1.",
    ]);
  });
});

describe("what is wrong with a tenant's access", () => {
  test("nothing, for a set that holds together", () => {
    expect(checkTenantResources([desk, lender, binding])).toEqual([]);
  });

  test("a body, a key, a permission and a binding to nothing are each named", () => {
    expect(
      checkTenantResources([
        { kind: "group", key: "Tech Desk", body: { title: "Tech Desk" } },
        { kind: "group", key: "no-title", body: {} },
        { kind: "tenant_role", key: "device-lender", body: { permissions: ["run:write"] } },
        { kind: "tenant_role", key: "odd", body: { permissions: ["nonsense:write"] } },
        {
          ...binding,
          key: "to-nothing",
          body: { role: "viewer", principal: { type: "group", key: "gone" } },
        },
        desk,
        desk,
        { kind: "member", key: "ada", body: {} },
      ]),
    ).toEqual([
      "group Tech Desk: a key is lowercase letters, digits, hyphens and underscores, starting with a letter or a digit.",
      "group no-title (groups/no-title.group.yaml): /body must have required property 'title'",
      "tenant role device-lender: a role's key is its name: lowercase letters, digits and underscores, starting with a letter.",
      'tenant role odd: /body/permissions "nonsense:write" is not a permission a role can give.',
      'tenant binding to-nothing: /body/principal names the group "gone", which is not defined.',
      "group tech-desk: is defined twice. A key belongs to one group.",
      'member ada: "member" is not a kind a tenant\'s access is made of.',
    ]);
  });

  test("a role and a binding take a title, as every resource file has one", () => {
    expect(
      checkTenantResources([
        {
          kind: "tenant_role",
          key: "lender",
          body: { title: "Lender", permissions: ["run:write"] },
        },
        { kind: "tenant_binding", key: "b", body: { ...binding.body, title: "Lend" } },
        desk,
      ]),
    ).toEqual([]);
  });

  test("a field a kind does not take names the file it is in", () => {
    expect(
      checkTenantResources([
        { kind: "tenant_role", key: "lender", body: { permissions: ["run:write"], colour: "red" } },
      ]),
    ).toEqual([
      "tenant role lender (roles/lender.tenant_role.yaml): /body must NOT have additional properties (colour)",
    ]);
  });

  test("a title in a role's or a binding's file is read and set aside, as nothing keeps it", () => {
    const read = parseTenantFiles([
      {
        path: "tenant/lender.tenant_role.yaml",
        content: "title: Lender\nschemaVersion: 1\nbody:\n  permissions: [run:write]\n",
      },
    ]);
    expect(read.problems).toEqual([]);
    expect(read.resources[0]?.body).toEqual({ permissions: ["run:write"] });
  });

  test("a binding may name what the tenant has beside the set", () => {
    expect(checkTenantResources([binding], [{ kind: "group", key: "tech-desk" }])).toEqual([]);
  });
});

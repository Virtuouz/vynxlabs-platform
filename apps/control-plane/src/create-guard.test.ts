import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { startTestApp, type TestApp } from "./testing.js";

/**
 * Phase 22 M3: a create never overwrites. `create: true` says a save makes something
 * new, so a path already held by a draft or a deployed resource is refused.
 */

let t: TestApp;
let tenant: string;
let dev: string;
const ws = () => `/tenants/${tenant}/workspaces/${dev}`;

const script = (code: string) => ({
  kind: "script",
  schemaVersion: 1,
  body: {
    description: "",
    input: { type: "object" },
    output: { type: "object" },
    timeoutSeconds: 60,
    retries: { limit: 0, delaySeconds: 0, backoff: false },
    uses: { connections: [], secrets: [], variables: [] },
    source: { language: "typescript", code },
  },
});
const ONE = "export default async () => ({ one: 1 });\n";
const TWO = "export default async () => ({ two: 2 });\n";

const sourceAt = async (path: string) =>
  ((await t.admin.get(`${ws()}/drafts/${path}`)).body.body as { source: { code: string } }).source
    .code;

beforeAll(async () => {
  t = await startTestApp();
  tenant = (await t.admin.post("/tenants", { slug: "guard", name: "Guard", addCreator: true })).body
    .id;
  dev = (
    await t.admin.post(`/tenants/${tenant}/workspaces`, { slug: "dev", name: "Dev", type: "dev" })
  ).body.id;
  await t.admin.put(`${ws()}/drafts/live/one`, script(ONE));
  expect((await t.admin.post(`${ws()}/changes/deploy`, {})).status).toBeLessThan(300);
  await t.admin.put(`${ws()}/drafts/only/draft`, script(ONE));
});
afterAll(async () => {
  await t?.stop();
});

describe("a create never overwrites", () => {
  test("a create on a free path succeeds", async () => {
    const made = await t.admin.put(`${ws()}/drafts/free/path`, { ...script(ONE), create: true });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    expect(made.body.revision).toBe(1);
  });

  test("a create over a draft is refused as path_taken, and the draft is unchanged", async () => {
    const refused = await t.admin.put(`${ws()}/drafts/only/draft`, {
      ...script(TWO),
      create: true,
    });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("path_taken");
    expect(await sourceAt("only/draft")).toBe(ONE);
  });

  test("a create over a deployed resource is refused, and no draft is made", async () => {
    const refused = await t.admin.put(`${ws()}/drafts/live/one`, {
      ...script(TWO),
      create: true,
    });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("path_taken");
    expect((await t.admin.get(`${ws()}/drafts/live/one`)).status).toBe(404);
  });

  test("a save with a revision, and a save with neither, are as they were", async () => {
    const draft = (await t.admin.get(`${ws()}/drafts/only/draft`)).body;
    const kept = await t.admin.put(`${ws()}/drafts/only/draft`, {
      ...script(TWO),
      revision: draft.revision,
    });
    expect(kept.status, JSON.stringify(kept.body)).toBe(200);
    const plain = await t.admin.put(`${ws()}/drafts/live/one`, script(TWO));
    expect(plain.status, JSON.stringify(plain.body)).toBe(200);
    expect(await sourceAt("live/one")).toBe(TWO);
  });

  test("the batch route refuses a create over a held path, and makes none of the batch", async () => {
    const refused = await t.admin.post(`${ws()}/drafts/batch`, {
      changes: [
        { path: "docs/fresh", source: "# Fresh\n", create: true },
        { path: "only/draft", ...script(ONE), create: true },
      ],
    });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("path_taken");
    expect((await t.admin.get(`${ws()}/drafts/docs/fresh`)).status).toBe(404);
  });
});

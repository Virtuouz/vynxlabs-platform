import { afterAll, beforeAll, expect, test } from "vitest";
import { startTestApp, type TestApp } from "./testing.js";

/**
 * What changed since a script last succeeded (phase 15, P3-7): the last
 * success before a run, its version beside this run's, and whether the input
 * differs. Runs are marked as finished directly: no worker runs them here.
 */

let t: TestApp;
let ws: string;

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

async function start(input: unknown) {
  const made = await t.admin.post(`${ws}/runs`, { script: "stock/check", input });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body.id as string;
}
async function finish(id: string, status: "succeeded" | "failed") {
  const started = new Date(Date.now() - 1500);
  await t.db
    .updateTable("run")
    .set({ status, started_at: started, finished_at: new Date(started.getTime() + 1200) })
    .where("id", "=", id)
    .execute();
}
const previous = async (id: string) =>
  (await t.admin.get(`${ws}/runs/${id}/previous-success`)).body;

beforeAll(async () => {
  t = await startTestApp();
  const tenant = (await t.admin.post("/tenants", { slug: "cmp", name: "Cmp", addCreator: true }))
    .body.id;
  const dev = (
    await t.admin.post(`/tenants/${tenant}/workspaces`, { slug: "dev", name: "Dev", type: "dev" })
  ).body.id;
  ws = `/tenants/${tenant}/workspaces/${dev}`;
  await t.admin.put(`${ws}/drafts/stock/check`, script("export default async () => ({ v: 1 });\n"));
  expect((await t.admin.post(`${ws}/changes/deploy`, {})).status).toBeLessThan(300);
});
afterAll(async () => {
  await t?.stop();
});

test("a run that never succeeded before has nothing to compare with", async () => {
  const first = await start({ n: 1 });
  await finish(first, "succeeded");
  expect(await previous(first)).toMatchObject({
    run: null,
    versionChanged: false,
    inputChanged: null,
  });
});

test("the last success on the same version and input is named, and nothing changed", async () => {
  const runs = (await t.admin.get(`${ws}/runs?script=stock/check`)).body.items as { id: string }[];
  const succeeded = runs[0]?.id as string;
  const failing = await start({ n: 1 });
  await finish(failing, "failed");
  const answer = await previous(failing);
  expect(answer).toMatchObject({
    run: { id: succeeded, bundleVersion: 1, durationMs: 1200 },
    bundleVersion: 1,
    versionChanged: false,
    inputChanged: false,
  });
});

test("after a deploy and with other input, the last success says both changed", async () => {
  const runs = (await t.admin.get(`${ws}/runs?script=stock/check&status=succeeded`)).body.items as {
    id: string;
  }[];
  const succeeded = runs[0]?.id as string;
  await t.admin.put(`${ws}/drafts/stock/check`, script("export default async () => ({ v: 2 });\n"));
  expect((await t.admin.post(`${ws}/changes/deploy`, {})).status).toBeLessThan(300);
  const failing = await start({ n: 2 });
  await finish(failing, "failed");
  const answer = await previous(failing);
  expect(answer).toMatchObject({
    run: { id: succeeded, bundleVersion: 1 },
    bundleVersion: 2,
    versionChanged: true,
    inputChanged: true,
  });
  // A run in another workspace, or none at all, is not found.
  expect(
    (await t.admin.get(`${ws}/runs/01a1e7f7-0000-7000-8000-000000000999/previous-success`)).status,
  ).toBe(404);
});

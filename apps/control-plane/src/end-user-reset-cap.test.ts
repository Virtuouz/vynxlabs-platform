import { newId } from "@volvel/db";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createRequestedResetToken, readPasswordToken } from "./kernel/endusers.js";
import { startTestApp, type TestApp } from "./testing.js";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
}, 60_000);
afterAll(async () => {
  await t?.stop();
});

test("p35 round two: past five good reset links the oldest is replaced, so a person who asks is never left without a new one", async () => {
  const tenantId = (await t.admin.post("/tenants", { slug: "reset-cap", name: "reset-cap" })).body
    .id as string;
  const user = await t.db
    .insertInto("end_user")
    .values({ id: newId(), tenant_id: tenantId, email: "pat@reset-cap.example", name: "Pat" })
    .returning("id")
    .executeTakeFirstOrThrow();
  const tokens: string[] = [];
  for (let i = 0; i < 7; i++) {
    const made = await t.db
      .transaction()
      .execute((trx) => createRequestedResetToken(trx, { id: user.id, tenantId }));
    expect(made, `request ${i + 1} got no link`).toBeDefined();
    tokens.push((made as { token: string }).token);
  }
  const good = await Promise.all(
    tokens.map((token) => readPasswordToken(t.db, tenantId, token).then(Boolean)),
  );
  // The last five asked for are good; the two oldest were replaced.
  expect(good).toEqual([false, false, true, true, true, true, true]);
});

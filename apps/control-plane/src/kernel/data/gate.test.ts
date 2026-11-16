import { expect, test } from "vitest";
import { HttpError } from "../errors.js";
import { TenantGate } from "./gate.js";

const later = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("a tenant past its share waits its turn, and the others do not wait at all", async () => {
  const gate = new TenantGate(1, 2000);
  const order: string[] = [];
  const slow = gate.run("a", async () => {
    await later(150);
    order.push("a1");
  });
  const queued = gate.run("a", async () => {
    order.push("a2");
  });
  await gate.run("b", async () => {
    order.push("b");
  });
  await Promise.all([slow, queued]);
  expect(order).toEqual(["b", "a1", "a2"]);
  expect(gate.open("a")).toBe(0);
});

test("one that waits too long is told the database is busy, and when to try again", async () => {
  const gate = new TenantGate(1, 100);
  const held = gate.run("a", () => later(300));
  const refused = await gate.run("a", async () => "ran").catch((error: unknown) => error);
  expect(refused).toBeInstanceOf(HttpError);
  expect(refused).toMatchObject({ statusCode: 503, problemCode: "busy" });
  expect((refused as HttpError).headers).toEqual({ "retry-after": "2" });
  await held;
  // Its place was given up: the next one gets a turn straight away.
  expect(await gate.run("a", async () => "ran")).toBe("ran");
});

test("a turn is handed on even when the work fails", async () => {
  const gate = new TenantGate(1, 1000);
  await expect(
    gate.run("a", async () => {
      throw new Error("no");
    }),
  ).rejects.toThrow("no");
  expect(await gate.run("a", async () => "ran")).toBe("ran");
});

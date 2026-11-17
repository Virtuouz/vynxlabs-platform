// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from "vitest";
import { objectAt, switchWorkspace } from "./Shell.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

const answer = (status: number) =>
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({}), { status }));

test("an address names an object another workspace may have", () => {
  expect(objectAt("scripts/edit/orders/sync")).toEqual({ path: "orders/sync" });
  expect(objectAt("scripts/orders/sync")).toEqual({ path: "orders/sync" });
  expect(objectAt("flows/orders/reorder")).toEqual({ path: "orders/reorder" });
  expect(objectAt("scripts/new")).toBeUndefined();
  expect(objectAt("runs/r1")).toBeUndefined();
  expect(objectAt("scripts")).toBeUndefined();
});

test("switching workspace keeps the object and its view when it is there too", async () => {
  history.replaceState(null, "", "/t/t1/workspaces/w1/scripts/orders/sync?tab=runs");
  answer(200);
  await switchWorkspace("t1", "w1", "w2", "scripts");
  expect(`${location.pathname}${location.search}`).toBe(
    "/t/t1/workspaces/w2/scripts/orders/sync?tab=runs",
  );
});

test("an object not there leads to the same section; a run never follows", async () => {
  history.replaceState(null, "", "/t/t1/workspaces/w1/scripts/orders/sync");
  answer(404);
  await switchWorkspace("t1", "w1", "w2", "scripts");
  expect(location.pathname).toBe("/t/t1/workspaces/w2/scripts");
  history.replaceState(null, "", "/t/t1/workspaces/w1/runs/r1");
  await switchWorkspace("t1", "w1", "w2", "runs");
  expect(location.pathname).toBe("/t/t1/workspaces/w2/runs");
  // A list's filters go with it.
  history.replaceState(null, "", "/t/t1/workspaces/w1/runs?status=failed");
  await switchWorkspace("t1", "w1", "w2", "runs");
  expect(`${location.pathname}${location.search}`).toBe("/t/t1/workspaces/w2/runs?status=failed");
});

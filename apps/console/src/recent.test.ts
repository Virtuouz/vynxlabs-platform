import { expect, test } from "vitest";
import { openedAt } from "./recent.ts";

test("what a page's address says was opened, for the palette's Recent list", () => {
  const ws = "/t/t1/workspaces/w1";
  expect(openedAt(`${ws}/scripts/edit/orders/sync`)).toEqual({
    kind: "script",
    ref: "orders/sync",
  });
  // A script's own page counts as much as its editor.
  expect(openedAt(`${ws}/scripts/orders/sync`)).toEqual({ kind: "script", ref: "orders/sync" });
  expect(openedAt(`${ws}/flows/edit/orders/flow`)).toEqual({ kind: "flow", ref: "orders/flow" });
  expect(openedAt(`${ws}/connections/erp`)).toEqual({ kind: "connection", ref: "erp" });
  expect(openedAt(`${ws}/events/order.placed`)).toEqual({ kind: "event", ref: "order.placed" });
  expect(openedAt(`${ws}/scripts/new`)).toBeUndefined();
  expect(openedAt(`${ws}/flows/new`)).toBeUndefined();
  expect(openedAt(`${ws}/runs`)).toBeUndefined();
  // A page, a variable and a data source by address; a saved query by the address's ?query=.
  expect(openedAt(`${ws}/docs/guides/start`)).toEqual({ kind: "doc", ref: "guides/start" });
  expect(openedAt(`${ws}/variables/region`)).toEqual({ kind: "variable", ref: "region" });
  expect(openedAt(`${ws}/sources/warehouse`)).toEqual({ kind: "data_source", ref: "warehouse" });
  expect(openedAt(`${ws}/queries`, "late-orders")).toEqual({ kind: "query", ref: "late-orders" });
  expect(openedAt(`${ws}/queries`)).toBeUndefined();
});

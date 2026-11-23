import { expect, test } from "vitest";
import { drawnGroups, drawnMeasure, readsAs } from "./kit/inspector/widgets/chartDrawer.tsx";
import type { Query } from "./kit/inspector/widgets/chartShared.tsx";

const query = {
  visual: {
    table: "appointments",
    groupBy: [{ column: "pet.species" }, { column: "clinic" }],
    measures: [
      { fn: "count", as: "count" },
      { fn: "sum", column: "fee", as: "fee_sum" },
    ],
  },
  columns: [],
} as unknown as Query;

test("w-builder 2: what is said along the bottom and up the side is what the axes are set to", () => {
  expect(drawnGroups(query, {})[0]?.column).toBe("pet.species");
  expect(drawnMeasure(query, {})?.as).toBe("count");
  const set = { x: "clinic", y: "fee_sum" };
  expect(drawnGroups(query, set)[0]?.column).toBe("clinic");
  expect(drawnGroups(query, set)[1]?.column).toBe("pet.species");
  expect(drawnMeasure(query, set)?.as).toBe("fee_sum");
  expect(readsAs(query, set, undefined).reads).toBe(
    "Reads as the sum of fee for each clinic, split by pet species.",
  );
  expect(readsAs(query, {}, undefined).reads).toBe(
    "Reads as the number of appointments for each pet species, split by clinic.",
  );
});

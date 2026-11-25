import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

// The example is not part of this package's project, so it is loaded by its path.
const { bookedFor } = (await import(
  fileURLToPath(
    new URL("../../../examples/fernhill/src/widgets/clinic-load/booked.ts", import.meta.url),
  )
)) as { bookedFor(visits: unknown, clinic: string): number };

const summary = (by: string, value: string) => ({
  breakdowns: [by],
  values: [value],
  rows: [
    { [by]: "northside", [value]: 14 },
    { [by]: "riverside", [value]: 9 },
  ],
});

test("reads the clinic and the count under whatever names the page's data gave them", () => {
  expect(bookedFor(summary("clinic", "visits"), "riverside")).toBe(9);
  expect(bookedFor(summary("clinic", "count"), "northside")).toBe(14);
  expect(bookedFor(summary("Clinic", "Count of rows"), "northside")).toBe(14);
});

test("is none for a clinic with no row, or with no data at all", () => {
  expect(bookedFor(summary("clinic", "visits"), "hilltop")).toBe(0);
  expect(bookedFor(undefined, "hilltop")).toBe(0);
});

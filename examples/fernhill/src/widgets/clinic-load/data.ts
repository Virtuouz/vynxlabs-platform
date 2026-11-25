import type { DataInput } from "@volvel/sdk";

/** What a page binds the Clinic load widget's two inputs to: today's visits by clinic, and the clinics. */
export const clinicLoadData = (): Record<string, DataInput> => ({
  visits: {
    source: {
      visual: {
        table: "appointments",
        filters: [
          { column: "starts_at", op: "last", value: { count: 1, unit: "day" } },
          { column: "status", op: "in", value: ["booked", "checked_in", "in_exam", "done"] },
        ],
        groupBy: [{ column: "clinic" }],
        measures: [{ fn: "count", as: "visits" }],
      },
    },
  },
  clinics: { source: { visual: { table: "clinics" } } },
});

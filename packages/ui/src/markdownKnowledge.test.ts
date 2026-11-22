import { expect, test } from "vitest";
import { knowledgeFrom } from "./markdownKnowledge.ts";

const knows = knowledgeFrom({
  terms: [
    { id: "status", term: "Status", short: "Where a visit stands.", page: { url: "/docs/status" } },
  ],
  resources: [
    {
      kind: "table",
      path: "invoices",
      description: "What clinics are billed.",
      columns: [{ name: "total", description: "In cents." }],
    },
  ],
  fields: { "table.columns.*.type": "What the column holds." },
});

test("a term is found by its id, or by the resource it names, and else is not found", () => {
  expect(knows.term?.({ id: "status" })).toEqual({
    short: "Where a visit stands.",
    href: "/docs/status",
  });
  expect(knows.term?.({ id: "nothing" })).toBeNull();
  expect(knows.term?.({ table: "invoices" })).toEqual({ short: "What clinics are billed." });
  expect(knows.term?.({ table: "invoices", column: "total" })).toEqual({ short: "In cents." });
  expect(knows.term?.({ table: "visits" })).toBeNull();
});

test("a field is described by the kind's own words, or not found", () => {
  expect(knows.field?.("table.columns.*.type")).toEqual({ description: "What the column holds." });
  expect(knows.field?.("table.nothing")).toBeNull();
});

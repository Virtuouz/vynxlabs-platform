import { describe, expect, test } from "vitest";
import { defineFlow, step, trigger, z } from "./index.js";

describe("a flow's options", () => {
  const flow = defineFlow({
    path: "orders/reorder",
    nodes: {
      start: trigger.manual({
        input: z.object({ sku: z.string(), quantity: z.number().int().positive() }),
      }),
      plain: trigger.manual(),
      each: step.foreach("trigger.items", { script: "orders/one", continueOnError: true }),
      ok: step.approval("Approve the order", {
        approvers: { groups: ["Practice managers"], roles: ["finance_lead"] },
      }),
    },
    edges: [
      ["start", "each"],
      ["plain", "each"],
      ["each", "ok"],
    ],
  });
  const nodes = (flow.toManifest("flow").body as { nodes: Record<string, Record<string, unknown>> })
    .nodes;

  test("a manual trigger carries the schema its input must match", () => {
    expect(nodes.start).toMatchObject({
      type: "trigger",
      trigger: {
        type: "manual",
        input: {
          type: "object",
          properties: { sku: { type: "string" }, quantity: { type: "integer" } },
          required: ["sku", "quantity"],
        },
      },
    });
    expect(nodes.plain).toEqual({ type: "trigger", trigger: { type: "manual" } });
  });

  test("a loop may carry on past a failed item, and an approval names who decides", () => {
    expect(nodes.each).toMatchObject({ type: "foreach", continueOnError: true });
    expect(nodes.ok).toMatchObject({
      type: "approval",
      approvers: { groups: ["Practice managers"], roles: ["finance_lead"] },
    });
  });
});

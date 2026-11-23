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

describe("a flow's choice of flow, tags and layout", () => {
  const flow = defineFlow({
    path: "orders/route",
    nodes: {
      at: trigger.schedule("0 6 * * *", { tags: ["trigger.cron"] }),
      hook: trigger.webhook({ tags: ["trigger.body.kind"] }),
      ev: trigger.event("orders/placed", { tags: ["event.payload.id"] }),
      each: step.foreach("trigger.items", {
        flowFrom: "item.flow",
        allow: ["orders/a", defineFlow({ path: "orders/b", nodes: {}, edges: [] })],
      }),
      sub: step.subflow("orders/a"),
      choose: step.subflow({ flowFrom: "trigger.flow", allow: ["orders/a"], input: "trigger" }),
    },
    edges: [],
    layout: { at: { x: 0, y: 10 }, each: { x: 200, y: 10 } },
  });
  const body = flow.toManifest("flow").body as {
    nodes: Record<string, Record<string, unknown>>;
    layout?: unknown;
  };

  test("a flow is chosen by an expression from a list", () => {
    expect(body.nodes.each).toMatchObject({
      type: "foreach",
      flowFrom: "item.flow",
      allow: ["orders/a", "orders/b"],
    });
    expect(body.nodes.choose).toEqual({
      type: "subflow",
      flowFrom: "trigger.flow",
      allow: ["orders/a"],
      input: "trigger",
    });
    expect(body.nodes.sub).toEqual({ type: "subflow", flow: "orders/a" });
  });

  test("triggers carry tags", () => {
    expect((body.nodes.at?.trigger as { tags?: string[] }).tags).toEqual(["trigger.cron"]);
    expect((body.nodes.hook?.trigger as { tags?: string[] }).tags).toEqual(["trigger.body.kind"]);
    expect((body.nodes.ev?.trigger as { tags?: string[] }).tags).toEqual(["event.payload.id"]);
  });

  test("positions are kept", () => {
    expect(body.layout).toEqual({ at: { x: 0, y: 10 }, each: { x: 200, y: 10 } });
  });
});

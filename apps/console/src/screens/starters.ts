/**
 * What a new script or flow can start from (08 §5.13). Each runs as it is,
 * with nothing to bind and nothing outside to reach, so a first run succeeds
 * before anything is changed.
 */

export interface ScriptStarter {
  id: string;
  label: string;
  about: string;
  /** The input schema the code declares, for the form that starts it. */
  input: Record<string, unknown>;
  code: string;
}

export const SCRIPT_STARTERS: ScriptStarter[] = [
  {
    id: "greet",
    label: "Greet someone",
    about: "Takes a name and says hello. The smallest script there is.",
    input: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    code: `import { type ScriptContext, z } from "@vynxlabs/sdk";

/** What it takes. Saving reads it, so a run's input is checked against it, and forms ask for it. */
export const input = z.object({
  name: z.string().describe("Who to greet"),
});

/** What runs. */
export default async function (given: z.infer<typeof input>, ctx: ScriptContext) {
  ctx.log.info("Started", { by: ctx.run.trigger.type });
  return { hello: given.name };
}
`,
  },
  {
    id: "totals",
    label: "Total some numbers",
    about: "Takes a list of amounts and gives back their total, count and average.",
    input: {
      type: "object",
      properties: { amounts: { type: "array", items: { type: "number" } } },
      required: ["amounts"],
    },
    code: `import { type ScriptContext, z } from "@vynxlabs/sdk";

export const input = z.object({
  amounts: z.array(z.number()).describe("The amounts to add up").default([12.5, 30, 7.25]),
});

/** Adds up what it is given, and says what it found. Run with nothing, it adds up an example. */
export default async function (given: Partial<z.infer<typeof input>>, ctx: ScriptContext) {
  const amounts = given.amounts ?? [12.5, 30, 7.25];
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  const count = amounts.length;
  ctx.log.info("Added up", { count, total });
  return { total, count, average: count === 0 ? 0 : total / count };
}
`,
  },
  {
    id: "scheduled",
    label: "A job on a schedule",
    about: "Takes nothing, says when it ran and what started it: the shape of a nightly job.",
    input: { type: "object", properties: {} },
    code: `import type { ScriptContext } from "@vynxlabs/sdk";

/**
 * A job a schedule starts. Give it a schedule from its page once it is
 * deployed; until then, run it by hand to see what it does.
 */
export default async function (_given: Record<string, never>, ctx: ScriptContext) {
  const startedAt = new Date().toISOString();
  ctx.log.info("The job ran", { startedAt, by: ctx.run.trigger.type });
  return { startedAt, by: ctx.run.trigger.type };
}
`,
  },
];

/** Whether `code` is a starter as it was given, so choosing another may replace it. */
export const untouchedStarter = (code: string | undefined) =>
  code === undefined || SCRIPT_STARTERS.some((starter) => starter.code === code);

export interface FlowStarter {
  id: string;
  label: string;
  about: string;
  body: {
    nodes: Record<string, Record<string, unknown>>;
    edges: { from: string; to: string; output?: string }[];
  };
}

export const FLOW_STARTERS: FlowStarter[] = [
  {
    id: "blank",
    label: "Started by hand",
    about: "A manual trigger, ready for its first step.",
    body: { nodes: { start: { type: "trigger", trigger: { type: "manual" } } }, edges: [] },
  },
  {
    id: "branch",
    label: "Decide, then answer",
    about: "Takes an amount, and goes one way above 100 and another below.",
    body: {
      nodes: {
        start: {
          type: "trigger",
          trigger: {
            type: "manual",
            input: {
              type: "object",
              properties: { amount: { type: "number" } },
              required: ["amount"],
            },
          },
        },
        size: {
          type: "branch",
          cases: [{ name: "large", when: "input.amount > 100" }],
        },
        large: { type: "set", values: { size: "'large'", amount: "input.amount" } },
        small: { type: "set", values: { size: "'small'", amount: "input.amount" } },
      },
      edges: [
        { from: "start", to: "size" },
        { from: "size", to: "large", output: "large" },
        { from: "size", to: "small", output: "otherwise" },
      ],
    },
  },
];

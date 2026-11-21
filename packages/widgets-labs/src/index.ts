/**
 * The labs pack: widgets Volvel tries before it ships them. It is written
 * against exactly what a developer's widget is (`@volvel/widgets`), and exists
 * to prove that nothing in the builder is made for the core pack alone. This
 * file holds definitions only, which are data; the views are in `../views`.
 */
import { defineWidget, type InspectorHint } from "@volvel/widgets";

const hint = (h: InspectorHint) => h;

const FORMAT = {
  type: "object",
  properties: {
    style: { enum: ["number", "currency", "percent"] },
    currency: { type: "string", pattern: "^[A-Z]{3}$" },
    minorUnits: { type: "boolean" },
    decimals: { type: "integer", minimum: 0, maximum: 6 },
  },
  required: ["style"],
  additionalProperties: false,
} as const;

/** Progress toward a target: a number, a bar and the share reached. */
export const goal = defineWidget({
  type: "labs/goal",
  version: "1.0.0",
  title: "Goal",
  description: "How far a number is toward a target",
  category: "understand",
  icon: "target",
  surfaces: ["app", "dashboard"],
  data: { value: { shape: "summary", values: { min: 1, max: 1 }, breakdowns: { min: 0, max: 0 } } },
  dataHints: [
    {
      of: "value",
      controls: [
        { control: "source", label: "Source" },
        { control: "measure", label: "Value" },
        { control: "conditions", label: "Only include", help: "For example: Status is Paid." },
      ],
    },
  ],
  config: {
    type: "object",
    properties: {
      target: {
        type: "number",
        exclusiveMinimum: 0,
        "x-volvel": hint({ tab: "display", control: "number", label: "Target", order: 1 }),
      },
      format: {
        ...FORMAT,
        "x-volvel": hint({
          tab: "display",
          control: "format",
          label: "Numbers look like",
          order: 2,
        }),
      },
      label: {
        type: "string",
        maxLength: 200,
        "x-volvel": hint({
          tab: "display",
          control: "text",
          label: "A line under it",
          help: "Such as “of $60,000 this month”.",
          order: 3,
        }),
      },
      goodWhen: {
        enum: ["up", "down"],
        "x-volvel": hint({
          tab: "display",
          level: "more",
          control: "segmented",
          label: "Good news is",
          choices: { up: "Up", down: "Down" },
          order: 4,
        }),
      },
      bands: {
        type: "boolean",
        "x-volvel": hint({
          tab: "display",
          level: "more",
          control: "switch",
          label: "Colour by how close",
          help: "Green when it is going well, amber when it is close, red when it is not.",
          order: 5,
        }),
      },
    },
    required: ["target"],
    additionalProperties: false,
  },
  defaults: { goodWhen: "up", bands: false },
  events: { click: { gives: "nothing", label: "When it is clicked" } },
  layout: { min: { w: 2, h: 2 }, default: { w: 3, h: 3 }, phone: "stack" },
});

/** Every widget of the labs pack, in the order "Add to page" offers them. */
export const LABS_WIDGETS = [goal] as const;

/**
 * The labs pack: widgets Volvel tries before it ships them. It is written
 * against exactly what a developer's widget is (`@volvel/widgets`), and exists
 * to prove that nothing in the builder is made for the core pack alone. This
 * file holds definitions only, which are data; the views are in `../views`.
 */
import { defineWidget, FORMAT_SCHEMA, type InspectorHint } from "@volvel/widgets";

const hint = (h: InspectorHint) => h;

const FORMAT = FORMAT_SCHEMA;

/** Progress toward a target: a number, a bar and the share reached. */
export const goal = defineWidget({
  type: "labs/goal",
  version: "1.0.0",
  title: "Goal",
  description: "How far a number is toward a target",
  category: "understand",
  icon: "target",
  surfaces: ["app", "dashboard"],
  // The second value, when there is one, is where `goalFrom` reads the goal: a column of the source, summed or the like.
  data: { value: { shape: "summary", values: { min: 1, max: 2 }, breakdowns: { min: 0, max: 0 } } },
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
        "x-volvel": hint({
          tab: "data",
          group: "Progress",
          control: "number",
          label: "Goal",
          help: "A fixed amount. Or take it from a column below.",
          order: 1,
        }),
      },
      goalFrom: {
        type: "string",
        minLength: 1,
        maxLength: 130,
        "x-volvel": hint({
          tab: "data",
          group: "Progress",
          control: "column",
          of: "value",
          types: ["number", "integer"],
          label: "Goal from a column",
          help: "A column of the result, such as a monthly target. It wins over the fixed amount.",
          order: 2,
        }),
      },
      label: {
        type: "string",
        maxLength: 200,
        "x-volvel": hint({
          tab: "display",
          group: "Heading",
          control: "text",
          label: "A line under it",
          help: "Such as “of $60,000 this month”.",
          order: 1,
        }),
      },
      format: {
        ...FORMAT,
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          control: "format",
          label: "Numbers",
          order: 2,
        }),
      },
      percent: {
        type: "boolean",
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          control: "switch",
          label: "Show the percentage",
          order: 2.5,
        }),
      },
      reached: {
        enum: ["green", "none"],
        "x-volvel": hint({
          tab: "display",
          group: "Look",
          control: "segmented",
          label: "When reached, the bar",
          choices: { green: "Turns green", none: "Stays" },
          order: 3,
        }),
      },
      goodWhen: {
        enum: ["up", "down"],
        "x-volvel": hint({
          tab: "display",
          group: "Look",
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
          group: "Look",
          level: "more",
          control: "switch",
          label: "Color by how close",
          help: "Green when it is going well, amber when it is close, red when it is not.",
          order: 5,
        }),
      },
    },
    additionalProperties: false,
  },
  defaults: { goodWhen: "up", bands: false, reached: "green", percent: true },
  events: { click: { gives: "nothing", label: "When it is clicked" } },
  layout: { min: { w: 2, h: 2 }, default: { w: 3, h: 3 }, phone: "stack" },
});

/** Every widget of the labs pack, in the order "Add to page" offers them. */
export const LABS_WIDGETS = [goal] as const;

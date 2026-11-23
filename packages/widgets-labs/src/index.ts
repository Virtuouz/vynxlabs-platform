/**
 * The labs pack: a widget that exists to prove the contract in tests, and ships nowhere.
 * It is written against exactly what a developer's widget is (`@volvel/widgets`), so that
 * a test can hold the registry, the inspector and the page renderer to what any pack may
 * rely on, with no widget of the product's own. Nothing that ships imports this package.
 * This file holds definitions only, which are data; the views are in `../views`.
 */
import { defineWidget, type InspectorHint } from "@volvel/widgets";

const hint = (h: InspectorHint) => h;

/** A heading and a line under it. Reads no data. */
export const probe = defineWidget({
  type: "labs/probe",
  version: "1.0.0",
  title: "Probe",
  description: "A line of words, for tests of the contract",
  category: "content",
  icon: "type",
  surfaces: ["app", "dashboard"],
  data: {},
  config: {
    type: "object",
    properties: {
      words: {
        type: "string",
        maxLength: 200,
        "x-volvel": hint({
          tab: "display",
          group: "Words",
          control: "text",
          label: "Words",
          order: 1,
        }),
      },
    },
    additionalProperties: false,
  },
  defaults: { words: "Probe" },
  events: {},
  layout: { min: { w: 2, h: 1 }, default: { w: 3, h: 1 }, phone: "stack" },
});

/** Every widget of the labs pack. */
export const LABS_WIDGETS = [probe] as const;

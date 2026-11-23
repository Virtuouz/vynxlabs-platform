/**
 * The labs pack: widgets Volvel tries before it ships them. It is written
 * against exactly what a developer's widget is (`@volvel/widgets`), and exists
 * to prove that nothing in the builder is made for the core pack alone. This
 * file holds definitions only, which are data; the views are in `../views`.
 */
import { defineWidget, type InspectorHint } from "@volvel/widgets";

const hint = (h: InspectorHint) => h;

/**
 * A widget that does nothing, for tests of the contract: that a pack other than the core one is
 * registered, drawn, marked and set in the inspector as any widget is. It is not offered in "Add to
 * page". A widget goes here to be tried, and moves to the core pack when it is shipped (Goal did).
 */
export const probe = defineWidget({
  type: "labs/probe",
  version: "1.0.0",
  title: "Probe",
  description: "Draws its label, to prove the contract",
  category: "organize",
  icon: "target",
  surfaces: ["app", "dashboard"],
  data: {},
  config: {
    type: "object",
    properties: {
      label: {
        type: "string",
        maxLength: 60,
        "x-volvel": hint({ tab: "display", control: "text", label: "Label", order: 1 }),
      },
    },
    additionalProperties: false,
  },
  defaults: {},
  events: {},
  layout: { min: { w: 2, h: 2 }, default: { w: 3, h: 3 }, phone: "stack" },
});

/** Every widget of the labs pack, in the order "Add to page" offers them: none now. */
export const LABS_WIDGETS = [] as const;

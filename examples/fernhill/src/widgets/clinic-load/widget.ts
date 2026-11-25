import { defineWidget } from "@volvel/sdk";

/**
 * A gauge of one clinic's visits today against what the clinic can take: its open hours times
 * the visits it can see in an hour. The definition is what "Add to page" and the inspector are
 * drawn from. The view (view.tsx) runs in a sandboxed frame with no network, and is given only
 * the two inputs declared here, read for the viewer by the server.
 */
export const clinicLoad = defineWidget({
  type: "x/clinic-load",
  version: "1.0.0",
  title: "Clinic load",
  description: "One clinic's visits today against what it can take.",
  category: "understand",
  icon: "chart",
  surfaces: ["app", "dashboard"],
  data: {
    // The visits, one row for each clinic: gathered by the page's query, not by the view.
    visits: {
      shape: "summary",
      label: "Visits",
      sources: ["table", "query"],
      values: { min: 1, max: 1 },
      breakdowns: { min: 1, max: 1 },
    },
    // The clinics' hours: what capacity is worked out from.
    clinics: { shape: "rows", label: "Clinics", sources: ["table", "query"] },
  },
  dataHints: [
    {
      of: "visits",
      controls: [
        { control: "source", label: "Visits from" },
        { control: "measure", label: "Count" },
        { control: "breakdown", label: "Clinic column" },
        { control: "conditions", label: "Only include", help: "For example: Starts at is today." },
      ],
    },
    { of: "clinics", controls: [{ control: "source", label: "Clinics from" }] },
  ],
  config: {
    type: "object",
    properties: {
      clinic: {
        type: "string",
        default: "northside",
        "x-volvel": {
          tab: "data",
          group: "Clinic",
          control: "text",
          label: "Clinic code",
          help: "The code in the clinics table: northside, riverside or hilltop.",
          order: 1,
        },
      },
      perHour: {
        type: "number",
        exclusiveMinimum: 0,
        default: 3,
        "x-volvel": {
          tab: "data",
          group: "Clinic",
          control: "number",
          label: "Visits an hour",
          help: "What the clinic can see in an hour. Open hours times this is its capacity.",
          order: 2,
        },
      },
      busyAt: {
        type: "number",
        minimum: 1,
        maximum: 100,
        default: 70,
        "x-volvel": {
          tab: "display",
          group: "Thresholds",
          control: "number",
          label: "Busy from (%)",
          help: "From this share of capacity the gauge asks for attention.",
          order: 1,
        },
      },
      fullAt: {
        type: "number",
        minimum: 1,
        maximum: 100,
        default: 90,
        "x-volvel": {
          tab: "display",
          group: "Thresholds",
          control: "number",
          label: "Full from (%)",
          help: "From this share of capacity the gauge turns red.",
          order: 2,
        },
      },
    },
  },
  words: {
    clinic: "The clinics row the gauge is for, by its code.",
    perHour: "How many visits the clinic can see in an hour.",
    busyAt: "The share of capacity from which the gauge is amber.",
    fullAt: "The share of capacity from which the gauge is red.",
  },
  defaults: { clinic: "northside", perHour: 3, busyAt: 70, fullAt: 90 },
  events: {
    // Pressing the gauge gives the page a clinic; what the page does with it is the builder's.
    clinicChosen: {
      gives: "group",
      label: "When the gauge is pressed",
      payload: {
        type: "object",
        required: ["group"],
        additionalProperties: false,
        properties: {
          group: {
            type: "object",
            required: ["clinic"],
            additionalProperties: false,
            properties: { clinic: { type: "string", minLength: 1, maxLength: 40 } },
          },
        },
      },
    },
  },
  layout: { min: { w: 3, h: 3 }, default: { w: 4, h: 4 }, phone: "stack" },
  entry: "src/widgets/clinic-load/view.tsx",
});

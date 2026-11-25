import { defineApp, defineDashboard, defineInterface, defineWidget } from "@volvel/sdk";

/**
 * A widget that behaves as hostile tenant code would (e2e/widget-frame.spec.ts): its view tries
 * to reach the network, the cookies, the page that holds it and the address bar, to open
 * windows, to say what it may not and to draw outside its cell, and writes down what happened.
 */
export const hostile = defineWidget({
  type: "x/hostile",
  version: "1.0.0",
  title: "Hostile",
  description: "Tries what a widget may not.",
  category: "understand",
  icon: "puzzle",
  surfaces: ["app", "dashboard"],
  data: { rows: { shape: "rows" } },
  config: {
    type: "object",
    properties: {
      autoWrite: {
        type: "boolean",
        "x-volvel": { tab: "display", control: "switch", label: "Write on its own", order: 1 },
      },
    },
  },
  events: {
    // Wired to a write on the page: a frame can raise it with no click, so the page asks first.
    wipe: {
      gives: "nothing",
      label: "When it asks to write a note",
      payload: { type: "object", properties: {}, additionalProperties: false },
    },
    hello: {
      gives: "nothing",
      label: "When it says hello",
      payload: {
        type: "object",
        properties: { note: { type: "string", maxLength: 20 } },
        required: ["note"],
        additionalProperties: false,
      },
    },
  },
  layout: { min: { w: 3, h: 3 }, default: { w: 6, h: 4 } },
  entry: "widgets/hostile/view.ts",
});

const placed = {
  id: "hostile",
  type: "x/hostile",
  version: "1.0.0",
  title: "Hostile",
  at: { x: 0, y: 0, w: 6, h: 4 },
  // What the server reads for the viewer. The view can show this and nothing it asks for itself.
  data: { rows: { source: { visual: { table: "notes", columns: ["note"] } } } },
  on: { hello: { steps: [{ do: "message", text: "The widget said hello", tone: "success" }] } },
} as const;

export const screen = defineInterface({
  path: "screens/hostile",
  title: "Hostile",
  pages: [{ id: "main", title: "Hostile", widgets: [placed] }],
});
export const app = defineApp({ path: "hostile", title: "Hostile", interface: "screens/hostile" });
export const board = defineDashboard({
  path: "boards/hostile",
  title: "Hostile board",
  widgets: [placed],
});

// A page that wires a frame's event to a write, and a frame that raises it on its own.
const writer = {
  ...placed,
  id: "writer",
  config: { autoWrite: true },
  on: {
    wipe: { steps: [{ do: "create", table: "notes", set: { note: { value: "frame-wrote" } } }] },
  },
} as const;
export const writerScreen = defineInterface({
  path: "screens/writer",
  title: "Writer",
  pages: [{ id: "main", title: "Writer", widgets: [writer] }],
});
export const writerApp = defineApp({
  path: "writer",
  title: "Writer",
  interface: "screens/writer",
});

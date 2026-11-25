/**
 * The frame side of a developer's widget (decision 0005). A widget's view runs in a sandboxed
 * `<iframe>` with no network. The page that hosts it posts in what the view is given
 * (`{ config, data, state, size, theme }`) and the view posts out only an event its definition
 * declares, and a height it would like. This file is all of that, with no dependency and no
 * request of its own: it reads `message`s from its parent and posts to it.
 *
 * The messages are the protocol in `@volvel/widgets/frame`, which the host imports too.
 */

import {
  FRAME_PROTOCOL,
  type FrameMessage,
  type FrameProps,
  fromWireData,
  isHostMessage,
  MAX_FRAME_HEIGHT,
  THEME_VARIABLE_PREFIX,
  themeVariables,
  type WireProps,
} from "@volvel/widgets/frame";

export type { FrameProps, FrameTheme } from "@volvel/widgets/frame";

/** What `createFrame` takes. */
export interface FrameOptions {
  /** The names of the events the widget's definition declares. Only these can be raised. */
  events: readonly string[];
  /** Where messages go and come from. Default: the window this runs in, and its parent. */
  parent?: Pick<Window, "postMessage">;
  /** Where messages are heard. Default: this window. */
  window?: Window;
}

/** The frame's connection to its page. */
export interface WidgetFrame<Config = Record<string, unknown>> {
  /** What the host last gave, or nothing before it has given any. */
  props(): FrameProps<Config> | undefined;
  /** Calls back with what the host has given, now if it has, and each time it gives again. Returns a way to stop. */
  onProps(callback: (props: FrameProps<Config>) => void): () => void;
  /** Raises one of the widget's declared events. The page checks it again, and does what it says, or nothing. Throws for an event that is not declared. */
  emit(event: string, payload?: unknown): void;
  /** Asks the page for a height in pixels. It may give less. */
  requestSize(height: number): void;
  /** Stops listening. */
  close(): void;
}

/**
 * Connects to the page that hosts this view, and tells it the view is ready to be given its
 * props. Call it once, at the top of the view's module.
 */
export function createFrame<Config = Record<string, unknown>>(
  options: FrameOptions,
): WidgetFrame<Config> {
  const self = options.window ?? window;
  const parent = options.parent ?? self.parent;
  const declared = new Set(options.events);
  const listeners = new Set<(props: FrameProps<Config>) => void>();
  let current: FrameProps<Config> | undefined;
  let applied: string[] = [];

  const post = (message: FrameMessage) => parent.postMessage(message, "*");

  const applyTheme = (theme: FrameProps["theme"]) => {
    const root = self.document.documentElement;
    const variables = themeVariables(theme);
    for (const name of applied) if (!(name in variables)) root.style.removeProperty(name);
    for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);
    applied = Object.keys(variables);
    root.dataset.theme = theme.scheme;
    root.style.colorScheme = theme.scheme;
  };

  const hear = (event: MessageEvent) => {
    // Only the page that holds this frame is believed.
    if (event.source !== parent) return;
    if (!isHostMessage(event.data)) return;
    const wire = event.data.props as unknown as WireProps<Config>;
    current = {
      ...wire,
      data: fromWireData(wire.data ?? {}, {
        more: (input) => post({ protocol: FRAME_PROTOCOL, from: "frame", type: "more", input }),
        sort: (input, sort) =>
          post({ protocol: FRAME_PROTOCOL, from: "frame", type: "sort", input, sort }),
      }),
    };
    applyTheme(current.theme);
    for (const listener of [...listeners]) listener(current);
  };
  self.addEventListener("message", hear);
  post({ protocol: FRAME_PROTOCOL, from: "frame", type: "ready" });

  return {
    props: () => current,
    onProps(callback) {
      listeners.add(callback);
      if (current) callback(current);
      return () => void listeners.delete(callback);
    },
    emit(event, payload = {}) {
      if (!declared.has(event)) {
        throw new Error(
          `The widget does not declare an event "${event}". Declare it in its definition: its events are ${[...declared].join(", ") || "none"}.`,
        );
      }
      post({ protocol: FRAME_PROTOCOL, from: "frame", type: "event", event, payload });
    },
    requestSize(height) {
      const whole = Math.round(Number.isFinite(height) ? height : 0);
      post({
        protocol: FRAME_PROTOCOL,
        from: "frame",
        type: "size",
        height: Math.min(MAX_FRAME_HEIGHT, Math.max(0, whole)),
      });
    },
    close() {
      self.removeEventListener("message", hear);
      listeners.clear();
      current = undefined;
    },
  };
}

export { THEME_VARIABLE_PREFIX };

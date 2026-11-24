/**
 * The frame protocol (decision 0005): what a developer's widget view, running in a sandboxed
 * frame, and the page that hosts it say to each other with `postMessage`. This file is the
 * one both sides import: the host (the console and the apps' page renderer) and the frame's
 * runtime (`@volvel/widget-frame`). It has no React and no browser API, so either side may
 * load it anywhere.
 *
 * - The host posts `props` whenever anything in them changes, and once the frame says `ready`.
 * - The frame posts `ready` once it is listening, `event` for an event its definition
 *   declares, and `size` to ask for a height.
 * - Nothing else is part of the protocol. Whoever receives a message checks it with
 *   `isHostMessage` / `isFrameMessage` and drops what fails. The host checks an event again
 *   against the definition and its payload schema; the frame's own check is a courtesy.
 */

import type { ViewSize, WidgetData, WidgetState } from "./index.js";

/** The protocol's name and version, on every message. */
export const FRAME_PROTOCOL = "volvel-widget/1" as const;

/** The most height a frame may ask for, in pixels. The host may give less. */
export const MAX_FRAME_HEIGHT = 4000;

/** Theme tokens reach the frame as CSS variables, `--volvel-<token>`. */
export const THEME_VARIABLE_PREFIX = "--volvel-";

/** The page's theme as the frame is given it: the scheme and the token values (colors, lengths, font lists). */
export interface FrameTheme {
  scheme: "light" | "dark";
  /** Token name to value: `{ primary: "#2563eb" }`. */
  tokens: Readonly<Record<string, string>>;
}

/** What a widget view is given, by the host, as its frame sees it: `WidgetViewProps` less what can't cross a frame. */
export interface FrameProps<Config = Record<string, unknown>> {
  config: Config;
  /** Each data input the server read for it under the viewer's permissions, by name. */
  data: Readonly<Record<string, WidgetData>>;
  state: WidgetState;
  size: ViewSize;
  theme: FrameTheme;
}

/** Host to frame. */
export interface HostMessage {
  protocol: typeof FRAME_PROTOCOL;
  from: "host";
  type: "props";
  props: FrameProps;
}

/** Frame to host. */
export type FrameMessage =
  | { protocol: typeof FRAME_PROTOCOL; from: "frame"; type: "ready" }
  | {
      protocol: typeof FRAME_PROTOCOL;
      from: "frame";
      type: "event";
      event: string;
      payload: unknown;
    }
  | { protocol: typeof FRAME_PROTOCOL; from: "frame"; type: "size"; height: number };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Whether a message received by a frame is the host's props. */
export function isHostMessage(value: unknown): value is HostMessage {
  return (
    isObject(value) &&
    value.protocol === FRAME_PROTOCOL &&
    value.from === "host" &&
    value.type === "props" &&
    isObject(value.props)
  );
}

/** Whether a message received by the host is one of the three a frame may send. */
export function isFrameMessage(value: unknown): value is FrameMessage {
  if (!isObject(value) || value.protocol !== FRAME_PROTOCOL || value.from !== "frame") return false;
  switch (value.type) {
    case "ready":
      return true;
    case "event":
      return typeof value.event === "string" && value.event !== "";
    case "size":
      return (
        typeof value.height === "number" &&
        Number.isFinite(value.height) &&
        value.height >= 0 &&
        value.height <= MAX_FRAME_HEIGHT
      );
    default:
      return false;
  }
}

const TOKEN_NAME = /^[a-z][a-z0-9-]{0,40}$/;
/** What a token's value may be made of: no `;`, braces, `url(`, `var(` or `expression`. */
const TOKEN_VALUE = /^[A-Za-z0-9#(),.%"' -]{1,200}$/;
const FORBIDDEN_IN_VALUE = /url|image|expression|var\(|env\(|attr\(/i;

/** The theme's tokens as CSS custom properties, leaving out any name or value that is not plain. */
export function themeVariables(theme: FrameTheme): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const [name, value] of Object.entries(theme.tokens)) {
    if (!TOKEN_NAME.test(name)) continue;
    if (typeof value !== "string" || !TOKEN_VALUE.test(value) || FORBIDDEN_IN_VALUE.test(value))
      continue;
    variables[`${THEME_VARIABLE_PREFIX}${name}`] = value;
  }
  return variables;
}

export { payloadProblem } from "./schema.js";

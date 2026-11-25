/**
 * The frame protocol (decision 0005): what a developer's widget view, running in a sandboxed
 * frame, and the page that hosts it say to each other with `postMessage`. This file is the
 * one both sides import: the host (the console and the apps' page renderer) and the frame's
 * runtime (`@volvel/widget-frame`). It has no React and no browser API, so either side may
 * load it anywhere.
 *
 * - The host posts `props` whenever anything in them changes, and once the frame says `ready`.
 * - The frame posts `ready` once it is listening, `event` for an event its definition
 *   declares, `size` to ask for a height, and, for a rows input, `more` (the next page) and
 *   `sort` (rows in the order of a column). The host answers with props again.
 * - What crosses is plain data. A rows input arrives with `hasMore` and `canSort` where a view
 *   in the page has `more()` and `sortBy()`; the frame's runtime makes those two functions
 *   again, and each sends its request.
 * - Nothing else is part of the protocol. Whoever receives a message checks it with
 *   `isHostMessage` / `isFrameMessage` and drops what fails. The host checks an event again
 *   against the definition and its payload schema; the frame's own check is a courtesy.
 */

import type { RowsData, ViewSize, WidgetData, WidgetState } from "./index.js";

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

/** A rows input as it crosses: `RowsData` with no functions, and two flags where they were. */
export type WireRows = Omit<RowsData, "more" | "sortBy"> & {
  /** There is a next page: the view's `more()` asks for it. */
  hasMore?: boolean;
  /** The rows can be read in the order of a column over all of them: the view's `sortBy()` asks. */
  canSort?: boolean;
};

/** One data input as it crosses a frame: plain data only, since `postMessage` cannot clone a function. */
export type WireData = Exclude<WidgetData, RowsData> | WireRows;

/** `FrameProps` as it is posted: the same, with plain data. */
export interface WireProps<Config = Record<string, unknown>>
  extends Omit<FrameProps<Config>, "data"> {
  data: Readonly<Record<string, WireData>>;
}

/** The rows' order a frame asks for; `null` is the order the rows come in. */
export type WireSort = { column: string; descending: boolean } | null;

/** Host to frame. */
export interface HostMessage {
  protocol: typeof FRAME_PROTOCOL;
  from: "host";
  type: "props";
  props: WireProps;
}

/** Plain data from what a page's view is given: the functions of a rows input become flags. */
export function toWireData(data: Readonly<Record<string, WidgetData>>): Record<string, WireData> {
  const wire: Record<string, WireData> = {};
  for (const [name, one] of Object.entries(data)) {
    if (one.shape !== "rows") {
      wire[name] = one;
      continue;
    }
    const { more, sortBy, ...plain } = one;
    wire[name] = {
      ...plain,
      ...(more ? { hasMore: true } : {}),
      ...(sortBy ? { canSort: true } : {}),
    };
  }
  return wire;
}

/** What a frame's view is given from what was posted: the two functions of a rows input, made from its flags. */
export function fromWireData(
  wire: Readonly<Record<string, WireData>>,
  ask: {
    more: (input: string) => void;
    sort: (input: string, sort: WireSort) => void;
  },
): Record<string, WidgetData> {
  const data: Record<string, WidgetData> = {};
  for (const [name, one] of Object.entries(wire)) {
    if (one.shape !== "rows") {
      data[name] = one;
      continue;
    }
    const { hasMore, canSort, ...plain } = one;
    data[name] = {
      ...plain,
      ...(hasMore ? { more: () => ask.more(name) } : {}),
      ...(canSort ? { sortBy: (sort) => ask.sort(name, sort ?? null) } : {}),
    };
  }
  return data;
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
  | { protocol: typeof FRAME_PROTOCOL; from: "frame"; type: "size"; height: number }
  | { protocol: typeof FRAME_PROTOCOL; from: "frame"; type: "more"; input: string }
  | {
      protocol: typeof FRAME_PROTOCOL;
      from: "frame";
      type: "sort";
      input: string;
      sort: WireSort;
    };

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

/** Whether a message received by the host is one of the five a frame may send. */
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
    case "more":
      return typeof value.input === "string" && value.input !== "";
    case "sort": {
      if (typeof value.input !== "string" || value.input === "") return false;
      if (value.sort === null) return true;
      return (
        isObject(value.sort) &&
        typeof value.sort.column === "string" &&
        value.sort.column !== "" &&
        value.sort.column.length <= 200 &&
        typeof value.sort.descending === "boolean" &&
        Object.keys(value.sort).length === 2
      );
    }
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

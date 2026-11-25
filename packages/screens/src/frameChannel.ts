/**
 * What the host believes of a widget's frame (decision 0005). The frame is tenant code: every
 * message it sends is checked here, and only what the widget's definition declares gets
 * through. This file is the checks, with no React and no window; `TenantWidgetHost` is the
 * wiring. The one check that needs a window, that a message came from the frame's own
 * `contentWindow`, is made before anything is passed in.
 */
import type { EventDeclaration, EventPayload } from "@volvel/widgets";
import {
  isFrameMessage,
  MAX_FRAME_HEIGHT,
  payloadProblem,
  type WireSort,
} from "@volvel/widgets/frame";

/** What a frame may send. */
export const FRAME_LIMITS = {
  /** The most a message may weigh, as JSON. */
  maxBytes: 64 * 1024,
  /** The most messages a second. */
  perSecond: 20,
  /** The most requests for rows (`more`, `sort`) a second: each one is a read from the server. */
  requestsPerSecond: 4,
  /** A frame that keeps going over the rate for this long is stopped. */
  floodMs: 2000,
} as const;

export type Verdict =
  | { kind: "ready" }
  | { kind: "event"; event: string; payload: EventPayload }
  | { kind: "size"; height: number }
  | { kind: "more"; input: string }
  | { kind: "sort"; input: string; sort: WireSort }
  | { kind: "dropped"; reason: string }
  | { kind: "flood" };

export interface Channel {
  /** Judges one message from the frame. */
  receive(data: unknown): Verdict;
  /** How many messages were dropped. */
  readonly dropped: number;
}

interface ChannelOptions {
  events: Readonly<Record<string, EventDeclaration>>;
  /** The names of the rows inputs the definition declares: the only ones a frame may ask rows of. */
  rows?: readonly string[];
  now?: () => number;
  limits?: Partial<typeof FRAME_LIMITS>;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** What an event gives, when its definition names no payload schema. */
function givesProblem(gives: EventDeclaration["gives"], payload: unknown): string | undefined {
  if (!isObject(payload)) return "the payload is not an object";
  const keys = Object.keys(payload);
  if (gives === "nothing") return keys.length === 0 ? undefined : "the event gives nothing";
  if (gives === "record")
    return keys.length === 1 && typeof payload.record === "string"
      ? undefined
      : "the event gives a record: {record: id}";
  return keys.length === 1 && isObject(payload.group)
    ? undefined
    : "the event gives a group: {group: {...}}";
}

export function createChannel(options: ChannelOptions): Channel {
  const now = options.now ?? Date.now;
  const limits = { ...FRAME_LIMITS, ...options.limits };
  const recent: number[] = [];
  const requests: number[] = [];
  const declaredRows = new Set(options.rows ?? []);
  let overSince: number | undefined;
  let dropped = 0;
  const drop = (reason: string): Verdict => {
    dropped += 1;
    return { kind: "dropped", reason };
  };

  return {
    get dropped() {
      return dropped;
    },
    receive(data) {
      const at = now();
      while (recent.length > 0 && at - (recent[0] as number) >= 1000) recent.shift();
      recent.push(at);
      if (recent.length > limits.perSecond) {
        overSince ??= at;
        if (at - overSince >= limits.floodMs) return { kind: "flood" };
        return drop("too many messages");
      }
      if (overSince !== undefined && at - overSince >= 1000) overSince = undefined;

      let size: number;
      try {
        size = JSON.stringify(data)?.length ?? 0;
      } catch {
        return drop("the message cannot be read as JSON");
      }
      if (size > limits.maxBytes) return drop("the message is too large");

      // A height past the most is given the most.
      const message =
        isObject(data) &&
        data.type === "size" &&
        typeof data.height === "number" &&
        Number.isFinite(data.height) &&
        data.height > MAX_FRAME_HEIGHT
          ? { ...data, height: MAX_FRAME_HEIGHT }
          : data;
      if (!isFrameMessage(message)) return drop("the message is not part of the protocol");
      if (message.type === "ready") return { kind: "ready" };
      if (message.type === "size") return { kind: "size", height: Math.round(message.height) };

      if (message.type === "more" || message.type === "sort") {
        if (!declaredRows.has(message.input))
          return drop(`the widget does not declare a rows input "${message.input}"`);
        while (requests.length > 0 && at - (requests[0] as number) >= 1000) requests.shift();
        if (requests.length >= limits.requestsPerSecond) return drop("too many requests for rows");
        requests.push(at);
        return message.type === "more"
          ? { kind: "more", input: message.input }
          : {
              kind: "sort",
              input: message.input,
              sort: message.sort
                ? { column: message.sort.column, descending: message.sort.descending }
                : null,
            };
      }

      const declaration = Object.hasOwn(options.events, message.event)
        ? options.events[message.event]
        : undefined;
      if (!declaration) return drop(`the widget does not declare an event "${message.event}"`);
      // A copy of plain data: nothing the frame built (a getter, a prototype) reaches the page.
      const payload: unknown = JSON.parse(JSON.stringify(message.payload ?? {}));
      const problem = declaration.payload
        ? payloadProblem(declaration.payload, payload)
        : givesProblem(declaration.gives, payload);
      if (problem) return drop(`"${message.event}": ${problem}`);
      return { kind: "event", event: message.event, payload: payload as EventPayload };
    },
  };
}

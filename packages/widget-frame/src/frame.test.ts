// @vitest-environment happy-dom
import {
  FRAME_PROTOCOL,
  type FrameMessage,
  type FrameProps,
  THEME_VARIABLE_PREFIX,
} from "@volvel/widgets/frame";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createFrame } from "./index.js";

const props = (change: Partial<FrameProps> = {}): FrameProps => ({
  config: { target: 3 },
  data: {},
  state: { status: "ready" },
  size: { w: 4, h: 3, narrow: false },
  theme: { scheme: "light", tokens: { primary: "#112233" } },
  ...change,
});

const host = (message: unknown, source: unknown = parent) =>
  window.dispatchEvent(new MessageEvent("message", { data: message, source: source as Window }));
const propsMessage = (p: FrameProps) => ({
  protocol: FRAME_PROTOCOL,
  from: "host",
  type: "props",
  props: p,
});

/** A frame whose parent records what it is sent. */
function make(events: readonly string[] = ["reached"]) {
  const sent: FrameMessage[] = [];
  const parent = { postMessage: (message: FrameMessage) => void sent.push(message) };
  const frame = createFrame({ events, parent: parent as unknown as Window });
  return { frame, sent, parent };
}
let parent: Window;
let open: { frame: { close(): void } } | undefined;
afterEach(() => {
  open?.frame.close();
  open = undefined;
  document.documentElement.removeAttribute("style");
  vi.unstubAllGlobals();
});
const start = (events?: readonly string[]) => {
  const made = make(events);
  open = made;
  parent = made.parent as unknown as Window;
  return made;
};

describe("the frame's side of the protocol", () => {
  test("says it is ready once, and takes the host's props as they come", () => {
    const { frame, sent } = start();
    expect(sent).toEqual([{ protocol: FRAME_PROTOCOL, from: "frame", type: "ready" }]);
    expect(frame.props()).toBeUndefined();
    const seen: FrameProps[] = [];
    frame.onProps((p) => seen.push(p));
    host(propsMessage(props()));
    host(propsMessage(props({ config: { target: 5 } })));
    expect(seen.map((p) => p.config)).toEqual([{ target: 3 }, { target: 5 }]);
    expect(frame.props()?.config).toEqual({ target: 5 });
  });

  test("tells a late listener what it has, and a stopped listener nothing more", () => {
    const { frame } = start();
    host(propsMessage(props()));
    const seen: unknown[] = [];
    const stop = frame.onProps((p) => seen.push(p.config));
    expect(seen).toEqual([{ target: 3 }]);
    stop();
    host(propsMessage(props({ config: { target: 9 } })));
    expect(seen).toEqual([{ target: 3 }]);
  });

  test("believes only its own parent, and only a props message", () => {
    const { frame } = start();
    host(propsMessage(props()), window);
    host({ protocol: "other", from: "host", type: "props", props: props() });
    host("props");
    expect(frame.props()).toBeUndefined();
  });

  test("raises a declared event and refuses any other, so nothing undeclared leaves", () => {
    const { frame, sent } = start(["reached"]);
    frame.emit("reached", { at: 4 });
    expect(sent.at(-1)).toEqual({
      protocol: FRAME_PROTOCOL,
      from: "frame",
      type: "event",
      event: "reached",
      payload: { at: 4 },
    });
    const before = sent.length;
    expect(() => frame.emit("deleteEverything", {})).toThrow(
      'The widget does not declare an event "deleteEverything"',
    );
    expect(sent).toHaveLength(before);
  });

  test("asks for a height, whole pixels, within what the host may give", () => {
    const { frame, sent } = start();
    frame.requestSize(120.6);
    frame.requestSize(-5);
    frame.requestSize(1e9);
    expect(sent.slice(1).map((m) => (m as { height: number }).height)).toEqual([121, 0, 4000]);
  });

  test("sets the theme's tokens as CSS variables and the scheme, and takes away what is gone", () => {
    const { frame } = start();
    host(
      propsMessage(
        props({ theme: { scheme: "dark", tokens: { primary: "#112233", radius: "6px" } } }),
      ),
    );
    const root = document.documentElement;
    expect(root.style.getPropertyValue(`${THEME_VARIABLE_PREFIX}primary`)).toBe("#112233");
    expect(root.style.getPropertyValue(`${THEME_VARIABLE_PREFIX}radius`)).toBe("6px");
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
    host(propsMessage(props({ theme: { scheme: "light", tokens: { primary: "#fff" } } })));
    expect(root.style.getPropertyValue(`${THEME_VARIABLE_PREFIX}radius`)).toBe("");
    expect(root.dataset.theme).toBe("light");
    expect(frame.props()?.theme.scheme).toBe("light");
  });

  test("uses no network: with fetch, XMLHttpRequest and WebSocket broken, all of it still runs", () => {
    const broken = () => {
      throw new Error("network");
    };
    vi.stubGlobal("fetch", broken);
    vi.stubGlobal("XMLHttpRequest", broken);
    vi.stubGlobal("WebSocket", broken);
    const { frame } = start();
    host(propsMessage(props()));
    frame.emit("reached", {});
    frame.requestSize(40);
    expect(frame.props()).toBeDefined();
  });

  test("after close, hears nothing", () => {
    const { frame } = start();
    frame.close();
    host(propsMessage(props()));
    expect(frame.props()).toBeUndefined();
  });
});

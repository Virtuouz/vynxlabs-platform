import { describe, expect, it } from "vitest";
import {
  FRAME_PROTOCOL,
  type FrameMessage,
  type FrameProps,
  isFrameMessage,
  isHostMessage,
  MAX_FRAME_HEIGHT,
  THEME_VARIABLE_PREFIX,
  themeVariables,
} from "./frame.js";

const props: FrameProps = {
  config: { target: 3 },
  data: {},
  state: { status: "ready" },
  size: { w: 4, h: 3, narrow: false },
  theme: { scheme: "dark", tokens: { primary: "#112233", "radius-md": "6px" } },
};

describe("the frame protocol", () => {
  it("knows a host's props message and nothing that only looks like one", () => {
    expect(isHostMessage({ protocol: FRAME_PROTOCOL, from: "host", type: "props", props })).toBe(
      true,
    );
    expect(isHostMessage({ protocol: FRAME_PROTOCOL, from: "host", type: "props" })).toBe(false);
    expect(isHostMessage({ protocol: "other", from: "host", type: "props", props })).toBe(false);
    expect(isHostMessage({ protocol: FRAME_PROTOCOL, from: "frame", type: "props", props })).toBe(
      false,
    );
    expect(isHostMessage("props")).toBe(false);
    expect(isHostMessage(null)).toBe(false);
  });

  it("knows the three messages a frame sends, and refuses a malformed one", () => {
    const ok: FrameMessage[] = [
      { protocol: FRAME_PROTOCOL, from: "frame", type: "ready" },
      { protocol: FRAME_PROTOCOL, from: "frame", type: "event", event: "click", payload: {} },
      { protocol: FRAME_PROTOCOL, from: "frame", type: "size", height: 120 },
    ];
    for (const message of ok) expect(isFrameMessage(message)).toBe(true);
    expect(isFrameMessage({ protocol: FRAME_PROTOCOL, from: "frame", type: "event" })).toBe(false);
    expect(
      isFrameMessage({ protocol: FRAME_PROTOCOL, from: "frame", type: "size", height: "tall" }),
    ).toBe(false);
    expect(
      isFrameMessage({ protocol: FRAME_PROTOCOL, from: "frame", type: "size", height: -1 }),
    ).toBe(false);
    expect(
      isFrameMessage({
        protocol: FRAME_PROTOCOL,
        from: "frame",
        type: "size",
        height: MAX_FRAME_HEIGHT + 1,
      }),
    ).toBe(false);
    expect(isFrameMessage({ protocol: FRAME_PROTOCOL, from: "frame", type: "navigate" })).toBe(
      false,
    );
  });

  it("names the theme's tokens as CSS variables, and drops a name that could break out", () => {
    expect(themeVariables(props.theme)).toEqual({
      [`${THEME_VARIABLE_PREFIX}primary`]: "#112233",
      [`${THEME_VARIABLE_PREFIX}radius-md`]: "6px",
    });
    expect(
      themeVariables({ scheme: "light", tokens: { "a;b": "1", ok: "red;} body{", fine: "x" } }),
    ).toEqual({ [`${THEME_VARIABLE_PREFIX}fine`]: "x" });
  });
});

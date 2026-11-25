import { describe, expect, it } from "vitest";
import {
  FRAME_PROTOCOL,
  type FrameMessage,
  type FrameProps,
  fromWireData,
  isFrameMessage,
  isHostMessage,
  MAX_FRAME_HEIGHT,
  THEME_VARIABLE_PREFIX,
  themeVariables,
  toWireData,
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

describe("rows across a frame", () => {
  const rows = {
    shape: "rows" as const,
    columns: [{ name: "a", label: "A", type: "text" }],
    rows: [{ a: "1" }],
    total: 9,
    more: () => {},
    sortBy: () => {},
    sorted: { column: "a", descending: true },
  };

  it("crosses as plain data: flags where the functions were, which a message can clone", () => {
    const wire = toWireData({
      visits: rows,
      other: { shape: "record", columns: [], record: null },
    });
    expect(wire.visits).toMatchObject({
      hasMore: true,
      canSort: true,
      total: 9,
      sorted: rows.sorted,
    });
    expect(wire.visits).not.toHaveProperty("more");
    expect(wire.visits).not.toHaveProperty("sortBy");
    expect(() => structuredClone(wire)).not.toThrow();
    expect(toWireData({ v: { ...rows, more: undefined, sortBy: undefined } }).v).not.toHaveProperty(
      "hasMore",
    );
  });

  it("is made into functions again in the frame, and each asks", () => {
    const asked: unknown[] = [];
    const data = fromWireData(structuredClone(toWireData({ visits: rows })), {
      more: (input) => asked.push(["more", input]),
      sort: (input, sort) => asked.push(["sort", input, sort]),
    });
    const got = data.visits;
    if (got?.shape !== "rows") throw new Error("rows");
    got.more?.();
    got.sortBy?.({ column: "a", descending: false });
    got.sortBy?.(undefined);
    expect(asked).toEqual([
      ["more", "visits"],
      ["sort", "visits", { column: "a", descending: false }],
      ["sort", "visits", null],
    ]);
  });

  it("knows a request for the next page or an order, and nothing that only looks like one", () => {
    const say = (more: Record<string, unknown>) => ({
      protocol: FRAME_PROTOCOL,
      from: "frame",
      ...more,
    });
    expect(isFrameMessage(say({ type: "more", input: "visits" }))).toBe(true);
    expect(isFrameMessage(say({ type: "more" }))).toBe(false);
    expect(isFrameMessage(say({ type: "sort", input: "v", sort: null }))).toBe(true);
    expect(
      isFrameMessage(say({ type: "sort", input: "v", sort: { column: "a", descending: true } })),
    ).toBe(true);
    for (const sort of [
      { column: "a" },
      { column: 1, descending: true },
      "a",
      { column: "", descending: false },
      { column: "a", descending: true, x: 1 },
    ])
      expect(isFrameMessage(say({ type: "sort", input: "v", sort }))).toBe(false);
  });
});

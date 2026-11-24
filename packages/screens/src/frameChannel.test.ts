import type { EventDeclaration } from "@volvel/widgets";
import { FRAME_PROTOCOL, MAX_FRAME_HEIGHT } from "@volvel/widgets/frame";
import { describe, expect, test } from "vitest";
import { createChannel, FRAME_LIMITS } from "./frameChannel.ts";

const events: Record<string, EventDeclaration> = {
  pick: {
    gives: "record",
    label: "When a row is picked",
    payload: {
      type: "object",
      properties: { record: { type: "string", maxLength: 8 } },
      required: ["record"],
      additionalProperties: false,
    },
  },
  clicked: { gives: "nothing", label: "When clicked" },
};
const say = (type: string, more: Record<string, unknown> = {}) => ({
  protocol: FRAME_PROTOCOL,
  from: "frame",
  type,
  ...more,
});

describe("what the host believes of a frame", () => {
  test("a declared event with a payload that fits is passed on, as a copy", () => {
    const channel = createChannel({ events });
    const payload = { record: "r1" };
    const sent = say("event", { event: "pick", payload });
    const verdict = channel.receive(sent);
    expect(verdict).toEqual({ kind: "event", event: "pick", payload: { record: "r1" } });
    expect((verdict as { payload: object }).payload).not.toBe(payload);
    expect(channel.receive(say("event", { event: "clicked" }))).toMatchObject({ kind: "event" });
    expect(channel.dropped).toBe(0);
  });

  test("an undeclared event is dropped and counted", () => {
    const channel = createChannel({ events });
    expect(channel.receive(say("event", { event: "delete", payload: {} }))).toMatchObject({
      kind: "dropped",
    });
    // An event named like something every object has is no event of the widget's.
    expect(channel.receive(say("event", { event: "constructor", payload: {} }))).toMatchObject({
      kind: "dropped",
    });
    expect(channel.dropped).toBe(2);
  });

  test("a payload that does not fit its schema, or what the event gives, is dropped", () => {
    const channel = createChannel({ events });
    for (const payload of [{}, { record: 5 }, { record: "a-very-long-id" }, { record: "a", x: 1 }])
      expect(channel.receive(say("event", { event: "pick", payload })).kind).toBe("dropped");
    expect(channel.receive(say("event", { event: "clicked", payload: { x: 1 } })).kind).toBe(
      "dropped",
    );
  });

  test("anything that is not the protocol is dropped", () => {
    const channel = createChannel({ events });
    for (const data of [null, "hi", 5, [], {}, { type: "event", event: "clicked" }, say("nope")])
      expect(channel.receive(data).kind).toBe("dropped");
    expect(channel.dropped).toBe(7);
  });

  test("a message over the size limit is dropped", () => {
    const channel = createChannel({ events });
    const big = say("event", {
      event: "clicked",
      payload: { text: "x".repeat(FRAME_LIMITS.maxBytes) },
    });
    expect(channel.receive(big)).toEqual({ kind: "dropped", reason: "the message is too large" });
  });

  test("a message that is not data is dropped, not thrown", () => {
    const channel = createChannel({ events });
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(channel.receive(loop).kind).toBe("dropped");
  });

  test("a height is kept to the most a frame may ask for", () => {
    const channel = createChannel({ events });
    expect(channel.receive(say("size", { height: 120.4 }))).toEqual({ kind: "size", height: 120 });
    expect(channel.receive(say("size", { height: 9e9 }))).toEqual({
      kind: "size",
      height: MAX_FRAME_HEIGHT,
    });
    expect(channel.receive(say("size", { height: -5 })).kind).toBe("dropped");
    expect(channel.receive(say("size", { height: Number.NaN })).kind).toBe("dropped");
    expect(channel.receive(say("size", { height: "tall" })).kind).toBe("dropped");
  });

  test("messages over the rate are dropped, and a frame that keeps flooding is stopped", () => {
    let now = 0;
    const channel = createChannel({ events, now: () => now });
    const click = say("event", { event: "clicked" });
    for (let i = 0; i < FRAME_LIMITS.perSecond; i++)
      expect(channel.receive(click).kind).toBe("event");
    expect(channel.receive(click).kind).toBe("dropped");
    // A burst that stops is forgiven.
    now = 1500;
    expect(channel.receive(click).kind).toBe("event");
    // One that goes on for two seconds is not.
    const kinds = new Set<string>();
    for (now = 2000; now <= 4600; now += 20) kinds.add(channel.receive(click).kind);
    expect(kinds.has("flood")).toBe(true);
  });
});

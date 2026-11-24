// @vitest-environment happy-dom

import { cleanup, render } from "@testing-library/react";
import type { WidgetDefinition } from "@volvel/widgets";
import { FRAME_PROTOCOL } from "@volvel/widgets/frame";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { setFrameSource } from "./frameSource.ts";
import { TenantWidgetHost } from "./TenantWidgetHost.tsx";

// happy-dom loads no frame, and says so in the console unless that is taken as done.
(
  window as unknown as { happyDOM: { settings: Record<string, boolean> } }
).happyDOM.settings.disableIframePageLoading = true;

beforeEach(() => {
  const was = console.error;
  vi.spyOn(console, "error").mockImplementation((...said: unknown[]) => {
    if (!String(said[0]).includes("Iframe page loading")) was(...said);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  setFrameSource(null);
});

const definition = {
  type: "x/hello",
  version: "1.0.0",
  title: "Hello",
  events: { hi: { gives: "nothing", label: "When it greets" } },
} as unknown as WidgetDefinition;
const size = { w: 4, h: 3, narrow: false } as never;

function drawn() {
  setFrameSource({ origin: "https://apps.example", slug: "acme" });
  const emit = vi.fn();
  const view = render(
    <>
      <TenantWidgetHost
        type="x/hello"
        version="1.0.0"
        definition={definition}
        config={{}}
        data={{}}
        size={size}
        building={false}
        emit={emit}
      />
      <TenantWidgetHost
        type="x/hello"
        version="1.0.0"
        definition={definition}
        config={{}}
        data={{}}
        size={size}
        building={false}
        emit={emit}
      />
    </>,
  );
  const frames = [...view.container.querySelectorAll("iframe")];
  // happy-dom loads no frame: each gets a window of its own, as a browser gives.
  for (const frame of frames)
    Object.defineProperty(frame, "contentWindow", {
      value: { postMessage: vi.fn() },
      configurable: true,
    });
  return { emit, frames };
}

const hi = { protocol: FRAME_PROTOCOL, from: "frame", type: "event", event: "hi", payload: {} };
const say = (source: unknown, data: unknown) =>
  window.dispatchEvent(new MessageEvent("message", { data, source: source as Window }));

describe("p34-b4r the host of a tenant's widget", () => {
  test("its frame is a sandbox of scripts alone: never the page's own origin, navigation, forms or windows", () => {
    const { frames } = drawn();
    expect(frames).toHaveLength(2);
    for (const frame of frames) {
      expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
      expect(frame.getAttribute("allow")).toBe("");
    }
  });

  test("a message is believed from the frame's own window alone", () => {
    const { emit, frames } = drawn();
    const first = frames[0]?.contentWindow;
    say(first, hi);
    expect(emit).toHaveBeenCalledTimes(1);
    // The page's own window, a window that is nothing, and no window at all.
    say(window, hi);
    say({}, hi);
    say(null, hi);
    say(undefined, hi);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  test("a widget's message is not taken for another widget's, and is heard by its own host alone", () => {
    const { emit, frames } = drawn();
    // The second frame speaks: one event, once, not once for each host on the page.
    say(frames[1]?.contentWindow, hi);
    expect(emit).toHaveBeenCalledTimes(1);
  });
});

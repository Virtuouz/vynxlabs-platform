// @vitest-environment happy-dom

import { act, cleanup, render } from "@testing-library/react";
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
  data: { visits: { shape: "rows" }, tally: { shape: "summary" } },
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

describe("p34-b7 what the host gives the frame", () => {
  const columns = [{ name: "a", label: "A", type: "text" }];
  function withRows(extra: Record<string, unknown> = {}) {
    setFrameSource({ origin: "https://apps.example", slug: "acme" });
    const more = vi.fn();
    const sortBy = vi.fn();
    const props = {
      type: "x/hello",
      version: "1.0.0",
      definition,
      config: {},
      size,
      building: false,
      emit: vi.fn(),
      data: { visits: { shape: "rows", columns, rows: [{ a: "1" }], total: 5, more, sortBy } },
      ...extra,
    } as never;
    const view = render(
      <TenantWidgetHost {...(props as object as Parameters<typeof TenantWidgetHost>[0])} />,
    );
    const frame = view.container.querySelector("iframe") as HTMLIFrameElement;
    const post = vi.fn();
    Object.defineProperty(frame, "contentWindow", {
      value: { postMessage: post },
      configurable: true,
    });
    return { view, frame, post, more, sortBy };
  }
  const ready = { protocol: FRAME_PROTOCOL, from: "frame", type: "ready" };

  test("posts a rows input larger than a page as plain data a message can clone", () => {
    const { frame, post } = withRows();
    say(frame.contentWindow, ready);
    expect(post).toHaveBeenCalledTimes(1);
    const sent = post.mock.calls[0]?.[0];
    expect(() => structuredClone(sent)).not.toThrow();
    expect(sent.props.data.visits).toMatchObject({ hasMore: true, canSort: true, total: 5 });
    expect(sent.props.data.visits.more).toBeUndefined();
    expect(sent.props.state).toEqual({ status: "ready" });
  });

  test("the frame's request for the next page or an order calls the page's own functions", () => {
    const { frame, more, sortBy } = withRows();
    say(frame.contentWindow, {
      protocol: FRAME_PROTOCOL,
      from: "frame",
      type: "more",
      input: "visits",
    });
    expect(more).toHaveBeenCalledTimes(1);
    say(frame.contentWindow, {
      protocol: FRAME_PROTOCOL,
      from: "frame",
      type: "sort",
      input: "visits",
      sort: { column: "a", descending: true },
    });
    expect(sortBy).toHaveBeenCalledWith({ column: "a", descending: true });
    // A column the rows do not have, an input the widget does not declare, a summary input.
    say(frame.contentWindow, {
      protocol: FRAME_PROTOCOL,
      from: "frame",
      type: "sort",
      input: "visits",
      sort: { column: "nope", descending: true },
    });
    say(frame.contentWindow, {
      protocol: FRAME_PROTOCOL,
      from: "frame",
      type: "more",
      input: "elsewhere",
    });
    say(frame.contentWindow, {
      protocol: FRAME_PROTOCOL,
      from: "frame",
      type: "more",
      input: "tally",
    });
    // Nor from any window but the frame's own.
    say(window, { protocol: FRAME_PROTOCOL, from: "frame", type: "more", input: "visits" });
    expect(sortBy).toHaveBeenCalledTimes(1);
    expect(more).toHaveBeenCalledTimes(1);
  });

  test("posts the page's real state, and again when it changes", () => {
    const { view, frame, post } = withRows({ state: { status: "loading" } });
    say(frame.contentWindow, ready);
    expect(post.mock.calls[0]?.[0].props.state).toEqual({ status: "loading" });
    view.rerender(
      <TenantWidgetHost
        type="x/hello"
        version="1.0.0"
        definition={definition}
        config={{}}
        data={{}}
        state={{ status: "failed", message: "The visits could not be read." }}
        size={size}
        building={false}
        emit={vi.fn()}
      />,
    );
    expect(post.mock.calls.at(-1)?.[0].props.state).toEqual({
      status: "failed",
      message: "The visits could not be read.",
    });
  });

  test("a post that fails is said in the cell and the console, not swallowed", () => {
    const { view, frame, post } = withRows();
    post.mockImplementation(() => {
      throw new DOMException("could not be cloned", "DataCloneError");
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    act(() => say(frame.contentWindow, ready));
    expect(view.getByRole("alert").textContent).toContain(
      "This widget could not be given its data",
    );
    expect(logged).toHaveBeenCalled();
    expect(frame.isConnected).toBe(true);
  });
});

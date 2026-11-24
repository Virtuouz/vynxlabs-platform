// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import type { DeployedWidget, WidgetDefinition } from "@volvel/widgets";
import { corePack } from "@volvel/widgets-core/views";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { setFrameSource } from "./frameSource.ts";
import { FRAME_READY_MS, TenantWidgetHost, workspaceViews } from "./TenantWidgetHost.tsx";
import { viewRegistry } from "./types.ts";

beforeEach(() => setFrameSource({ origin: "https://apps.test", slug: "fernhill" }));
afterEach(() => {
  cleanup();
  setFrameSource(null);
});

const gauge = (version: string, title = "Gauge"): WidgetDefinition => ({
  type: "x/gauge",
  version,
  title,
  description: "A needle",
  category: "understand",
  icon: "gauge",
  surfaces: ["app", "dashboard"],
  data: {},
  config: { type: "object", properties: {} },
  events: {},
  layout: { min: { w: 2, h: 2 }, default: { w: 3, h: 3 } },
});
const deployed: DeployedWidget[] = [
  {
    type: "x/gauge",
    current: "1.1.0",
    versions: [
      { version: "1.0.0", definition: gauge("1.0.0", "Gauge (old)") },
      { version: "1.1.0", definition: gauge("1.1.0") },
    ],
  },
];
const props = {
  config: {},
  data: {},
  size: { w: 3, h: 3, narrow: false },
  emit: () => {},
  building: false,
};

describe("the views of a workspace", () => {
  test("hold the platform's packs and the workspace's widgets, each drawn by the host", () => {
    const views = workspaceViews(viewRegistry(corePack), deployed);
    expect(views.get("core/table")).toBeDefined();
    const entry = views.get("x/gauge");
    expect(entry?.definition.version).toBe("1.1.0");
    expect(entry?.versions?.get("1.0.0")?.title).toBe("Gauge (old)");
    expect(entry?.View).toBeDefined();
  });

  test("the platform's registry is left as it was", () => {
    const base = viewRegistry(corePack);
    workspaceViews(base, deployed);
    expect(base.get("x/gauge")).toBeUndefined();
  });

  test("a widget with a view of the platform's is not replaced by a tenant's of its type", () => {
    const clash: DeployedWidget[] = [{ ...deployed[0], type: "core/table" } as DeployedWidget];
    expect(() => workspaceViews(viewRegistry(corePack), clash)).toThrow(/core\/table/);
  });

  test("a widget that names no version is drawn at the current one", () => {
    const View = workspaceViews(viewRegistry(corePack), deployed).get("x/gauge")?.View as never as (
      p: typeof props,
    ) => React.ReactElement;
    render(<View {...props} />);
    expect(screen.getByRole("region", { name: "Gauge v1.1.0" })).toBeDefined();
  });
});

describe("the frame", () => {
  const events = {
    pick: {
      gives: "record" as const,
      label: "Picked",
      payload: { type: "object", properties: { record: { type: "string" } }, required: ["record"] },
    },
  };
  const definition = { ...gauge("1.0.0"), events } as WidgetDefinition;
  const draw = (emit = (_e: string, _p: unknown) => {}, extra: Record<string, unknown> = {}) =>
    render(
      <TenantWidgetHost
        {...props}
        {...extra}
        emit={emit as never}
        type="x/gauge"
        version="1.0.0"
        definition={definition}
      />,
    );
  // happy-dom gives an iframe no window: stand one in, so that "the frame's own window" exists.
  const windowOf = (frame: HTMLIFrameElement) => {
    const fake = { postMessage: () => {} } as unknown as Window;
    Object.defineProperty(frame, "contentWindow", { value: fake, configurable: true });
    return fake;
  };
  const said = (source: unknown, data: unknown) =>
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { source: source as Window, data }));
    });
  const message = (type: string, more: object = {}) => ({
    protocol: "volvel-widget/1",
    from: "frame",
    type,
    ...more,
  });

  test("is a sandboxed iframe with scripts only, no referrer, at the apps address, titled", () => {
    draw();
    const frame = document.querySelector("iframe") as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(frame.getAttribute("src")).toBe(
      "https://apps.test/_widgets/fernhill/x/gauge@1.0.0/frame.html",
    );
    expect(frame.getAttribute("title")).toBe("Gauge");
    expect(frame.style.maxHeight).toBe("100%");
  });

  test("hears only its own window, and passes on a declared event", () => {
    const got: unknown[] = [];
    draw((event, payload) => got.push([event, payload]));
    const frame = document.querySelector("iframe") as HTMLIFrameElement;
    const own = windowOf(frame);
    const event = message("event", { event: "pick", payload: { record: "r1" } });
    said(window, event);
    said(null, event);
    said({}, event);
    expect(got).toEqual([]);
    said(own, event);
    expect(got).toEqual([["pick", { record: "r1" }]]);
  });

  test("drops an undeclared event and a payload that does not fit, and counts them", () => {
    const got: unknown[] = [];
    draw((event) => got.push(event));
    const frame = document.querySelector("iframe") as HTMLIFrameElement;
    windowOf(frame);
    said(frame.contentWindow as Window, message("event", { event: "delete", payload: {} }));
    said(
      frame.contentWindow as Window,
      message("event", { event: "pick", payload: { record: 3 } }),
    );
    expect(got).toEqual([]);
    expect(screen.getByRole("region").getAttribute("data-frame-dropped")).toBe("2");
  });

  test("gives its props once the frame is ready, and again when they change, only those", () => {
    const view = draw();
    const frame = document.querySelector("iframe") as HTMLIFrameElement;
    const posted: { data: Record<string, unknown>; target: string }[] = [];
    windowOf(frame).postMessage = ((data: Record<string, unknown>, target: string) =>
      posted.push({ data, target })) as never;
    said(frame.contentWindow as Window, message("ready"));
    expect(posted).toHaveLength(1);
    expect(posted[0]?.target).toBe("*");
    const sent = posted[0]?.data as { props: Record<string, unknown> };
    expect(Object.keys(sent.props).sort()).toEqual(["config", "data", "size", "state", "theme"]);
    expect((sent.props.theme as { scheme: string }).scheme).toMatch(/light|dark/);
    view.rerender(
      <TenantWidgetHost
        {...props}
        config={{ loud: true }}
        type="x/gauge"
        version="1.0.0"
        definition={definition}
      />,
    );
    expect(posted.length).toBeGreaterThan(1);
    const last = posted[posted.length - 1] as { data: unknown };
    expect((last.data as { props: { config: unknown } }).props.config).toEqual({ loud: true });
  });

  test("keeps a requested height to the cell", () => {
    draw();
    const frame = document.querySelector("iframe") as HTMLIFrameElement;
    windowOf(frame);
    said(frame.contentWindow as Window, message("size", { height: 90 }));
    expect(frame.style.height).toBe("90px");
    said(frame.contentWindow as Window, message("size", { height: 9e6 }));
    expect(frame.style.height).toBe("4000px");
    expect(frame.style.maxHeight).toBe("100%");
  });

  test("a frame that floods is removed and replaced by a message, and it is logged", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    draw();
    const frame = document.querySelector("iframe") as HTMLIFrameElement;
    windowOf(frame);
    for (now = 0; now < 3000; now += 20)
      said(
        frame.contentWindow as Window,
        message("event", { event: "pick", payload: { record: "r" } }),
      );
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.getByText("This widget was stopped: it sent too many messages")).toBeDefined();
    expect(logged).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  test("says it did not load when the frame never answers", () => {
    vi.useFakeTimers();
    try {
      draw();
      expect(screen.getByRole("status").textContent).toContain("Loading");
      act(() => void vi.advanceTimersByTime(FRAME_READY_MS + 1));
      expect(screen.getByText("This widget did not load")).toBeDefined();
      expect(document.querySelector("iframe")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test("says so where the instance serves no widgets", () => {
    setFrameSource(null);
    draw();
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.getByText("This widget cannot be shown here.")).toBeDefined();
  });
});

import type { DeployedWidget, WidgetDefinition, WidgetViewProps } from "@volvel/widgets";
import { FRAME_PROTOCOL, type HostMessage, MAX_FRAME_HEIGHT } from "@volvel/widgets/frame";
import {
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createChannel } from "./frameChannel.ts";
import { frameUrl, useFrameSource } from "./frameSource.ts";
import { useFrameTheme } from "./frameTheme.ts";
import type { ViewEntry, ViewRegistry } from "./types.ts";

/**
 * What draws a widget of the tenant's own (`x/...`): the host side of the frame protocol
 * (decision 0005). The widget's view is tenant code, so it never runs in this document. It
 * runs in an `<iframe sandbox="allow-scripts">`, with no `allow-same-origin`, served from the
 * apps address, under a policy with no network. The host:
 *
 * - posts in the props the view is given, `{config, data, state, size, theme}`, once the
 *   frame says it is ready and again whenever any of them changes;
 * - believes only messages whose `source` is this frame's own window (its origin is "null"),
 *   and of those only what `createChannel` lets through: a declared event with a payload that
 *   fits its schema, a size request, within a size and a rate;
 * - stops a frame that floods, and says so where it was.
 *
 * The frame is as big as its cell and cannot draw outside it. A frame that asks for a height
 * gets it up to its cell and `MAX_FRAME_HEIGHT`.
 *
 * Everything a frame needs is a prop of this one component: the page's config and data, the
 * size of the cell, `emit` for the events the definition declares, the type and the version
 * the page names, and the definition of that version.
 */
export interface TenantWidgetHostProps extends WidgetViewProps {
  /** `x/<name>`. */
  type: string;
  /** The version the page names (the current one when it names none). */
  version: string;
  /** The definition of that version. */
  definition: WidgetDefinition;
}

/** How long a frame has to say it is ready. */
export const FRAME_READY_MS = 10_000;

/** How tall a cell of `rows` rows is: the page's rows are 2.5rem with 0.75rem between. */
const cellHeight = (rows: number) => `${rows * 2.5 + (rows - 1) * 0.75}rem`;

/** The height of the frame: the cell's, or what the frame asked for when that is less. */
export const frameHeight = (asked: number | undefined) =>
  asked === undefined ? "100%" : `min(${Math.min(asked, MAX_FRAME_HEIGHT)}px, 100%)`;

type Phase = "loading" | "ready" | "failed" | "stopped";

export function TenantWidgetHost({
  type,
  definition,
  version,
  config,
  data,
  size,
  emit,
}: TenantWidgetHostProps) {
  const source = useFrameSource();
  const theme = useFrameTheme();
  const frame = useRef<HTMLIFrameElement>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [height, setHeight] = useState<number>();
  const [dropped, setDropped] = useState(0);
  const channel = useMemo(
    () => createChannel({ events: definition.events }),
    // A new frame (another widget or version) starts with a new count and a new rate.
    [definition],
  );
  const latest = useRef({ config, data, size, theme, emit });
  latest.current = { config, data, size, theme, emit };
  const url = source ? frameUrl(source, type, version) : null;

  /** What the frame was last given, so that it is told again only when something changed. */
  const given = useRef("");
  const post = () => {
    const target = frame.current?.contentWindow;
    if (!target) return;
    const now = latest.current;
    given.current = JSON.stringify([now.config, now.data, now.size, now.theme]);
    const message: HostMessage = {
      protocol: FRAME_PROTOCOL,
      from: "host",
      type: "props",
      props: {
        config: now.config,
        data: now.data,
        state: { status: "ready" },
        size: now.size,
        theme: now.theme,
      },
    };
    // The frame's origin is opaque ("null"), so "*" is the only target a sandboxed frame has.
    // What goes in is the props and nothing else.
    try {
      target.postMessage(message, "*");
    } catch {
      // Not cloneable: the frame keeps what it had.
    }
  };

  // What the frame says. `post` reads the latest props from a ref, so it is no dependency.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    if (!url) return;
    const hear = (event: MessageEvent) => {
      // Only this frame's own window is believed: not another frame, not the page's own scripts.
      const own = frame.current?.contentWindow;
      if (!own || event.source !== own) return;
      const verdict = channel.receive(event.data);
      switch (verdict.kind) {
        case "ready":
          setPhase((now) => (now === "stopped" ? now : "ready"));
          post();
          break;
        case "size":
          setHeight(verdict.height);
          break;
        case "event":
          latest.current.emit(verdict.event, verdict.payload);
          break;
        case "dropped":
          setDropped(channel.dropped);
          if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV)
            console.warn(`Widget ${type} v${version}: a message was dropped: ${verdict.reason}`);
          break;
        case "flood":
          console.error(`Widget ${type} v${version} was stopped: it sent too many messages.`);
          setPhase("stopped");
          break;
      }
    };
    window.addEventListener("message", hear);
    return () => window.removeEventListener("message", hear);
  }, [url, channel, type, version]);

  // The frame is given its props again when any of them changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `post` reads the latest props from a ref
  useEffect(() => {
    if (phase !== "ready") return;
    if (JSON.stringify([config, data, size, theme]) !== given.current) post();
  }, [phase, config, data, size, theme]);

  // A frame that does not answer is a widget that did not load.
  useEffect(() => {
    if (phase !== "loading" || !url) return;
    const timer = window.setTimeout(
      () => setPhase((now) => (now === "loading" ? "failed" : now)),
      FRAME_READY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [phase, url]);

  const label = `${definition.title} v${version}`;
  const say = (words: string, detail?: string) => (
    <div className="flex h-full min-h-16 w-full min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-inner border border-dashed border-line bg-sunken/50 p-3 text-center text-body-sm text-ink-muted">
      <span className="max-w-full font-medium text-ink">{words}</span>
      {detail && !size.narrow ? <span className="max-w-full text-caption">{detail}</span> : null}
    </div>
  );

  let body: ReactNode;
  if (!url) {
    body = say(
      "This widget cannot be shown here.",
      "Its address could not be found. Reload the page to try again.",
    );
  } else if (phase === "stopped") {
    body = say(
      "This widget was stopped: it sent too many messages",
      "Reload the page to try again.",
    );
  } else if (phase === "failed") {
    body = say("This widget did not load", "Its page did not answer. Reload to try again.");
  } else {
    body = (
      <>
        <iframe
          ref={frame}
          src={url}
          title={definition.title}
          // Scripts only: no same origin (it would give the view this site's cookies and storage),
          // no navigation of the page, no pop-ups, no forms, no dialogs.
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          allow=""
          // Laid over the cell, which is as tall as the rows it was given, so that it is that
          // tall wherever the page is stacked as well as on the grid; a height it asks for is
          // kept to that and to the most a frame may ask for.
          className="absolute top-0 left-0 block w-full border-0 bg-transparent"
          style={{
            height: frameHeight(height),
            colorScheme: theme.scheme,
          }}
        />
        {phase === "loading" ? (
          <span
            role="status"
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-body-sm text-ink-muted"
          >
            Loading {definition.title}
          </span>
        ) : null}
      </>
    );
  }
  return (
    <section
      aria-label={label}
      data-tenant-widget={definition.type}
      data-tenant-widget-version={version}
      data-frame-phase={url ? phase : "unserved"}
      data-frame-dropped={dropped}
      {...(height === undefined ? {} : { "data-frame-asked": height })}
      // On the grid the cell is as tall as its rows already; where the page is stacked, rows are
      // as tall as what is in them, and the frame is given the height of the rows it was placed in.
      className="relative h-full min-h-[var(--cell-height)] w-full min-w-0 overflow-hidden @2xl/page:@md/grid:min-h-16"
      style={{ "--cell-height": cellHeight(size.h) } as CSSProperties}
    >
      {body}
    </section>
  );
}

/**
 * The registry of one workspace: the views the platform ships, and a host for each tenant
 * widget it deployed, by its current definition, with every version's definition kept so a
 * page is drawn by the version it names. The registry it is made from is left as it was.
 */
export function workspaceViews(
  platform: ViewRegistry,
  deployed: readonly DeployedWidget[],
): ViewRegistry {
  const entries = new Map(platform);
  for (const widget of deployed) {
    if (entries.has(widget.type)) throw new Error(`${widget.type} is in two packs`);
    const versions = new Map(widget.versions.map((one) => [one.version, one.definition]));
    // A removed widget has no current version; pages that still pin an older one draw it.
    const latest = widget.current ?? widget.versions.at(-1)?.version;
    const current = latest === undefined ? undefined : versions.get(latest);
    if (latest === undefined || !current)
      throw new Error(`${widget.type} has no deployed version ${widget.current}`);
    // biome-ignore lint/correctness/noComponentHookFactories: made once per workspace registry, so a page keeps its widgets' state
    const View: ComponentType<WidgetViewProps & { version?: string }> = (props) => {
      const version = props.version && versions.has(props.version) ? props.version : latest;
      return (
        <TenantWidgetHost
          {...props}
          type={widget.type}
          version={version}
          definition={versions.get(version) as WidgetDefinition}
        />
      );
    };
    const entry: ViewEntry = { definition: current, versions, View };
    entries.set(widget.type, entry);
  }
  return entries;
}

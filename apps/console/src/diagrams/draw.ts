import type { Mermaid } from "mermaid";

/**
 * Diagrams on a page of documentation: a block of code written as `mermaid`,
 * drawn by Mermaid in the page's own colors, and moved and zoomed by the
 * reader. The same code draws them on a served site and in the console's
 * preview. Nothing here fetches anything: Mermaid is given by whoever calls.
 *
 * A diagram's figure holds its source until it is drawn, so a page without
 * script, and a diagram that does not read, still says what it was.
 */

const EASE = "cubic-bezier(0.2, 0, 0, 1)";
const SVG = "http://www.w3.org/2000/svg";
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
/** The height a diagram's box may take, in pixels: never a sliver, never more than a screen's worth. */
const MIN_HEIGHT = 160;
const MAX_HEIGHT = 560;
const PADDING = 16;

const still = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

let canvas: CanvasRenderingContext2D | null | undefined;
/**
 * A color as Mermaid reads it. A theme may give a color in any form CSS
 * knows, and Mermaid's own reader knows only a few, so each is put into sRGB
 * first by the browser itself.
 */
function srgb(color: string, fallback: string): string {
  if (canvas === undefined) canvas = document.createElement("canvas").getContext("2d");
  if (!canvas || color === "") return fallback;
  canvas.fillStyle = fallback;
  canvas.fillStyle = color;
  return canvas.fillStyle;
}

function luminance(hex: string): number {
  const found = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!found) return 1;
  const [r, g, b] = found.slice(1).map((part) => Number.parseInt(part, 16) / 255) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Mermaid's theme, from the tokens of the page the diagram is on. */
export function themeOf(element: Element): Record<string, string | boolean> {
  const style = getComputedStyle(element);
  const token = (name: string, fallback: string) =>
    srgb(style.getPropertyValue(name).trim(), fallback);
  const ink = token("--vd-ink", "#1a1a1a");
  const muted = token("--vd-muted", "#5c5c5c");
  const line = token("--vd-line", "#dcdcdc");
  const surface = token("--vd-surface", "#ffffff");
  const sunken = token("--vd-sunken", "#f3f3f3");
  const action = token("--vd-action", "#1d4ed8");
  const actionSoft = token("--vd-info-soft", sunken);
  const attention = token("--vd-attention", "#b45309");
  const attentionSoft = token("--vd-attention-soft", sunken);
  const success = token("--vd-success", "#15803d");
  const successSoft = token("--vd-success-soft", sunken);
  const danger = token("--vd-danger", "#b91c1c");
  const dangerSoft = token("--vd-danger-soft", sunken);
  return {
    darkMode: luminance(surface) < 0.5,
    fontFamily: style.fontFamily,
    fontSize: "14px",
    background: surface,
    primaryColor: actionSoft,
    primaryTextColor: ink,
    primaryBorderColor: action,
    secondaryColor: successSoft,
    secondaryTextColor: ink,
    secondaryBorderColor: success,
    tertiaryColor: attentionSoft,
    tertiaryTextColor: ink,
    tertiaryBorderColor: attention,
    mainBkg: actionSoft,
    nodeBorder: action,
    nodeTextColor: ink,
    textColor: ink,
    titleColor: ink,
    lineColor: muted,
    defaultLinkColor: muted,
    edgeLabelBackground: surface,
    clusterBkg: sunken,
    clusterBorder: line,
    actorBkg: actionSoft,
    actorBorder: action,
    actorTextColor: ink,
    actorLineColor: muted,
    signalColor: ink,
    signalTextColor: ink,
    labelBoxBkgColor: surface,
    labelBoxBorderColor: line,
    labelTextColor: ink,
    loopTextColor: ink,
    noteBkgColor: attentionSoft,
    noteBorderColor: attention,
    noteTextColor: ink,
    activationBkgColor: sunken,
    activationBorderColor: line,
    sequenceNumberColor: surface,
    sectionBkgColor: sunken,
    altSectionBkgColor: surface,
    gridColor: line,
    doneTaskBkgColor: successSoft,
    doneTaskBorderColor: success,
    activeTaskBkgColor: actionSoft,
    activeTaskBorderColor: action,
    critBkgColor: dangerSoft,
    critBorderColor: danger,
    todayLineColor: danger,
    errorBkgColor: dangerSoft,
    errorTextColor: danger,
    pie1: action,
    pie2: success,
    pie3: attention,
    pie4: danger,
    pieStrokeColor: surface,
    pieOuterStrokeColor: line,
    pieTitleTextColor: ink,
    pieSectionTextColor: surface,
    pieLegendTextColor: ink,
  };
}

/** A button of a diagram's controls, with a drawn icon and a name for screen readers. */
function control(label: string, paths: string[], run: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  const icon = document.createElementNS(SVG, "svg");
  for (const [name, value] of Object.entries({
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.75",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  })) {
    icon.setAttribute(name, value);
  }
  for (const d of paths) {
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", d);
    icon.append(path);
  }
  button.append(icon);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    run();
  });
  return button;
}

/**
 * Moving and zooming a drawn diagram. The diagram's own drawing is put inside
 * one group, and only that group's transform changes: the drawing itself is
 * never redrawn. A mouse drags, a wheel with ⌘ or Ctrl zooms where it points,
 * two fingers pinch and move, and the keys + − 0 and the arrows do the same.
 */
export class PanZoom {
  private readonly svg: SVGSVGElement;
  private readonly box: HTMLElement;
  private readonly group: SVGGElement;
  private readonly hint: HTMLElement;
  private readonly width: number;
  private readonly height: number;
  private readonly left: number;
  private readonly top: number;
  private scale = 1;
  private x = 0;
  private y = 0;
  /** Whether the reader moved it. A box that changes size refits a diagram nobody touched. */
  private moved = false;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private readonly stop = new AbortController();
  private readonly resizing: ResizeObserver | undefined;
  private hintTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(svg: SVGSVGElement, box: HTMLElement) {
    this.svg = svg;
    this.box = box;
    const view = (svg.getAttribute("viewBox") ?? "0 0 100 100").split(/[\s,]+/).map(Number);
    this.left = view[0] ?? 0;
    this.top = view[1] ?? 0;
    this.width = view[2] || 100;
    this.height = view[3] || 100;
    this.group = document.createElementNS(SVG, "g");
    for (const child of [...svg.childNodes]) {
      const tag = child.nodeName.toLowerCase();
      if (tag !== "defs" && tag !== "style") this.group.append(child);
    }
    svg.append(this.group);
    this.hint = document.createElement("div");
    this.hint.className = "vd-mermaid-hint";
    this.hint.setAttribute("aria-hidden", "true");
    box.append(this.hint);
    this.fit(false);
    this.listen();
    if (typeof ResizeObserver === "function") {
      this.resizing = new ResizeObserver(() => {
        if (!this.moved) this.fit(false);
      });
      this.resizing.observe(box);
    }
  }

  /** The diagram whole and in the middle, no larger than it was drawn. */
  fit(animate = true): void {
    const shown = this.box.getBoundingClientRect();
    const width = shown.width || this.box.clientWidth || this.width;
    const height = shown.height || this.box.clientHeight || this.height;
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const scale = Math.min(
      1,
      (width - PADDING * 2) / this.width,
      (height - PADDING * 2) / this.height,
    );
    this.moved = false;
    this.place(
      Math.max(MIN_ZOOM, scale),
      (width - this.width * scale) / 2 - this.left * scale,
      (height - this.height * scale) / 2 - this.top * scale,
      animate,
    );
  }

  zoomBy(factor: number, at?: { x: number; y: number }): void {
    const shown = this.svg.getBoundingClientRect();
    const point = at ?? { x: shown.width / 2, y: shown.height / 2 };
    const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.scale * factor));
    if (scale === this.scale) return;
    const ratio = scale / this.scale;
    this.moved = true;
    this.place(
      scale,
      point.x - (point.x - this.x) * ratio,
      point.y - (point.y - this.y) * ratio,
      !at,
    );
  }

  panBy(dx: number, dy: number): void {
    this.moved = true;
    this.place(this.scale, this.x + dx, this.y + dy, false);
  }

  destroy(): void {
    this.stop.abort();
    this.resizing?.disconnect();
    clearTimeout(this.hintTimer);
    this.hint.remove();
  }

  private place(scale: number, x: number, y: number, animate: boolean): void {
    const from = this.group.getAttribute("transform");
    this.scale = scale;
    this.x = x;
    this.y = y;
    const to = `matrix(${scale},0,0,${scale},${x},${y})`;
    this.group.setAttribute("transform", to);
    // The controls' steps glide; a drag and a pinch follow the hand exactly.
    if (animate && from && !still() && typeof this.group.animate === "function") {
      this.group.animate([{ transform: from }, { transform: to }], { duration: 180, easing: EASE });
    }
  }

  private say(message: string): void {
    this.hint.textContent = message;
    this.hint.classList.add("vd-on");
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => this.hint.classList.remove("vd-on"), 1100);
  }

  private quiet(): void {
    clearTimeout(this.hintTimer);
    this.hint.classList.remove("vd-on");
  }

  private local(event: { clientX: number; clientY: number }) {
    const shown = this.svg.getBoundingClientRect();
    return { x: event.clientX - shown.left, y: event.clientY - shown.top };
  }

  private listen(): void {
    const signal = this.stop.signal;
    const box = this.box;
    box.addEventListener(
      "wheel",
      (event) => {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          this.quiet();
          this.zoomBy(Math.exp(-event.deltaY * 0.0025), this.local(event));
        } else {
          this.say(isMac() ? "Use ⌘ + scroll to zoom" : "Use Ctrl + scroll to zoom");
        }
      },
      { signal, passive: false },
    );
    box.addEventListener(
      "pointerdown",
      (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        if ((event.target as Element).closest(".vd-mermaid-controls")) return;
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (event.pointerType === "touch" && this.pointers.size < 2) return;
        box.setPointerCapture(event.pointerId);
        box.classList.add("vd-dragging");
      },
      { signal },
    );
    box.addEventListener(
      "pointermove",
      (event) => {
        const last = this.pointers.get(event.pointerId);
        if (!last) return;
        if (event.pointerType === "touch" && this.pointers.size < 2) {
          // One finger scrolls the page past the diagram, and is told how to move it.
          this.say("Use two fingers to move the diagram");
          return;
        }
        if (this.pointers.size >= 2) {
          event.preventDefault();
          this.quiet();
          const [a, b] = [...this.pointers.values()] as [
            { x: number; y: number },
            { x: number; y: number },
          ];
          const before = Math.hypot(a.x - b.x, a.y - b.y);
          const middleBefore = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
          const [c, d] = [...this.pointers.values()] as [
            { x: number; y: number },
            { x: number; y: number },
          ];
          const after = Math.hypot(c.x - d.x, c.y - d.y);
          const middle = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 };
          if (before > 0)
            this.zoomBy(after / before, this.local({ clientX: middle.x, clientY: middle.y }));
          this.panBy(middle.x - middleBefore.x, middle.y - middleBefore.y);
          return;
        }
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        this.panBy(event.clientX - last.x, event.clientY - last.y);
      },
      { signal, passive: false },
    );
    const lift = (event: PointerEvent) => {
      this.pointers.delete(event.pointerId);
      if (this.pointers.size === 0) box.classList.remove("vd-dragging");
    };
    box.addEventListener("pointerup", lift, { signal });
    box.addEventListener("pointercancel", lift, { signal });
    box.addEventListener(
      "keydown",
      (event) => {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        const step = 40;
        switch (event.key) {
          case "+":
          case "=":
            this.zoomBy(1.25);
            break;
          case "-":
            this.zoomBy(0.8);
            break;
          case "0":
            this.fit();
            break;
          case "ArrowLeft":
            this.panBy(step, 0);
            break;
          case "ArrowRight":
            this.panBy(-step, 0);
            break;
          case "ArrowUp":
            this.panBy(0, step);
            break;
          case "ArrowDown":
            this.panBy(0, -step);
            break;
          default:
            return;
        }
        event.preventDefault();
      },
      { signal },
    );
    box.addEventListener("dblclick", () => this.fit(), { signal });
  }
}

/** What a drawn figure keeps, to be put back as it was before it is drawn again. */
const drawn = new WeakMap<HTMLElement, { source: string; panZoom?: PanZoom }>();
let made = 0;

/** Undoes a drawing: the figure holds its source again. */
export function undraw(figure: HTMLElement): void {
  const kept = drawn.get(figure);
  if (!kept) return;
  kept.panZoom?.destroy();
  drawn.delete(figure);
  const pre = document.createElement("pre");
  pre.className = "vd-mermaid-source";
  const code = document.createElement("code");
  code.className = "language-mermaid";
  code.textContent = kept.source;
  pre.append(code);
  figure.replaceChildren(pre);
}

/** Draws one figure, in the colors of the page it is on. */
export async function drawFigure(figure: HTMLElement, mermaid: Mermaid): Promise<void> {
  const source = drawn.get(figure)?.source ?? figure.querySelector("code")?.textContent ?? "";
  undraw(figure);
  drawn.set(figure, { source });
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables: themeOf(figure),
    fontFamily: getComputedStyle(figure).fontFamily,
  });
  let svg: string;
  try {
    ({ svg } = await mermaid.render(`vd-diagram-${++made}`, source));
  } catch (error) {
    const said = document.createElement("p");
    said.className = "vd-mermaid-error";
    said.setAttribute("role", "status");
    said.textContent = `This diagram does not read: ${
      error instanceof Error ? error.message.split("\n")[0] : String(error)
    }`;
    figure.prepend(said);
    return;
  }
  if (drawn.get(figure)?.source !== source) return;
  const box = document.createElement("div");
  box.className = "vd-mermaid-drawn";
  box.tabIndex = 0;
  box.setAttribute("role", "img");
  box.setAttribute(
    "aria-label",
    `A diagram. Drag, or press the arrows, to move it; ${isMac() ? "⌘" : "Ctrl"} and scroll, or + and −, to zoom; 0 to fit it.`,
  );
  // The drawing is Mermaid's own, made under its strict rules, from what the page's author wrote.
  box.innerHTML = svg;
  const drawing = box.querySelector("svg");
  if (!drawing) return;
  const view = (drawing.getAttribute("viewBox") ?? "0 0 100 100").split(/[\s,]+/).map(Number);
  const [width = 100, height = 100] = [view[2], view[3]];
  figure.replaceChildren(box);
  const room = figure.clientWidth || width;
  const scale = Math.min(1, (room - PADDING * 2) / width);
  box.style.height = `${Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, height * scale + PADDING * 2)))}px`;
  drawing.removeAttribute("style");
  drawing.setAttribute("width", "100%");
  drawing.setAttribute("height", "100%");
  const panZoom = new PanZoom(drawing, box);
  const controls = document.createElement("div");
  controls.className = "vd-mermaid-controls";
  controls.append(
    control(
      "Zoom in",
      ["M11 8v6", "M8 11h6", "M21 21l-4.35-4.35", "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"],
      () => panZoom.zoomBy(1.25),
    ),
    control(
      "Zoom out",
      ["M8 11h6", "M21 21l-4.35-4.35", "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"],
      () => panZoom.zoomBy(0.8),
    ),
    control("Fit the diagram", ["M15 3h6v6", "M9 21H3v-6", "M21 3l-7 7", "M3 21l7-7"], () =>
      panZoom.fit(),
    ),
  );
  box.append(controls);
  drawn.set(figure, { source, panZoom });
}

let watching = false;

/**
 * Draws every diagram in a part of a page, and draws them again when the
 * page's theme changes, so they are always in its colors.
 */
export async function drawAll(root: ParentNode, load: () => Promise<Mermaid>): Promise<void> {
  const figures = () => [...root.querySelectorAll<HTMLElement>("[data-vd-mermaid]")];
  if (figures().length === 0) return;
  const mermaid = await load();
  for (const figure of figures()) await drawFigure(figure, mermaid);
  if (watching || typeof MutationObserver !== "function") return;
  watching = true;
  const again = () => {
    for (const figure of figures()) void drawFigure(figure, mermaid);
  };
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", again);
  new MutationObserver(again).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "class"],
  });
}

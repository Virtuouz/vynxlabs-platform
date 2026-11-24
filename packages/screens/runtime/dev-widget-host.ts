/**
 * The page `volvel dev` draws a developer's widget in. It is the host of production without
 * React: the same frame (`frame.html`, a sandboxed iframe), the same checks on what the frame
 * says (`createChannel`), the same props posted in, the same theme tokens (`readTheme`). Around
 * it are the controls a developer needs: config, data, state, size, theme, and a log of the
 * events the widget raised and whether the host let them through.
 *
 * The CLI builds this file with esbuild and serves the result; it is not part of the console.
 */
import type { WidgetState } from "@volvel/widgets";
import { FRAME_PROTOCOL, type FrameProps, type HostMessage } from "@volvel/widgets/frame";
import { createChannel } from "../src/frameChannel.ts";
import { readTheme } from "../src/frameTheme.ts";

interface Info {
  type: string;
  name: string;
  version: string;
  title: string;
  problems: string[];
  frame: string | null;
  built: string;
  events: Record<
    string,
    { gives: "record" | "group" | "nothing"; label: string; payload?: Record<string, unknown> }
  >;
  schema: { properties?: Record<string, Record<string, unknown>> };
  config: Record<string, unknown>;
  data: Record<string, unknown>;
  state: WidgetState;
  sampled: boolean;
}

const PRESETS = [1440, 768, 390];
const STATES = ["ready", "loading", "empty", "failed", "forbidden"] as const;
const name = decodeURIComponent(location.pathname.split("/").pop() ?? "");
const saved = (() => {
  try {
    return JSON.parse(sessionStorage.getItem(`volvel-dev:${name}`) ?? "{}") as Record<
      string,
      unknown
    >;
  } catch {
    return {};
  }
})();

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
  ...children: (Node | string)[]
) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  node.append(...children);
  return node;
};
const field = (label: string, control: HTMLElement, hint?: string) => {
  const id = `f-${Math.random().toString(36).slice(2, 8)}`;
  control.id = id;
  const wrap = el("div", { class: "field" }, el("label", { for: id }, label), control);
  if (hint) wrap.append(el("small", {}, hint));
  return wrap;
};

const root = document.getElementById("app") as HTMLElement;
let info: Info;
let config: Record<string, unknown> = {};
let data: Record<string, unknown> = {};
let state: WidgetState = { status: "ready" };
let width = typeof saved.width === "number" ? saved.width : 768;
let height = typeof saved.height === "number" ? saved.height : 240;
let scheme: "light" | "dark" =
  saved.scheme === "dark" || saved.scheme === "light" ? saved.scheme : readTheme().scheme;
let channel = createChannel({ events: {} });
let phase: "loading" | "ready" | "stopped" = "loading";
let asked: number | undefined;

const persist = () => {
  try {
    sessionStorage.setItem(
      `volvel-dev:${name}`,
      JSON.stringify({ config, data, state, width, height, scheme }),
    );
  } catch {
    // Without storage, a reload starts again from the fixture.
  }
};

// Page structure.
const problems = el("div", { class: "problems", role: "alert" });
const stage = el("div", { class: "stage" });
const cell = el("section", { class: "cell", "aria-label": "Widget preview" });
const iframe = el("iframe", {
  title: "Widget",
  sandbox: "allow-scripts",
  referrerpolicy: "no-referrer",
  allow: "",
});
const status = el("p", { class: "status", role: "status" });
cell.append(iframe, status);
stage.append(cell);
const logList = el("ol", {
  class: "log-list",
  role: "log",
  "aria-live": "polite",
  "aria-label": "Events",
});
const controls = el("form", { class: "controls", "aria-label": "Preview controls" });
controls.addEventListener("submit", (event) => event.preventDefault());
root.append(
  el("header", {}, el("a", { href: "/_dev/widgets" }, "All widgets"), el("h1", {}, "")),
  problems,
  el(
    "div",
    { class: "layout" },
    controls,
    el(
      "div",
      { class: "main" },
      stage,
      el(
        "section",
        { class: "log", "aria-labelledby": "log-h" },
        el("h2", { id: "log-h" }, "Events"),
        logList,
      ),
    ),
  ),
);

function note(kind: "passed" | "dropped" | "info", title: string, detail: string) {
  const row = el(
    "li",
    { class: `entry ${kind}` },
    el("span", { class: "when" }, new Date().toLocaleTimeString()),
    el("strong", {}, title),
    el(
      "span",
      { class: "verdict" },
      kind === "passed" ? "passed the host's checks" : kind === "dropped" ? "dropped" : "",
    ),
    el("code", {}, detail),
  );
  logList.prepend(row);
  while (logList.children.length > 100) logList.lastChild?.remove();
}

function applyFrameSize() {
  cell.style.width = `${width}px`;
  cell.style.height = `${height}px`;
  iframe.style.height = asked === undefined ? "100%" : `min(${asked}px, 100%)`;
  iframe.style.colorScheme = scheme;
}

const sizeProp = () => ({
  w: Math.max(1, Math.min(12, Math.round(width / 120))),
  h: Math.max(1, Math.round((height + 12) / 52)),
  narrow: width <= 480,
});

function post() {
  const target = iframe.contentWindow;
  if (!target || phase !== "ready") return;
  const props: FrameProps = {
    config,
    data: data as FrameProps["data"],
    state,
    size: sizeProp(),
    theme: { ...readTheme(), scheme },
  };
  const message: HostMessage = { protocol: FRAME_PROTOCOL, from: "host", type: "props", props };
  try {
    target.postMessage(message, "*");
  } catch {
    note("info", "props", "could not be posted");
  }
}

function setScheme(next: "light" | "dark") {
  scheme = next;
  document.documentElement.dataset.theme = next;
  applyFrameSize();
  persist();
  // The page's tokens change with the attribute, so read them after it has.
  requestAnimationFrame(post);
}

window.addEventListener("message", (event) => {
  // Only this frame's own window is believed.
  if (!iframe.contentWindow || event.source !== iframe.contentWindow) return;
  const verdict = channel.receive(event.data);
  switch (verdict.kind) {
    case "ready":
      if (phase !== "stopped") phase = "ready";
      status.textContent = "";
      post();
      break;
    case "size":
      asked = verdict.height;
      applyFrameSize();
      note("info", "size", `asked for ${verdict.height}px`);
      break;
    case "event":
      note("passed", verdict.event, JSON.stringify(verdict.payload));
      break;
    case "dropped": {
      const what = (event.data as { event?: unknown } | null)?.event;
      note("dropped", typeof what === "string" ? what : "message", verdict.reason);
      break;
    }
    case "flood":
      phase = "stopped";
      iframe.remove();
      status.textContent = "This widget was stopped: it sent too many messages.";
      note("dropped", "flood", "too many messages");
      break;
  }
});

function loadFrame() {
  if (!info.frame) {
    status.textContent = "No view yet: fix the errors above.";
    return;
  }
  phase = "loading";
  asked = undefined;
  applyFrameSize();
  channel = createChannel({ events: info.events });
  status.textContent = "Loading";
  if (!iframe.isConnected) cell.prepend(iframe);
  iframe.src = `${info.frame}?v=${info.built}`;
}

// Controls.
function drawControls() {
  controls.replaceChildren();
  const title = root.querySelector("h1");
  if (title) title.textContent = `${info.title} (${info.type} v${info.version})`;
  document.title = `${info.title} - widget preview`;

  // Size.
  const widthInput = el("input", { type: "number", min: "120", max: "2000", value: String(width) });
  const heightInput = el("input", {
    type: "number",
    min: "40",
    max: "1600",
    value: String(height),
  });
  const apply = () => {
    width = Math.max(120, Number(widthInput.value) || width);
    height = Math.max(40, Number(heightInput.value) || height);
    applyFrameSize();
    persist();
    post();
  };
  widthInput.addEventListener("input", apply);
  heightInput.addEventListener("input", apply);
  const presets = el("div", { class: "presets", role: "group", "aria-label": "Width presets" });
  for (const preset of PRESETS) {
    const button = el("button", { type: "button" }, String(preset));
    button.addEventListener("click", () => {
      widthInput.value = String(preset);
      apply();
    });
    presets.append(button);
  }
  controls.append(
    el("h2", {}, "Size"),
    presets,
    field("Width (px)", widthInput),
    field("Height (px)", heightInput),
  );

  // Theme and state.
  const themeSelect = el(
    "select",
    {},
    ...(["light", "dark"] as const).map((one) =>
      el("option", one === scheme ? { value: one, selected: "" } : { value: one }, one),
    ),
  );
  themeSelect.addEventListener("change", () => setScheme(themeSelect.value as "light" | "dark"));
  const stateSelect = el(
    "select",
    {},
    ...STATES.map((one) =>
      el("option", one === state.status ? { value: one, selected: "" } : { value: one }, one),
    ),
  );
  stateSelect.addEventListener("change", () => {
    const next = stateSelect.value as WidgetState["status"];
    state =
      next === "ready" || next === "loading"
        ? { status: next }
        : {
            status: next,
            message:
              next === "empty"
                ? "Nothing to show."
                : next === "failed"
                  ? "It could not be read."
                  : "You may not see this.",
          };
    persist();
    post();
  });
  controls.append(el("h2", {}, "Page"), field("Theme", themeSelect), field("State", stateSelect));

  // Config, from the schema.
  const properties = info.schema.properties ?? {};
  controls.append(el("h2", {}, "Config"));
  const change = (key: string, value: unknown) => {
    config = { ...config, [key]: value };
    persist();
    post();
  };
  for (const [key, schema] of Object.entries(properties)) {
    const hint = (schema["x-volvel"] ?? {}) as { label?: string };
    const label = hint.label ?? key;
    const current = config[key];
    const options = Array.isArray(schema.enum) ? (schema.enum as unknown[]) : undefined;
    let control: HTMLElement;
    if (options) {
      const select = el(
        "select",
        {},
        ...options.map((one) => el("option", { value: String(one) }, String(one))),
      );
      select.value = String(current ?? "");
      select.addEventListener("change", () => {
        const picked = options.find((one) => String(one) === select.value);
        change(key, picked);
      });
      control = select;
    } else if (schema.type === "boolean") {
      const box = el("input", { type: "checkbox" });
      box.checked = current === true;
      box.addEventListener("change", () => change(key, box.checked));
      control = box;
    } else if (schema.type === "number" || schema.type === "integer") {
      const input = el("input", {
        type: "number",
        value: current === undefined ? "" : String(current),
      });
      input.addEventListener("input", () =>
        change(key, input.value === "" ? undefined : Number(input.value)),
      );
      control = input;
    } else if (schema.type === "string") {
      const input = el("input", {
        type: "text",
        value: typeof current === "string" ? current : "",
      });
      input.addEventListener("input", () => change(key, input.value));
      control = input;
    } else {
      const area = el("textarea", { rows: "4", spellcheck: "false" });
      area.value = JSON.stringify(current ?? null, null, 2);
      const complaint = el("small", { class: "bad", role: "alert" });
      area.addEventListener("input", () => {
        try {
          change(key, JSON.parse(area.value));
          complaint.textContent = "";
        } catch {
          complaint.textContent = "Not valid JSON yet; the widget keeps its last settings.";
        }
      });
      control = area;
      const wrap = field(label, control);
      wrap.append(complaint);
      controls.append(wrap);
      continue;
    }
    controls.append(
      field(
        label,
        control,
        typeof schema.description === "string" ? schema.description : undefined,
      ),
    );
  }
  if (Object.keys(properties).length === 0)
    controls.append(el("p", { class: "muted" }, "This widget has no settings."));

  // Data.
  const area = el("textarea", { rows: "10", spellcheck: "false" });
  area.value = JSON.stringify(data, null, 2);
  const complaint = el("small", { class: "bad", role: "alert" });
  area.addEventListener("input", () => {
    try {
      const next = JSON.parse(area.value) as Record<string, unknown>;
      if (typeof next !== "object" || next === null || Array.isArray(next))
        throw new Error("not an object");
      data = next;
      complaint.textContent = "";
      persist();
      post();
    } catch {
      complaint.textContent = "Not valid JSON yet; the widget keeps its last data.";
    }
  });
  controls.append(
    el("h2", {}, "Data"),
    field(
      "Data by input (JSON)",
      area,
      info.sampled
        ? "Made up from the declared inputs: add a fixture.json beside view.tsx to say your own."
        : "From fixture.json.",
    ),
    complaint,
  );
}

function showProblems() {
  problems.replaceChildren();
  if (info.problems.length === 0) return;
  problems.append(
    el("h2", {}, "This widget does not build"),
    el("ul", {}, ...info.problems.map((one) => el("li", {}, one))),
    el("p", {}, "The preview reloads when a file is saved."),
  );
}

async function fetchInfo(): Promise<Info> {
  const answer = await fetch(`/_dev/widgets/data/${encodeURIComponent(name)}.json`, {
    cache: "no-store",
  });
  if (!answer.ok) throw new Error(`The widget ${name} is not defined by this repository.`);
  return (await answer.json()) as Info;
}

async function start() {
  document.documentElement.dataset.theme = scheme;
  info = await fetchInfo();
  config = (saved.config as Record<string, unknown> | undefined) ?? info.config;
  data = (saved.data as Record<string, unknown> | undefined) ?? info.data;
  state = (saved.state as WidgetState | undefined) ?? info.state;
  showProblems();
  drawControls();
  applyFrameSize();
  loadFrame();
  new EventSource("/_dev/events").addEventListener("reload", async () => {
    try {
      const next = await fetchInfo();
      const changedDefinition =
        JSON.stringify([next.schema, next.type, next.version]) !==
        JSON.stringify([info.schema, info.type, info.version]);
      info = next;
      // What the developer set stays, except settings that are no longer declared.
      const declared = Object.keys(next.schema.properties ?? {});
      config = Object.fromEntries([
        ...declared.map((key) => [key, key in config ? config[key] : next.config[key]]),
      ]);
      showProblems();
      if (changedDefinition) drawControls();
      if (next.problems.length === 0) {
        loadFrame();
        note("info", "rebuilt", `${next.type} v${next.version}`);
      }
    } catch (error) {
      problems.replaceChildren(el("p", {}, (error as Error).message));
    }
  });
}

start().catch((error: Error) => {
  root.replaceChildren(
    el("p", { role: "alert" }, error.message),
    el("a", { href: "/_dev/widgets" }, "All widgets"),
  );
});

import { createFrame } from "@volvel/widget-frame";

/**
 * Everything a widget's view must not be able to do, tried once the page has given it its
 * props. What happened is written into #report as JSON for the test to read; the view itself
 * never reports to the page except through the one event it declares.
 */
const frame = createFrame({ events: ["hello"] });
const root = document.getElementById("root") as HTMLElement;
document.body.style.cssText =
  "font:14px system-ui;background:var(--volvel-surface,#fff);color:var(--volvel-ink,#000)";

const outcome = async (name: string, attempt: () => unknown | Promise<unknown>) => {
  try {
    const value = await attempt();
    return [name, { ok: true, value: String(value) }] as const;
  } catch (error) {
    return [name, { ok: false, error: (error as Error).name }] as const;
  }
};

const report: Record<string, unknown> = {};
let tried = false;
async function attack(origin: string) {
  const results = await Promise.all([
    outcome("fetchInstance", () => fetch("/api/v1/instance").then((r) => r.status)),
    outcome("fetchAbsolute", () => fetch(`${origin}/api/v1/instance`).then((r) => r.status)),
    outcome("fetchOther", () => fetch("http://127.0.0.1:9/").then((r) => r.status)),
    outcome("cookie", () => document.cookie),
    outcome("parentDocument", () => window.parent.document.title),
    outcome(
      "parentCookie",
      () => (window.parent as Window & { document: Document }).document.cookie,
    ),
    outcome("topNavigation", () => {
      (window.top as Window).location.href = "http://127.0.0.1:9/hijacked";
      return "navigated?";
    }),
    outcome("parentNavigation", () => {
      window.parent.location.href = "http://127.0.0.1:9/hijacked";
      return "navigated?";
    }),
    outcome("windowOpen", () => window.open("about:blank", "_blank")),
    outcome("localStorage", () => localStorage.length),
    outcome("sendBeacon", () => navigator.sendBeacon("/api/v1/instance", "x")),
    outcome("xhr", () => {
      const request = new XMLHttpRequest();
      request.open("GET", "/api/v1/instance", false);
      request.send();
      return request.status;
    }),
  ]);
  for (const [name, result] of results) report[name] = result;
  // Said to the page that holds this frame: none of it is an event the definition declares, or
  // it does not fit the one that is.
  const send = (message: unknown) => window.parent.postMessage(message, "*");
  const base = { protocol: "volvel-widget/1", from: "frame" };
  send({ ...base, type: "event", event: "deleteEverything", payload: {} });
  send({ ...base, type: "event", event: "hello", payload: { note: 7 } });
  send({ ...base, type: "event", event: "hello", payload: { note: "x", extra: true } });
  send({ ...base, type: "event", event: "hello", payload: { note: "x".repeat(70_000) } });
  send({ type: "event", event: "hello", payload: { note: "no protocol" } });
  send("a string");
  // Drawing beyond the cell: a very large box, and a request for a very tall frame.
  const big = document.createElement("div");
  big.id = "big";
  big.style.cssText =
    "pointer-events:none;position:fixed;left:-9000px;top:-9000px;width:20000px;height:20000px;background:rgba(255,0,0,.18)";
  document.body.append(big);
  frame.requestSize(9_000_000);
  report.done = true;
  render();
}

function render() {
  const props = frame.props();
  root.replaceChildren();
  const shown = document.createElement("p");
  shown.id = "shown";
  const rows = props?.data.rows;
  shown.textContent = rows && rows.shape === "rows" ? JSON.stringify(rows.rows) : "no data";
  const say = document.createElement("button");
  say.id = "say";
  say.type = "button";
  say.textContent = "Say hello";
  say.onclick = () => frame.emit("hello", { note: "hello from the frame" });
  const out = document.createElement("pre");
  out.id = "report";
  out.textContent = JSON.stringify(report);
  const scheme = document.createElement("p");
  scheme.id = "scheme";
  scheme.textContent = `${props?.theme.scheme} ${document.documentElement.dataset.theme ?? ""} ${getComputedStyle(document.documentElement).getPropertyValue("--volvel-canvas")}`;
  root.append(shown, say, scheme, out);
}

frame.onProps(() => {
  render();
  if (!tried) {
    tried = true;
    void attack(location.origin === "null" ? "http://localhost:8444" : location.origin);
  }
});

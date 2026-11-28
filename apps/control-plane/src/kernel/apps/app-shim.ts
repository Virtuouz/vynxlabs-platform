/**
 * What lets an app written as code that was built with an older `@volvel/app` keep working once
 * its page is sandboxed (decision 0008). Such a client calls the API with the page's cookie and
 * follows runs with an `EventSource`; a sandboxed page has no cookie, and an EventSource cannot
 * send a token. This script, which the platform serves and puts first in every such page, gives
 * those calls the page's app token:
 *
 * - `fetch` to the API with no Authorization header of its own is sent with the token, and no
 *   credentials, renewed before it ends and once more when the API refuses it;
 * - an `EventSource` on the API is read with `fetch` and the token instead.
 *
 * A client that sends its own token (0.7 and later) passes through untouched. Kept for as long as
 * bundles built with 0.6 are owed (the versioning policy: the last three minor versions).
 */
export const APP_SHIM_PATH = "/_platform/app-token.js";

export const APP_SHIM_JS = `(() => {
  "use strict";
  const element = document.getElementById("vx-context");
  if (!element) return;
  let context;
  try { context = JSON.parse(element.textContent || "{}"); } catch { return; }
  if (!("token" in context)) return;
  const api = new URL(context.api || "/api/v1", location.href).href + "/";
  const own = globalThis.fetch.bind(globalThis);
  let held = context.token;
  let renewing = null;
  const RENEW_BEFORE_MS = 240000;
  async function authorization(force) {
    if (!held) return null;
    if (force || Date.parse(held.expiresAt) - Date.now() < RENEW_BEFORE_MS) {
      const was = held;
      renewing = renewing || own(api + "app-token", {
        credentials: "omit",
        headers: { authorization: "Bearer " + was.token },
      })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null)
        .then((fresh) => { held = fresh; return fresh; })
        .finally(() => { renewing = null; });
      await renewing;
    }
    return held ? "Bearer " + held.token : null;
  }
  const toApi = (url) => {
    try { return new URL(url, location.href).href.startsWith(api); } catch { return false; }
  };
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    if (!toApi(url)) return own(input, init);
    const headers = new Headers(init && init.headers ? init.headers : input instanceof Request ? input.headers : undefined);
    if (headers.has("authorization")) return own(input, init);
    const send = async (force) => {
      const value = await authorization(force);
      const sent = new Headers(headers);
      if (value) sent.set("authorization", value);
      return own(input instanceof Request ? input.clone() : input, { ...init, headers: sent, credentials: "omit" });
    };
    const response = await send(false);
    return response.status === 401 && held ? send(true) : response;
  };

  class TokenEventSource {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 2;
    constructor(url) {
      this.url = new URL(url, location.href).href;
      this.readyState = 0;
      this.listeners = new Map();
      this.lastId = undefined;
      this.retry = 3000;
      this.onmessage = null;
      this.onerror = null;
      this.onopen = null;
      this.connect();
    }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(listener);
    }
    removeEventListener(type, listener) {
      this.listeners.get(type)?.delete(listener);
    }
    close() {
      this.readyState = 2;
      this.abort?.abort();
    }
    emit(type, data) {
      const event = new MessageEvent(type, { data, lastEventId: this.lastId || "" });
      const handler = this["on" + type];
      if (typeof handler === "function") handler.call(this, event);
      for (const listener of this.listeners.get(type) || []) listener.call(this, event);
    }
    async connect() {
      if (this.readyState === 2) return;
      this.abort = new AbortController();
      try {
        const headers = { accept: "text/event-stream" };
        if (this.lastId) headers["last-event-id"] = this.lastId;
        const response = await globalThis.fetch(this.url, { headers, signal: this.abort.signal });
        if (!response.ok || !response.body) {
          this.readyState = 2;
          this.emit("error");
          return;
        }
        this.readyState = 1;
        this.emit("open");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\\r\\n?/g, "\\n");
          let end = buffer.indexOf("\\n\\n");
          while (end >= 0) {
            const block = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            let type = "message";
            const data = [];
            for (const line of block.split("\\n")) {
              if (line.startsWith(":")) continue;
              const at = line.indexOf(":");
              const field = at < 0 ? line : line.slice(0, at);
              const text = at < 0 ? "" : line.slice(at + 1).replace(/^ /, "");
              if (field === "event") type = text;
              else if (field === "data") data.push(text);
              else if (field === "id") this.lastId = text;
              else if (field === "retry" && /^\\d+$/.test(text)) this.retry = Number(text);
            }
            if (data.length > 0 || type !== "message") this.emit(type, data.join("\\n"));
            end = buffer.indexOf("\\n\\n");
          }
        }
      } catch {
        if (this.readyState === 2) return;
      }
      if (this.readyState === 2) return;
      this.readyState = 0;
      this.emit("error");
      setTimeout(() => this.connect(), this.retry);
    }
  }
  const OwnEventSource = globalThis.EventSource;
  globalThis.EventSource = function EventSource(url, options) {
    return toApi(url) ? new TokenEventSource(url) : new OwnEventSource(url, options);
  };
  Object.assign(globalThis.EventSource, { CONNECTING: 0, OPEN: 1, CLOSED: 2 });
})();
`;

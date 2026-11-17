// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  adoptLegacy,
  loadPreferences,
  readPreference,
  resetPreferences,
  setPreference,
} from "./prefs.ts";

let calls: { method: string; url: string; body: unknown }[];
let server: { key: string; value: unknown }[];

beforeEach(() => {
  localStorage.clear();
  resetPreferences();
  calls = [];
  server = [];
  vi.useFakeTimers();
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({ method, url, body: init.body ? JSON.parse(init.body as string) : undefined });
    if (method === "GET") return new Response(JSON.stringify({ items: server }), { status: 200 });
    return new Response(null, { status: 204 });
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("settings kept the old way move to their new keys, once", () => {
  localStorage.setItem("vx-theme", "dark");
  localStorage.setItem("vx-panel", "closed");
  localStorage.setItem("vx-density:runs", "compact");
  localStorage.setItem("vx-split:script-editor", "64.5");
  localStorage.setItem("vx-editor-pane", "input");
  expect(adoptLegacy().sort()).toEqual([
    "density:runs",
    "editor.pane",
    "panel",
    "split:script-editor",
    "theme",
  ]);
  expect(readPreference("theme", "system")).toBe("dark");
  expect(readPreference("panel", true)).toBe(false);
  expect(readPreference("split:script-editor", 60)).toBe(64.5);
  expect(localStorage.getItem("vx-theme")).toBeNull();
  expect(adoptLegacy()).toEqual([]);
  // One written again later is newer than the moved one, and replaces it.
  localStorage.setItem("vx-theme", "light");
  expect(adoptLegacy()).toEqual(["theme"]);
  expect(readPreference("theme", "system")).toBe("light");
});

test("this browser's copy is read at once; the server's replaces it, and what only this browser had is sent", async () => {
  localStorage.setItem("vx-density:runs", "compact");
  localStorage.setItem("vx-pref:theme", JSON.stringify("light"));
  expect(readPreference("theme", "system")).toBe("light");
  server = [{ key: "theme", value: "dark" }];
  await loadPreferences();
  expect(readPreference("theme", "system")).toBe("dark");
  await vi.advanceTimersByTimeAsync(500);
  // The density moved from the old key, which the server did not have, is sent to it.
  expect(
    calls.filter((call) => call.method === "PUT").map((call) => [call.url, call.body]),
  ).toEqual([["/api/v1/me/preferences/density%3Aruns", { value: "compact" }]]);
});

test("a change still waiting to be sent is not undone by the server's older copy", async () => {
  setPreference("theme", "light");
  server = [{ key: "theme", value: "dark" }];
  await loadPreferences();
  expect(readPreference("theme", "system")).toBe("light");
});

test("a change is sent once after a moment, and forgetting one deletes it", async () => {
  setPreference("split:flow-editor", 40);
  setPreference("split:flow-editor", 45);
  setPreference("split:flow-editor", 50);
  await vi.advanceTimersByTimeAsync(500);
  expect(calls).toEqual([
    { method: "PUT", url: "/api/v1/me/preferences/split%3Aflow-editor", body: { value: 50 } },
  ]);
  setPreference("split:flow-editor", undefined);
  await vi.advanceTimersByTimeAsync(500);
  expect(calls.at(-1)).toMatchObject({ method: "DELETE" });
  expect(readPreference("split:flow-editor", 60)).toBe(60);
});

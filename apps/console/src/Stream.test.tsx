// @vitest-environment happy-dom
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useLoad } from "./api.ts";
import { RunsWorkbench } from "./screens/Runs.tsx";
import { useStreamConnected, useTenantStream } from "./stream.ts";
import { show } from "./testing.tsx";

/** A stand-in for the browser's EventSource that the test drives. */
class FakeSource {
  static last: FakeSource | undefined;
  static readonly OPEN = 1;
  readyState = 0;
  readonly url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  readonly #listeners = new Map<string, ((event: MessageEvent) => void)[]>();
  constructor(url: string) {
    this.url = url;
    FakeSource.last = this;
  }
  addEventListener(name: string, listener: (event: MessageEvent) => void) {
    this.#listeners.set(name, [...(this.#listeners.get(name) ?? []), listener]);
  }
  close() {
    this.closed = true;
  }
  emit(name: string, data: unknown) {
    this.readyState = 1;
    for (const listener of this.#listeners.get(name) ?? []) {
      listener(new MessageEvent(name, { data: JSON.stringify(data) }));
    }
  }
  fail() {
    this.readyState = 0;
    this.onerror?.();
  }
}

let asked: string[];

beforeEach(() => {
  asked = [];
  FakeSource.last = undefined;
  vi.stubGlobal("EventSource", FakeSource);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("fetch", async (address: string) => {
    asked.push(address);
    const items = address.includes("/activity")
      ? [
          {
            kind: "script",
            id: "r1",
            target: "orders/sync",
            status: "running",
            state: "running",
            trigger: "manual",
            attempt: 1,
            maxAttempts: 1,
            error: null,
            bundleVersion: 1,
            createdAt: new Date().toISOString(),
            startedAt: new Date().toISOString(),
            finishedAt: null,
          },
        ]
      : [];
    return Response.json({ items, stateCounts: { running: 1 }, keptDays: 30, n: asked.length });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Watch({ path }: { path: string }) {
  const loaded = useLoad<{ n: number }>(path);
  return <p>{loaded.data ? `read ${path}` : "…"}</p>;
}

function Tab({ children }: { children?: React.ReactNode }) {
  useTenantStream("t1");
  const live = useStreamConnected();
  return (
    <>
      <p>{live ? "connected" : "not connected"}</p>
      {children}
    </>
  );
}

const reads = (path: string) => asked.filter((one) => one === `/api/v1${path}`).length;

test("a change in a workspace has what is shown of it read again, and nothing else", async () => {
  show(
    <Tab>
      <Watch path="/tenants/t1/workspaces/w1/summary" />
      <Watch path="/tenants/t1/workspaces/w2/summary" />
      <Watch path="/tenants/t1/summary" />
    </Tab>,
  );
  expect(FakeSource.last?.url).toBe("/api/v1/tenants/t1/stream");
  await screen.findByText("read /tenants/t1/workspaces/w1/summary");
  expect(screen.getByText("not connected")).toBeTruthy();
  act(() => FakeSource.last?.emit("ready", {}));
  expect(screen.getByText("connected")).toBeTruthy();

  act(() => FakeSource.last?.emit("run", { k: "run", w: "w1", id: "r9", s: "succeeded" }));
  await waitFor(() => expect(reads("/tenants/t1/workspaces/w1/summary")).toBe(2));
  // The tenant's counts follow; the other workspace is left alone.
  await waitFor(() => expect(reads("/tenants/t1/summary")).toBe(2));
  expect(reads("/tenants/t1/workspaces/w2/summary")).toBe(1);

  // Events may have been missed: everything is read again.
  act(() => FakeSource.last?.emit("snapshot", {}));
  await waitFor(() => expect(reads("/tenants/t1/workspaces/w2/summary")).toBe(2));
});

test("the runs list stops polling while events arrive, and starts again when they stop", async () => {
  show(
    <Tab>
      <RunsWorkbench
        root="/tenants/t1/workspaces/w1"
        link="/t/t1/workspaces/w1"
        selected={undefined}
      />
    </Tab>,
  );
  await screen.findByText("orders/sync");
  expect(screen.getByText("Live · updates every 5s")).toBeTruthy();
  act(() => FakeSource.last?.emit("ready", {}));
  expect(await screen.findByText("Live")).toBeTruthy();
  act(() => FakeSource.last?.fail());
  expect(await screen.findByText("Live · updates every 5s")).toBeTruthy();
});

test("the stream is closed when nothing on screen needs it", async () => {
  const { unmount } = show(<Tab />);
  const source = FakeSource.last;
  unmount();
  expect(source?.closed).toBe(true);
});

// @vitest-environment happy-dom
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useLoad } from "./api.ts";
import { LiveIndicator } from "./kit/LiveIndicator.tsx";
import { useLiveRun } from "./screens/Execution.tsx";
import { RunsWorkbench } from "./screens/Runs.tsx";
import { useStreamConnected, useTenantStream } from "./stream.ts";
import { show } from "./testing.tsx";

/** A stand-in for the browser's EventSource that the test drives. */
class FakeSource {
  static last: FakeSource | undefined;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
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
            errorSummary: null,
            tags: [],
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
      <RunsWorkbench root="/tenants/t1/workspaces/w1" link="/t/t1/workspaces/w1" />
    </Tab>,
  );
  await screen.findByText("orders/sync");
  expect(screen.getByText(/asked again every 5 s/)).toBeTruthy();
  act(() => FakeSource.last?.emit("ready", {}));
  await waitFor(() => expect(screen.queryByText(/asked again every 5 s/)).toBeNull());
  act(() => FakeSource.last?.fail());
  expect(await screen.findByText(/asked again every 5 s/)).toBeTruthy();
});

test("the stream is closed when nothing on screen needs it", async () => {
  const { unmount } = show(<Tab />);
  const source = FakeSource.last;
  unmount();
  expect(source?.closed).toBe(true);
});

test("the shell says Live, then Reconnecting after a few seconds down, then Offline with the time", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    function Header() {
      useTenantStream("t1");
      return <LiveIndicator />;
    }
    show(<Header />);
    act(() => FakeSource.last?.emit("ready", {}));
    expect(screen.getByRole("status").textContent).toBe("Live");
    act(() => FakeSource.last?.fail());
    // A short drop does not flicker.
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.getByRole("status").textContent).toBe("Live");
    act(() => vi.advanceTimersByTime(2500));
    expect(screen.getByRole("status").textContent).toBe("Reconnecting…");
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByRole("status").textContent).toMatch(/^Offline · last updated \d\d:\d\d/);
    act(() => FakeSource.last?.emit("ready", {}));
    expect(screen.getByRole("status").textContent).toBe("Live");
  } finally {
    vi.useRealTimers();
  }
});

function Followed({ runId }: { runId: string }) {
  const { run } = useLiveRun("/tenants/t1/workspaces/w1", runId);
  return <p>{run ? `state ${run.status}` : "…"}</p>;
}

test("a run followed while the stream is up is read again now and then, so a missed event does not leave it running (P32)", async () => {
  // The run ends on the server, and no event about it arrives (it ended before the page asked,
  // or the event was lost): the page asks again on its own, more slowly than when the stream is down.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    let ended = false;
    vi.stubGlobal("fetch", async (address: string) => {
      asked.push(address);
      if (address.endsWith("/runs/r1"))
        return Response.json({ id: "r1", status: ended ? "succeeded" : "running" });
      if (address.includes("/runs/r1/logs")) return Response.json({ items: [], done: ended });
      return Response.json({ items: [] });
    });
    show(
      <Tab>
        <Followed runId="r1" />
      </Tab>,
    );
    act(() => FakeSource.last?.emit("ready", {}));
    expect(await screen.findByText("state running")).toBeTruthy();
    ended = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(await screen.findByText("state succeeded")).toBeTruthy();
    // Once it has ended, it is not asked for again.
    const after = reads("/tenants/t1/workspaces/w1/runs/r1");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });
    expect(reads("/tenants/t1/workspaces/w1/runs/r1")).toBe(after);
  } finally {
    vi.useRealTimers();
  }
});

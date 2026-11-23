// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { ApiError } from "../api.ts";
import { useDraftSave } from "./draftSave.ts";

afterEach(cleanup);

/** A save that waits until the test lets it answer. */
function server() {
  const sent: { value: string; revision: number | undefined }[] = [];
  const waiting: (() => void)[] = [];
  let revision = 0;
  return {
    sent,
    send: (value: string, at: number | undefined) => {
      sent.push({ value, revision: at });
      return new Promise<{ revision: number; value: string }>((resolve) => {
        waiting.push(() => {
          revision += 1;
          resolve({ revision, value });
        });
      });
    },
    answer: () => waiting.shift()?.(),
  };
}

test("an edit during a save in flight stays unsaved and is saved again after it", async () => {
  const api = server();
  const echoes: [string, boolean][] = [];
  const { result } = renderHook(() =>
    useDraftSave<string, { revision: number; value: string }>({
      send: api.send,
      applied: (answer, _sent, current) => echoes.push([answer.value, current]),
    }),
  );
  act(() => result.current.edit("one"));
  let done: Promise<boolean> = Promise.resolve(false);
  act(() => {
    done = result.current.save();
  });
  act(() => result.current.edit("one two"));
  await act(async () => api.answer());
  // The first answer does not clear what was typed since, and does not count as the newest.
  expect(result.current.dirty).toBe(true);
  expect(echoes[0]).toEqual(["one", false]);
  expect(api.sent).toEqual([
    { value: "one", revision: undefined },
    { value: "one two", revision: 1 },
  ]);
  await act(async () => api.answer());
  expect(await done).toBe(true);
  expect(result.current.dirty).toBe(false);
  expect(result.current.revision).toBe(2);
  expect(echoes[1]).toEqual(["one two", true]);
});

test("a save pressed with nothing changed sends nothing, and a forced one sends", async () => {
  const api = server();
  const { result } = renderHook(() =>
    useDraftSave<string, { revision: number }>({ send: api.send }),
  );
  act(() => result.current.reset("loaded", 4));
  await act(async () => {
    await result.current.save();
  });
  expect(api.sent).toEqual([]);
  act(() => {
    void result.current.save(true);
  });
  expect(api.sent).toEqual([{ value: "loaded", revision: 4 }]);
  // The server's answer is older than the revision it was given: the newest is kept.
  await act(async () => api.answer());
  expect(result.current.revision).toBe(4);
});

test("the revision of a save is the one the next save sends, and a refused save stays unsaved", async () => {
  let fail = false;
  const sent: (number | undefined)[] = [];
  const failures: unknown[] = [];
  const { result } = renderHook(() =>
    useDraftSave<string, { revision: number }>({
      send: async (_value, revision) => {
        sent.push(revision);
        if (fail) throw new Error("refused");
        return { revision: (revision ?? 0) + 1 };
      },
      failed: (error) => failures.push(error),
    }),
  );
  act(() => result.current.edit("a"));
  await act(async () => {
    await result.current.save();
  });
  act(() => result.current.edit("b"));
  fail = true;
  let ok = true;
  await act(async () => {
    ok = await result.current.save();
  });
  expect(sent).toEqual([undefined, 1]);
  expect(ok).toBe(false);
  expect(failures).toHaveLength(1);
  expect(result.current.dirty).toBe(true);
  expect(result.current.revision).toBe(1);
});

test("a save refused because someone else saved first is a clash: not retried, not reported as a failure, cleared by their version (BLD-01)", async () => {
  const failures: unknown[] = [];
  let sends = 0;
  const { result } = renderHook(() =>
    useDraftSave<string, { revision: number }>({
      send: async () => {
        sends += 1;
        throw new ApiError(409, {
          code: "draft_changed",
          detail: "Someone else saved this draft.",
        });
      },
      failed: (error) => failures.push(error),
    }),
  );
  act(() => result.current.reset("mine", 1));
  act(() => result.current.edit("mine, changed"));
  await act(async () => {
    expect(await result.current.save()).toBe(false);
  });
  expect(result.current.clashed).toBe(true);
  expect(failures).toEqual([]);
  await act(async () => {
    expect(await result.current.save()).toBe(false);
  });
  expect(sends).toBe(1);
  act(() => result.current.reset("theirs", 2));
  expect(result.current.clashed).toBe(false);
});

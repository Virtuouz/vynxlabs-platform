/**
 * Tasks: what one of the workspace's workers does for the platform, such as
 * reading a script's schema from its code, or trying a connection. The
 * console follows one until it ends.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.ts";
import { useStreamConnected, useStreamEvents } from "./stream.ts";

/** How long a task may wait for a worker before the person is told why. */
const PATIENCE_MS = 20_000;

export interface TaskState {
  status: "queued" | "running" | "succeeded" | "failed";
  result: unknown;
  error: { message: string } | null;
}

/**
 * Follows a task until it ends: on the stream, or every two seconds while the
 * stream is down. `ended` is called once, with how it ended.
 */
export function useTaskEnd(
  root: string,
  taskId: string | undefined,
  ended: (task: TaskState) => void,
): { waiting: boolean; slow: boolean } {
  const [slow, setSlow] = useState(false);
  const streaming = useStreamConnected();
  const latest = useRef(ended);
  latest.current = ended;
  const check = useCallback(async () => {
    if (!taskId) return;
    const task = await api.get<TaskState>(`${root}/tasks/${taskId}`).catch(() => undefined);
    if (task && (task.status === "succeeded" || task.status === "failed")) latest.current(task);
  }, [root, taskId]);
  useEffect(() => {
    setSlow(false);
    if (!taskId) return;
    void check();
    const patience = setTimeout(() => setSlow(true), PATIENCE_MS);
    const poll = streaming ? undefined : setInterval(() => void check(), 2000);
    return () => {
      clearTimeout(patience);
      if (poll) clearInterval(poll);
    };
  }, [taskId, check, streaming]);
  useStreamEvents(
    (event) => event.k === "task" && event.id === taskId,
    () => void check(),
  );
  return { waiting: taskId !== undefined, slow };
}

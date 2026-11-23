import { Button, Dialog, Notice, SelectField } from "@volvel/ui";
import { useState } from "react";
import { api } from "../api.ts";
import { failureText, notify } from "../ask.tsx";
import { DurationField } from "./FlowStepFields.tsx";

/** Shown in words: "2 days", "90 minutes". */
export function lengthOf(seconds: number): string {
  for (const [size, one, many] of [
    [86400, "day", "days"],
    [3600, "hour", "hours"],
    [60, "minute", "minutes"],
  ] as const) {
    if (seconds % size === 0) return `${seconds / size} ${seconds / size === 1 ? one : many}`;
  }
  return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
}

/**
 * Cancels the runs that have been going, or waiting to start, for longer than a
 * time: the way out of a pile of runs that will never finish. Flow runs and
 * script runs have a route each, so which is asked. Up to 10,000 are canceled at
 * a time, and it says when there are more.
 */
export function CancelOlder({
  open,
  onClose,
  root,
  scope,
  filters,
  done,
}: {
  open: boolean;
  onClose: () => void;
  root: string;
  /** The filters the runs list has on, in words: they narrow script runs only. */
  scope: string;
  filters: Record<string, unknown>;
  /** Called after runs were canceled, so the list can catch up. */
  done: () => void;
}) {
  const [seconds, setSeconds] = useState<number>();
  const [which, setWhich] = useState<"flow" | "script">("flow");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [sure, setSure] = useState(false);
  // Each time it opens it starts empty: the length's unit is kept by the field, so the field is new.
  const [opening, setOpening] = useState(0);
  const close = () => {
    setSeconds(undefined);
    setWhich("flow");
    setSure(false);
    setProblem(undefined);
    setOpening((n) => n + 1);
    onClose();
  };
  const run = async () => {
    if (!seconds) return;
    setBusy(true);
    setProblem(undefined);
    try {
      const result =
        which === "flow"
          ? await api.post<{ cancelled: number; more: boolean }>(`${root}/flow-runs/cancel`, {
              olderThanSeconds: seconds,
            })
          : await api.post<{ cancelled: number; more: boolean }>(`${root}/runs/cancel`, {
              include: "all",
              olderThanSeconds: seconds,
              ...(Object.keys(filters).length > 0 ? { filters } : {}),
            });
      const noun = which === "flow" ? "flow run" : "script run";
      notify.success(
        result.cancelled === 0
          ? `No ${noun} has been going for more than ${lengthOf(seconds)}.`
          : `${result.cancelled} ${noun}${result.cancelled === 1 ? "" : "s"} canceled${result.more ? ". More are left: cancel again." : "."}`,
      );
      done();
      close();
    } catch (error) {
      setProblem(failureText(error));
      setSure(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title="Cancel runs by age"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Keep them
          </Button>
          {sure ? (
            <Button variant="danger" disabled={busy} onClick={() => void run()}>
              {busy ? "Canceling…" : `Cancel runs older than ${lengthOf(seconds ?? 0)}`}
            </Button>
          ) : (
            <Button variant="danger" disabled={!seconds} onClick={() => setSure(true)}>
              Continue
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {problem ? <Notice tone="danger">{problem}</Notice> : null}
        <SelectField
          name="cancel-which"
          label="Which runs"
          value={which}
          options={[
            { value: "flow", label: "Flow runs that are going" },
            { value: "script", label: "Script runs, queued and going" },
          ]}
          onChange={(next) => {
            setWhich(next === "script" ? "script" : "flow");
            setSure(false);
          }}
        />
        <DurationField
          key={opening}
          name="older"
          label="Started more than this long ago"
          value={seconds}
          max={315360000}
          hint="Counted from when each run was started."
          onChange={(next) => {
            setSeconds(next);
            setSure(false);
          }}
        />
        <p className="m-0 text-body-sm text-ink-muted">
          {which === "flow"
            ? "Every flow run in this workspace that is still going is checked, with its steps and the flows it started. A flow that has finished is left as it is."
            : `Script runs in this workspace${scope ? `, ${scope},` : ""} that are queued or going are checked. A flow's own steps are left to their flow.`}{" "}
          Up to 10,000 are canceled at a time.
        </p>
        {sure && seconds ? (
          <Notice tone="attention">
            This cancels every {which === "flow" ? "flow" : "script"} run started more than{" "}
            {lengthOf(seconds)} ago that has not finished. It cannot be undone.
          </Notice>
        ) : null}
      </div>
    </Dialog>
  );
}

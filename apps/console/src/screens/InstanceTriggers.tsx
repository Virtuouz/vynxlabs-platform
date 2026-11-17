import { Button, Notice } from "@vynxlabs/ui";
import { useState } from "react";
import { api, useLoad } from "../api.ts";
import { ask, failureText, notify } from "../ask.tsx";
import { PageHeader, Panel, SectionLabel } from "../kit/layout.tsx";
import { StatePill } from "../kit/status.tsx";
import { fromNow } from "./Overview.tsx";

interface Triggers {
  paused: boolean;
  reason: string | null;
  byEnvironment: boolean;
  updatedAt: string | null;
}

/**
 * The operator's emergency stop: every trigger in every tenant paused at once,
 * for an instance that is falling behind or falling over. Runs already queued
 * or going carry on; each workspace's runs list cancels them in bulk.
 */
export function InstanceTriggers() {
  const loaded = useLoad<Triggers>("/instance/triggers");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  const change = async (paused: boolean) => {
    let reason: string | null | undefined;
    if (paused) {
      reason = await ask.prompt({
        title: "Pause every trigger?",
        text: "No schedule, webhook, form or event starts anything in any tenant until you resume. Schedules keep their times and fire once on resuming. Runs already queued or going carry on.",
        label: "Why",
        hint: "Shown here, and kept in the audit log.",
        required: false,
        action: "Pause every trigger",
        danger: true,
      });
      if (reason === null) return;
    }
    setBusy(true);
    setProblem(undefined);
    try {
      await api.put("/instance/triggers", { paused, ...(reason ? { reason } : {}) });
      notify.success(paused ? "Every trigger is paused." : "Triggers are running again.");
      loaded.reload();
    } catch (error) {
      setProblem(failureText(error));
    } finally {
      setBusy(false);
    }
  };

  const state = loaded.data;
  return (
    <div className="flex max-w-[60rem] flex-col gap-6">
      <PageHeader
        eyebrow="Instance"
        title="Triggers"
        description="Stop every schedule, webhook, form and event in every tenant at once."
      />
      {loaded.error ? <Notice tone="danger">{loaded.error.message}</Notice> : null}
      {problem ? <Notice tone="danger">{problem}</Notice> : null}
      {state ? (
        <section className="flex flex-col gap-3">
          <SectionLabel>Emergency stop</SectionLabel>
          {state.paused ? (
            <Notice
              tone="attention"
              action={
                state.byEnvironment ? undefined : (
                  <Button size="small" disabled={busy} onClick={() => change(false)}>
                    Resume triggers
                  </Button>
                )
              }
            >
              <strong>Every trigger is paused.</strong>{" "}
              {state.byEnvironment
                ? "TRIGGERS_PAUSED is set where the instance runs. Unset it and restart to resume."
                : `Paused ${state.updatedAt ? fromNow(state.updatedAt) : ""}${state.reason ? `: ${state.reason}` : "."}`}
            </Notice>
          ) : (
            <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
              <span className="flex min-w-0 flex-1 basis-64 flex-col gap-0.5">
                <StatePill state="on">Triggers are on</StatePill>
                <span className="text-meta text-ink-muted">
                  Pausing stops them across the instance at once, whatever each workspace says. Use
                  it when scripts are piling up faster than they finish.
                </span>
              </span>
              <Button size="small" disabled={busy} onClick={() => change(true)}>
                Pause every trigger
              </Button>
            </Panel>
          )}
        </section>
      ) : null}
    </div>
  );
}

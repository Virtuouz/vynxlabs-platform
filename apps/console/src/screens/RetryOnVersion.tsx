import { Button, Dialog, Notice, SelectField } from "@volvel/ui";
import { useState } from "react";
import { useLoad } from "../api.ts";
import { ago } from "../kit/format.ts";
import { ErrorState } from "../kit/LoadState.tsx";
import { type FlowVersion, flowFromFailed, flowFromStart } from "./runAgain.ts";

interface BundleRow {
  id: string;
  version: number;
  active: boolean;
  createdAt: string;
}

/**
 * Runs a flow run again on a version the person picks, not only the one it ran or the
 * one deployed now: from its failed step when it failed, or from the start. The retry
 * asks as the others do, saying what runs again, and a refusal (a version that draws
 * a kept step differently, or has no such flow) is shown here.
 */
export function RetryOnVersion({
  open,
  onClose,
  root,
  id,
  flow,
  failed,
  started,
}: {
  open: boolean;
  onClose: () => void;
  root: string;
  /** The flow run. */
  id: string;
  flow: string;
  /** It failed or was canceled, so there is a failed step to retry from. */
  failed: boolean;
  started: (id: string) => void;
}) {
  const bundles = useLoad<{ items: BundleRow[] }>(open ? `${root}/bundles` : null);
  const [version, setVersion] = useState<string>();
  const [picked, setFrom] = useState<"failed" | "start">();
  // Which run it is can change while this stays mounted: what is not offered is not what runs.
  const from = failed ? (picked ?? "failed") : "start";
  const items = bundles.data?.items ?? [];
  const chosen = items.find((one) => one.id === version) ?? items.find((one) => one.active);
  // The dialog steps aside and the usual question is asked: what runs again, on which version.
  // A refusal from the server is said once, as the other retries say it.
  const go = () => {
    if (!chosen) return;
    const named: FlowVersion = { bundleId: chosen.id, version: chosen.version };
    const again = { root, id, started };
    onClose();
    if (from === "failed") void flowFromFailed(again, named);
    else void flowFromStart({ ...again, flow, bundleVersion: chosen.version }, named);
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Run ${flow} on another version`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!chosen} onClick={go}>
            Continue
          </Button>
        </>
      }
    >
      {bundles.error ? (
        <ErrorState error={bundles.error} onRetry={bundles.reload} />
      ) : !bundles.data ? (
        <p className="m-0 text-body-sm text-ink-muted">Loading the versions…</p>
      ) : items.length === 0 ? (
        <Notice tone="attention">
          This workspace has no versions yet. Deploy it first, and a flow run can be run on one.
        </Notice>
      ) : (
        <div className="flex flex-col gap-3">
          <SelectField
            name="retry-version"
            label="Version"
            value={chosen?.id ?? ""}
            options={items.map((one) => ({
              value: one.id,
              label: `v${one.version}, ${ago(one.createdAt)}${one.active ? " (deployed now)" : ""}`,
            }))}
            onChange={setVersion}
          />
          <SelectField
            name="retry-from"
            label="Run"
            value={from}
            options={[
              ...(failed ? [{ value: "failed", label: "From the failed step" }] : []),
              { value: "start", label: "Every step again, from the start" },
            ]}
            hint={
              from === "failed"
                ? "Steps that went well are kept, if that version draws them the same. You are shown what runs again before it starts."
                : "Every step runs again with the same input."
            }
            onChange={(next) => setFrom(next === "failed" ? "failed" : "start")}
          />
        </div>
      )}
    </Dialog>
  );
}

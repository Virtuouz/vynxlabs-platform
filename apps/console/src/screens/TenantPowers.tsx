import { Button, SideSheet } from "@volvel/ui";
import { useState } from "react";
import { api, useLoad } from "../api.ts";
import { notify } from "../ask.tsx";
import { ErrorState, Loading } from "../kit/LoadState.tsx";
import { SectionLabel } from "../kit/layout.tsx";
import { RetentionSettings } from "./Retention.tsx";

interface TenantState {
  managedWorkers: boolean;
  managedWorkersLocked?: boolean;
}
interface Policy {
  effective: Record<"runsDays" | "eventsDays" | "refusalsDays" | "auditDays", number>;
}

/**
 * What an operator may do to a tenant without opening it, so without an access grant:
 * whether the instance starts workers for it, and how long its history is kept. Both are
 * the instance's to say, and neither shows anything inside the tenant.
 */
export function TenantPowers({ tenant }: { tenant: { id: string; name: string } }) {
  const base = `/tenants/${tenant.id}`;
  const state = useLoad<TenantState>(base);
  const policy = useLoad<Policy>(`${base}/retention`);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const setWorkers = async (on: boolean) => {
    setBusy(true);
    try {
      await api.patch(base, { managedWorkers: on });
      notify.success(
        on
          ? `The instance starts workers for ${tenant.name} when there is work.`
          : `The instance starts no workers for ${tenant.name}. Only an operator can turn it on again.`,
      );
      await state.reload();
    } catch (error) {
      notify.error(error);
    } finally {
      setBusy(false);
    }
  };

  const days = policy.data?.effective;
  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Workers the instance starts" className="flex flex-col gap-2">
        <SectionLabel>Workers the instance starts</SectionLabel>
        {state.error ? (
          <ErrorState error={state.error} what="this tenant's workers" onRetry={state.reload} />
        ) : state.data ? (
          <>
            <p className="m-0 text-body-sm">
              {state.data.managedWorkers
                ? "The instance starts workers for this tenant when it has work."
                : state.data.managedWorkersLocked
                  ? "An operator turned this off: the instance starts no workers for it, and only an operator turns it on again."
                  : "The instance starts no workers for this tenant: it runs its scripts on workers of its own."}
            </p>
            <span>
              <Button
                size="small"
                loading={busy}
                {...(state.data.managedWorkers ? { variant: "danger" as const } : {})}
                onClick={() => void setWorkers(!state.data?.managedWorkers)}
              >
                {state.data.managedWorkers ? "Start no workers for it" : "Start workers for it"}
              </Button>
            </span>
          </>
        ) : (
          <Loading what="this tenant's workers" />
        )}
      </section>
      <section aria-label="History kept" className="flex flex-col gap-2">
        <SectionLabel>History kept</SectionLabel>
        {policy.error ? (
          <ErrorState error={policy.error} what="this tenant's retention" onRetry={policy.reload} />
        ) : days ? (
          <>
            <p className="m-0 text-body-sm">
              Runs {days.runsDays} days, events {days.eventsDays}, refused requests{" "}
              {days.refusalsDays}, audit log {days.auditDays}.
            </p>
            <span>
              <Button size="small" onClick={() => setOpen(true)}>
                Change how long
              </Button>
            </span>
          </>
        ) : (
          <Loading what="this tenant's retention" />
        )}
      </section>
      <SideSheet
        open={open}
        onClose={() => {
          setOpen(false);
          void policy.reload();
        }}
        title={`History kept for ${tenant.name}`}
        description="Runs, events and refused requests older than their period are removed within minutes. Leave a field empty to use the instance's default."
      >
        <RetentionSettings base={base} bare />
      </SideSheet>
    </div>
  );
}

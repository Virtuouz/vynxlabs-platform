import { Menu } from "@vynxlabs/ui";
import { ChevronDown, Rocket } from "lucide-react";
import { useState } from "react";
import { api, useLoad } from "../api.ts";
import { notify } from "../ask.tsx";
import { navigate, useUrlParam } from "../router.tsx";

interface WorkspaceRef {
  id: string;
  name: string;
  type: "dev" | "production";
  linkedWorkspaceId?: string | null;
}

/** Where a workspace promotes to, when it promotes anywhere. */
export function usePromotesTo(root: string): WorkspaceRef | undefined {
  const tenantRoot = root.split("/workspaces/")[0] as string;
  const here = useLoad<WorkspaceRef>(root);
  const all = useLoad<{ items: WorkspaceRef[] }>(
    here.data?.linkedWorkspaceId ? `${tenantRoot}/workspaces` : null,
  );
  return all.data?.items.find((one) => one.id === here.data?.linkedWorkspaceId);
}

/** The address of the release screen's promote step, carrying the run a fix came from. */
export function promoteStep(link: string, fromRun: string | undefined) {
  return `${link}/release?step=promote${fromRun ? `&fromRun=${encodeURIComponent(fromRun)}` : ""}`;
}

/**
 * Deploy from where the change was made: this change alone, after the same
 * checks a full deploy makes, or every draft from the release screen. A deploy
 * reaches only this dev workspace, so it is not asked about twice. Success
 * offers the next step: promoting it.
 */
export function DeployMenu({
  root,
  link,
  path,
  disabled = false,
  onDeployed,
}: {
  root: string;
  link: string;
  path: string;
  disabled?: boolean;
  onDeployed: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const target = usePromotesTo(root);
  // A fix made from a failed run carries that run, so the promotion can offer to run it again.
  const [fromRun] = useUrlParam("fromRun");

  const deployThis = async () => {
    setBusy(true);
    try {
      const preview = await api.get<{
        possible: boolean;
        refusal: { detail: string; errors: { path: string; message: string }[] } | null;
      }>(`${root}/changes/preview?paths=${encodeURIComponent(path)}`);
      if (!preview.possible) {
        const why = preview.refusal?.errors.map((one) => `${one.path}: ${one.message}`).join("; ");
        notify.error(
          new Error(
            `${preview.refusal?.detail ?? "It cannot be deployed."}${why ? ` ${why}` : ""}`,
          ),
        );
        return;
      }
      const done = await api.post<{ bundleVersion: number }>(`${root}/changes/deploy`, {
        paths: [path],
      });
      onDeployed();
      notify.success(
        `Deployed ${path} as version ${done.bundleVersion}.`,
        target
          ? {
              action: {
                label: `Promote to ${target.name}`,
                onClick: () => navigate(promoteStep(link, fromRun)),
              },
            }
          : undefined,
      );
    } catch (error) {
      notify.error(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Menu
      label={
        <span className="flex items-center gap-1.5">
          <Rocket aria-hidden="true" size={14} /> Deploy
          <ChevronDown aria-hidden="true" size={13} />
        </span>
      }
      ariaLabel="Deploy"
      align="end"
      triggerClassName={`flex h-8 items-center rounded-control border border-line-control px-2.5 text-meta hover:bg-surface ${
        disabled || busy ? "pointer-events-none opacity-50" : ""
      }`}
      items={[
        { label: "This change only", onSelect: () => void deployThis() },
        {
          label: "Review all drafts",
          onSelect: () =>
            navigate(`${link}/release${fromRun ? `?fromRun=${encodeURIComponent(fromRun)}` : ""}`),
        },
      ]}
    />
  );
}

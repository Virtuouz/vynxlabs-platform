import { Button, Dialog, Notice, SelectField } from "@volvel/ui";
import { useState } from "react";
import { api, useLoad } from "../api.ts";
import { failureText, noteWaiting } from "../ask.tsx";
import { Loading } from "../kit/LoadState.tsx";
import { CopyButton } from "../ListScreen.tsx";
import { Link } from "../router.tsx";

interface Account {
  id: string;
  name: string;
}

interface Binding {
  resourceId: string | null;
  principalType: string;
  principalId: string | null;
  roleName: string;
}

/**
 * Gives one script or flow to an AI agent: binds a service account to the
 * built-in `agent_runner` role at that script or flow, which may start it and
 * nothing else, and says where the agent connects. The agent is offered that
 * tool, with no sight of the rest of the workspace.
 */
export function OfferToAgent({
  open,
  onClose,
  tenantId,
  workspaceId,
  kind,
  path,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  workspaceId: string;
  kind: "script" | "flow";
  path: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Offer to an agent">
      {open ? (
        <OfferForm
          tenantId={tenantId}
          workspaceId={workspaceId}
          kind={kind}
          path={path}
          onClose={onClose}
        />
      ) : null}
    </Dialog>
  );
}

function OfferForm({
  tenantId,
  workspaceId,
  kind,
  path,
  onClose,
}: {
  tenantId: string;
  workspaceId: string;
  kind: "script" | "flow";
  path: string;
  onClose: () => void;
}) {
  const base = `/tenants/${tenantId}`;
  const accounts = useLoad<{ items: Account[] }>(`${base}/service-accounts`);
  const roles = useLoad<{ items: { id: string; name: string; builtin: boolean }[] }>(
    `${base}/roles`,
  );
  const resource = useLoad<{ id: string }>(`${base}/workspaces/${workspaceId}/resources/${path}`);
  const bindings = useLoad<{ items: Binding[] }>(`${base}/bindings?workspaceId=${workspaceId}`);
  const [chosen, setChosen] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ account: Account; address: string }>();

  const runner = roles.data?.items.find((role) => role.builtin && role.name === "agent_runner");
  const account = chosen ?? accounts.data?.items[0]?.id;
  const already = (id: string | undefined) =>
    Boolean(
      id &&
        bindings.data?.items.some(
          (binding) =>
            binding.principalType === "service_account" &&
            binding.principalId === id &&
            binding.resourceId === resource.data?.id &&
            binding.roleName === "agent_runner",
        ),
    );
  const failed = accounts.error ?? roles.error ?? resource.error;
  const what = kind === "script" ? "run the script" : "start the flow";

  if (done) {
    return (
      <div className="flex flex-col gap-3">
        <Notice tone="success">
          {done.account.name} may now {what} <code className="font-mono">{path}</code>, and nothing
          else here. An agent connecting with one of its keys is offered it as a tool.
        </Notice>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="block text-body-sm text-ink-muted">Address for the agent</span>
            <code className="font-mono text-code break-all">{done.address}</code>
          </span>
          <CopyButton value={done.address} label="Copy the address" />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Link
            to={`/t/${tenantId}/service-accounts/${done.account.id}`}
            className="self-center text-action"
          >
            Keys and tools of {done.account.name}
          </Link>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  if (failed) return <Notice tone="danger">{failed.message}</Notice>;
  if (!accounts.data || !roles.data || !resource.data) {
    return <Loading />;
  }
  if (accounts.data.items.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="m-0">
          An agent connects as a service account, with one of its keys. This tenant has none yet.
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Link to={`/t/${tenantId}/service-accounts`} className="self-center text-action">
            Create a service account
          </Link>
        </div>
      </div>
    );
  }
  const chosenAccount = accounts.data.items.find((one) => one.id === account);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!chosenAccount || !runner || !resource.data) return;
        setBusy(true);
        setProblem(undefined);
        try {
          if (!already(chosenAccount.id)) {
            await api.post(`${base}/bindings`, {
              workspaceId,
              resourceId: resource.data.id,
              principalType: "service_account",
              principalId: chosenAccount.id,
              roleId: runner.id,
            });
          }
          const offered = await api.get<{ address: string }>(
            `${base}/service-accounts/${chosenAccount.id}/tools?workspace=${workspaceId}`,
          );
          setDone({ account: chosenAccount, address: offered.address });
        } catch (error) {
          if (noteWaiting(error)) onClose();
          else setProblem(failureText(error));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="m-0 text-ink-muted">
        The account may {what} <code className="font-mono">{path}</code> and nothing else: it is
        given the Agent runner role here, at this {kind} alone. An agent connecting with its key
        sees no other script, flow or run in the workspace.
      </p>
      {problem ? <Notice tone="danger">{problem}</Notice> : null}
      {runner ? null : (
        <Notice tone="danger">This instance has no Agent runner role. Upgrade it first.</Notice>
      )}
      <SelectField
        name="account"
        label="Service account"
        value={account ?? ""}
        options={accounts.data.items.map((one) => ({ value: one.id, label: one.name }))}
        onChange={setChosen}
      />
      {already(account) ? (
        <p className="m-0 text-body-sm text-ink-muted">
          It is offered to this account already. Continue to see where the agent connects.
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy} disabled={!runner}>
          {already(account) ? "Continue" : "Offer"}
        </Button>
      </div>
    </form>
  );
}

/** A button that opens the offer, for a script or flow in the workspace at `root` (`/tenants/:t/workspaces/:w`). */
export function OfferButton({
  root,
  kind,
  path,
  size,
  deployed = true,
}: {
  root: string;
  kind: "script" | "flow";
  path: string;
  size?: "small";
  /** Only something deployed can be offered: a draft meets a 404. One condition for the editor and the list. */
  deployed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!deployed) return null;
  const [, , tenantId = "", , workspaceId = ""] = root.split("/");
  return (
    <>
      <Button {...(size ? { size } : {})} onClick={() => setOpen(true)}>
        Offer to an agent…
      </Button>
      <OfferToAgent
        open={open}
        onClose={() => setOpen(false)}
        tenantId={tenantId}
        workspaceId={workspaceId}
        kind={kind}
        path={path}
      />
    </>
  );
}

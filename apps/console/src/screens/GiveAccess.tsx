import { Button, ComboboxField, Notice, SelectField, SideSheet } from "@volvel/ui";
import { useEffect, useState } from "react";
import { api, useLoad } from "../api.ts";
import { failureText, notify } from "../ask.tsx";

interface Principal {
  type: "member" | "group" | "service_account" | "end_user" | "end_user_group";
  id: string;
  label: string;
  detail: string | null;
}
interface Role {
  id: string;
  name: string;
  description?: string;
  workspaceId?: string | null;
}

/** Everyone who signs in to the tenant's apps: chosen as a whole, not found by name. */
const EVERY_END_USER = "end_users:";

/**
 * Giving someone access, starting from who they are (08 §3.40): find them by
 * name or email, among members, groups, service accounts and end users; then
 * say where, the whole tenant or one workspace; then the role, from those that
 * can be held there, workspace roles included. One step, one sheet.
 */
export function GiveAccess({
  base,
  open,
  onClose,
  onGiven,
  who,
  inWorkspace,
}: {
  /** The tenant's API address. */
  base: string;
  open: boolean;
  onClose: () => void;
  onGiven: () => void;
  /** Someone already chosen, such as the service account whose page this is opened from. */
  who?: { type: Principal["type"]; id: string; label: string };
  /**
   * Access given at this one workspace only, for someone who may give it there and nowhere else:
   * the roles and the people to choose from are read at the workspace.
   */
  inWorkspace?: { id: string; name: string };
}) {
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const [principal, setPrincipal] = useState<string>();
  const [chosenWorkspace, setWorkspaceId] = useState("");
  const workspaceId = inWorkspace?.id ?? chosenWorkspace;
  const at = inWorkspace ? `&workspaceId=${inWorkspace.id}` : "";
  const [roleId, setRoleId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed.trim()), 250);
    return () => clearTimeout(timer);
  }, [typed]);
  const found = useLoad<{ items: Principal[] }>(
    open && !who
      ? `${base}/principals?limit=10${query ? `&q=${encodeURIComponent(query)}` : ""}${at}`
      : null,
  );
  const workspaces = useLoad<{ items: { id: string; name: string }[] }>(
    open && !inWorkspace ? `${base}/workspaces` : null,
  );
  const roles = useLoad<{ items: Role[] }>(open ? `${base}/roles?limit=200${at}` : null);
  // A role defined in a workspace is offered only there.
  const usable = (roles.data?.items ?? []).filter(
    (role) => !role.workspaceId || role.workspaceId === workspaceId,
  );
  const chosen = who ? `${who.type}:${who.id}` : principal;
  const described = usable.find((one) => one.id === roleId)?.description || undefined;
  const close = () => {
    setTyped("");
    setPrincipal(undefined);
    setWorkspaceId("");
    setRoleId(undefined);
    setProblem(undefined);
    onClose();
  };
  const options = [
    ...(found.data?.items ?? []).map((one) => ({
      value: `${one.type}:${one.id}`,
      label: one.label,
      ...(one.detail ? { hint: one.detail } : {}),
    })),
    {
      value: EVERY_END_USER,
      label: "Every end user who signs in",
      hint: "All of them, now and later",
    },
  ];

  return (
    <SideSheet
      open={open}
      onClose={close}
      title="Give access"
      description="Who, where, and with which role. It counts from their next request."
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!chosen || !roleId}
            onClick={async () => {
              if (!chosen || !roleId) return;
              const [principalType, principalId] = chosen.split(":");
              setBusy(true);
              setProblem(undefined);
              try {
                await api.post(`${base}/bindings`, {
                  principalType,
                  ...(principalId ? { principalId } : {}),
                  roleId,
                  ...(workspaceId ? { workspaceId } : {}),
                });
                const role = usable.find((one) => one.id === roleId)?.name ?? "the role";
                const name =
                  who?.label ?? options.find((one) => one.value === chosen)?.label ?? "They";
                const where =
                  inWorkspace?.name ??
                  workspaces.data?.items.find((one) => one.id === workspaceId)?.name;
                notify.success(
                  `${name} holds ${role}${where ? ` in ${where}` : " in the whole tenant"}.`,
                );
                onGiven();
                close();
              } catch (error) {
                setProblem(failureText(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            Give access
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {who ? (
          <div className="flex flex-col gap-1">
            <span className="text-body-sm font-medium">Who</span>
            <span>{who.label}</span>
          </div>
        ) : (
          <ComboboxField
            label="Who"
            placeholder="A name or an email"
            hint="Members, groups, service accounts and end users."
            options={options}
            value={principal}
            onChange={setPrincipal}
            onSearch={setTyped}
            empty={found.loading ? "Looking…" : "Nobody by that name."}
          />
        )}
        {inWorkspace ? (
          <div className="flex flex-col gap-1">
            <span className="text-body-sm font-medium">Where</span>
            <span>{inWorkspace.name}</span>
          </div>
        ) : (
          <SelectField
            name="workspaceId"
            label="Where"
            value={workspaceId}
            options={[
              { value: "", label: "The whole tenant" },
              ...(workspaces.data?.items ?? []).map((one) => ({ value: one.id, label: one.name })),
            ]}
            onChange={(next) => {
              setWorkspaceId(next);
              setRoleId(undefined);
            }}
          />
        )}
        <SelectField
          name="roleId"
          label="Role"
          value={roleId ?? ""}
          required
          options={[
            { value: "", label: "Choose…" },
            ...usable.map((role) => ({
              value: role.id,
              label: role.workspaceId ? `${role.name} (this workspace's)` : role.name,
            })),
          ]}
          {...(described ? { hint: described } : {})}
          onChange={(next) => setRoleId(next || undefined)}
        />
        {problem ? <Notice tone="danger">{problem}</Notice> : null}
        {/* Nothing to choose from is said with its reason, not shown as an empty list. */}
        {roles.error ? <Notice tone="danger">{failureText(roles.error)}</Notice> : null}
        {found.error ? <Notice tone="danger">{failureText(found.error)}</Notice> : null}
      </div>
    </SideSheet>
  );
}

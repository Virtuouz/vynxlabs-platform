import { APP_FACING_KINDS } from "@volvel/manifest";
import { Button, ComboboxField, Notice, SelectField, SideSheet } from "@volvel/ui";
import { useEffect, useState } from "react";
import { api, useLoad } from "../api.ts";
import { failureText, noteWaiting, notify } from "../ask.tsx";

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
  permissions?: string[];
}

/** Nobody signed in holds anything but what apps use: only a role that gives some is offered. */
const givesAppPermissions = (role: Role) =>
  (role.permissions ?? []).some(
    (one) => one.startsWith("*:") || APP_FACING_KINDS.includes(one.split(":")[0] ?? ""),
  );

/** Everyone who signs in to the tenant's apps: chosen as a whole, not found by name. */
const EVERY_END_USER = "end_users:";
/** Anyone at all, with no sign-in: for what an app shows in public. */
const ANYONE = "anonymous:";
const WHOLE_WORKSPACE = "";

/**
 * With two-person approval on, a role given straight to a member or to end users still applies at
 * once; only what is given to a group, a service account or a group of end users waits. Said
 * where the role is given, so nobody thinks a second person will be asked.
 */
export function DirectGrantNote({ base, active }: { base: string; active: boolean }) {
  const access = useLoad<{ approval?: boolean }>(active ? `${base}/access` : null);
  if (!active || !access.data?.approval) return null;
  return (
    <Notice tone="attention">
      Changes to this tenant's access wait for a second person, but a role given straight to a
      member or to end users applies at once and does not wait. A role given to a group, a service
      account or a group of end users does wait.
    </Notice>
  );
}

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
  const [thing, setThing] = useState(WHOLE_WORKSPACE);
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
  // One thing in the workspace is chosen from what the workspace holds.
  const things = useLoad<{ items: { id: string; kind: string; path: string }[] }>(
    open && workspaceId ? `${base}/workspaces/${workspaceId}/resources` : null,
  );
  const chosen = who ? `${who.type}:${who.id}` : principal;
  // A role defined in a workspace is offered only there. Anyone without signing in is offered
  // only the roles that give something an app uses.
  const usable = (roles.data?.items ?? [])
    .filter((role) => !role.workspaceId || role.workspaceId === workspaceId)
    .filter((role) => chosen !== ANYONE || givesAppPermissions(role));
  const described = usable.find((one) => one.id === roleId)?.description || undefined;
  const close = () => {
    setTyped("");
    setPrincipal(undefined);
    setWorkspaceId("");
    setThing(WHOLE_WORKSPACE);
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
    {
      value: ANYONE,
      label: "Anyone, without signing in",
      hint: "Only roles that give what an app uses",
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
                  ...(workspaceId && thing ? { resourceId: thing } : {}),
                });
                const role = usable.find((one) => one.id === roleId)?.name ?? "the role";
                const name =
                  who?.label ?? options.find((one) => one.value === chosen)?.label ?? "They";
                const where =
                  inWorkspace?.name ??
                  workspaces.data?.items.find((one) => one.id === workspaceId)?.name;
                const one = things.data?.items.find((item) => item.id === thing);
                notify.success(
                  `${name} holds ${role}${
                    one
                      ? ` on ${one.kind} ${one.path} in ${where}`
                      : where
                        ? ` in ${where}`
                        : " in the whole tenant"
                  }.`,
                );
                onGiven();
                close();
              } catch (error) {
                if (noteWaiting(error)) close();
                else setProblem(failureText(error));
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
              setThing(WHOLE_WORKSPACE);
              setRoleId(undefined);
            }}
          />
        )}
        {workspaceId ? (
          <SelectField
            name="resourceId"
            label="What"
            value={thing}
            options={[
              { value: WHOLE_WORKSPACE, label: "Everything in the workspace" },
              ...(things.data?.items ?? []).map((one) => ({
                value: one.id,
                label: `${one.kind} ${one.path}`,
              })),
            ]}
            hint={
              things.error
                ? failureText(things.error)
                : "Give it for one thing only, such as one app, and nothing else in the workspace."
            }
            onChange={setThing}
          />
        ) : null}
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
        <DirectGrantNote
          base={base}
          active={
            open &&
            (!chosen ||
              chosen === EVERY_END_USER ||
              chosen === ANYONE ||
              chosen.startsWith("member:") ||
              chosen.startsWith("end_user:"))
          }
        />
        {problem ? <Notice tone="danger">{problem}</Notice> : null}
        {/* Nothing to choose from is said with its reason, not shown as an empty list. */}
        {roles.error ? <Notice tone="danger">{failureText(roles.error)}</Notice> : null}
        {found.error ? <Notice tone="danger">{failureText(found.error)}</Notice> : null}
      </div>
    </SideSheet>
  );
}

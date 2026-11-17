import { Button, TextField } from "@vynxlabs/ui";
import { type ReactNode, useEffect, useState } from "react";
import { api, useLoad } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { CollectionView } from "../kit/CollectionView.tsx";
import { FilterChips, Inspector, KeyValues, SectionLabel } from "../kit/layout.tsx";
import { Mono, StatePill, Tag } from "../kit/status.tsx";
import { Time } from "../kit/Time.tsx";
import { CreateDialog, RemoveButton, } from "../ListScreen.tsx";
import { Link, navigate, useQueryValue, useUrlParam } from "../router.tsx";
import { GiveAccess } from "./GiveAccess.tsx";
import { Groups } from "./Groups.tsx";
import { type Role, Roles } from "./Roles.tsx";

/** The tabs of Members & access, each at its own address so old links keep working. */
export const ACCESS_TABS = [
  { slug: "members", label: "Members" },
  { slug: "groups", label: "Groups" },
  { slug: "roles", label: "Roles" },
  { slug: "access", label: "Access grants" },
] as const;
export type AccessTab = (typeof ACCESS_TABS)[number]["slug"];

/**
 * What a list inside Members & access is given: the screen's title and its tabs,
 * which sit above the list's own filters.
 */
export interface Framed {
  title: string;
  tabs: ReactNode;
}

function AccessTabs({ tenantId, current }: { tenantId: string; current: AccessTab }) {
  return (
    <nav aria-label="Members and access" className="-mb-4 flex gap-1 overflow-x-auto">
      {ACCESS_TABS.map((tab) => {
        const on = tab.slug === current;
        return (
          <Link
            key={tab.slug}
            to={`/t/${tenantId}/${tab.slug}`}
            current={on}
            className={`shrink-0 border-b-2 px-3 py-2 text-body-sm ${
              on
                ? "border-action font-medium text-ink"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Members, groups, roles and who holds which role: one screen, one tab each. */
export function MembersAndAccess({
  base,
  tenantId,
  tab,
}: {
  base: string;
  tenantId: string;
  tab: AccessTab;
}) {
  const framed: Framed = {
    title: "Members & access",
    tabs: <AccessTabs tenantId={tenantId} current={tab} />,
  };
  if (tab === "groups") return <Groups base={base} framed={framed} />;
  if (tab === "roles") return <Roles base={base} framed={framed} />;
  if (tab === "access") return <AccessList base={base} framed={framed} />;
  return <MemberList base={base} framed={framed} />;
}

/** A toolbar: the tabs, if any, then the list's own controls. */
export function toolbarOf(framed: Framed | undefined, own?: ReactNode): ReactNode {
  if (!framed && !own) return undefined;
  return (
    <div className="flex flex-col gap-3">
      {own ? <div className="flex flex-wrap items-center gap-2">{own}</div> : null}
      {framed?.tabs}
    </div>
  );
}

interface Member {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  suspended?: boolean;
}

interface Binding {
  id: string;
  scopeType: "tenant" | "workspace" | "resource";
  workspaceId: string | null;
  principalType: string;
  principalId: string | null;
  principalLabel: string;
  roleName: string;
  managedByResource: boolean;
}

interface WorkspaceRef {
  id: string;
  name: string;
}

const whereOf = (binding: Binding, workspaces: WorkspaceRef[]) =>
  binding.scopeType === "tenant"
    ? "Whole tenant"
    : `${workspaces.find((w) => w.id === binding.workspaceId)?.name ?? "A workspace"}${
        binding.scopeType === "resource" ? " (one resource)" : ""
      }`;

export function MemberList({ base, framed }: { base: string; framed?: Framed }) {
  const members = useLoad<{ items: Member[] }>(`${base}/members?limit=200`);
  const roles = useLoad<{ items: Role[] }>(`${base}/roles?limit=200`);
  const bindings = useLoad<{ items: Binding[] }>(`${base}/bindings`);
  const workspaces = useLoad<{ items: WorkspaceRef[] }>(`${base}/workspaces`);
  const [search, setSearch] = useUrlParam("q", "");
  const [selected, setSelected] = useUrlParam("member", undefined, { push: true });
  const [adding, setAdding] = useState(false);
  const needle = search.trim().toLowerCase();
  const rows = members.data?.items.filter(
    (row) =>
      needle === "" ||
      row.email.toLowerCase().includes(needle) ||
      row.name.toLowerCase().includes(needle),
  );
  const chosen = members.data?.items.find((row) => row.id === selected);
  const held = (bindings.data?.items ?? []).filter(
    (binding) => binding.principalType === "member" && binding.principalId === selected,
  );

  const suspend = async (member: Member) => {
    if (!member.suspended) {
      const sure = await ask.confirm({
        title: `Suspend ${member.email}?`,
        text: "They hold nothing in this tenant until they are resumed. What they were given is kept, and so is whatever they hold in other tenants.",
        action: "Suspend",
        danger: true,
      });
      if (!sure) return;
    }
    await api
      .patch(`${base}/members/${member.id}`, { suspended: !member.suspended })
      .then(members.reload, notify.error);
  };

  return (
    <>
      <CollectionView<Member>
        title={framed?.title ?? "Members"}
        description="People who belong to this tenant. Belonging grants nothing by itself: give access under Access grants."
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            Add member
          </Button>
        }
        toolbar={toolbarOf(
          framed,
          <div className="w-full max-w-xs">
            <TextField
              name="search"
              label="Search by email or name"
              value={search}
              onChange={setSearch}
            />
          </div>,
        )}
        label="Members"
        rows={rows}
        error={members.error}
        onRetry={members.reload}
        rowKey={(row) => row.id}
        selected={selected}
        onSelect={(row) => setSelected(row.id)}
        columns={[
          {
            header: "Name",
            cell: (row) => (
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{row.name || row.email}</span>
                <span className="text-meta text-ink-muted sm:hidden">{row.email}</span>
              </span>
            ),
          },
          { header: "Email", priority: 2, cell: (row) => row.email },
          {
            header: "Status",
            cell: (row) =>
              row.suspended ? <StatePill state="suspended" /> : <StatePill state="active" />,
          },
          {
            header: "Roles",
            priority: 3,
            cell: (row) => {
              const count = (bindings.data?.items ?? []).filter(
                (binding) => binding.principalType === "member" && binding.principalId === row.id,
              ).length;
              return (
                <span className="text-ink-muted">
                  {count === 0 ? "Through groups only" : `${count} given directly`}
                </span>
              );
            },
          },
          {
            header: "Added",
            priority: 3,
            cell: (row) => <Time value={row.createdAt} mode="ago" />,
          },
        ]}
        empty={
          needle
            ? { title: "No member matches that search" }
            : { title: "No members yet", text: "Add the people who work in this tenant." }
        }
        inspector={
          <Inspector
            open={chosen !== undefined}
            label="Member"
            title={chosen?.name || chosen?.email}
            eyebrow="Member"
            onClose={() => setSelected(undefined)}
            footer={
              chosen ? (
                <>
                  <Button
                    size="small"
                    variant="primary"
                    onClick={() => navigate(`/t/${base.split("/")[2]}/members/${chosen.id}`)}
                  >
                    View access
                  </Button>
                  <Button size="small" onClick={() => suspend(chosen)}>
                    {chosen.suspended ? "Resume" : "Suspend"}
                  </Button>
                  <RemoveButton
                    confirm={`Remove ${chosen.email} from this tenant? Their access here is removed too.`}
                    run={() => api.delete(`${base}/members/${chosen.id}`)}
                    onDone={() => {
                      setSelected(undefined);
                      members.reload();
                    }}
                  />
                </>
              ) : null
            }
          >
            {chosen ? (
              <div className="flex flex-col gap-5">
                <KeyValues
                  rows={[
                    { label: "Email", value: chosen.email },
                    { label: "Status", value: chosen.suspended ? "Suspended" : "Active" },
                    { label: "Added", value: <Time value={chosen.createdAt} /> },
                  ]}
                />
                <div className="flex flex-col gap-2">
                  <SectionLabel>Given directly</SectionLabel>
                  {held.length === 0 ? (
                    <p className="m-0 text-ink-muted">
                      Nothing. Whatever they hold comes from the groups they are in.
                    </p>
                  ) : (
                    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                      {held.map((binding) => (
                        <li key={binding.id} className="flex flex-wrap items-center gap-2">
                          <Mono>{binding.roleName}</Mono>
                          <span className="text-meta text-ink-muted">
                            {whereOf(binding, workspaces.data?.items ?? [])}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : null}
          </Inspector>
        }
      />
      <CreateDialog
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={() => {
          setAdding(false);
          members.reload();
        }}
        config={{
          action: "Add member",
          description:
            "For someone who already has an account, the email is enough. Otherwise fill in name and password to create one. Belonging grants nothing by itself: give them a role here, or later.",
          fields: [
            { name: "email", label: "Email", type: "email" },
            { name: "name", label: "Name", required: false, hint: "Only for a new account." },
            {
              name: "password",
              label: "Initial password",
              type: "password",
              required: false,
              hint: "Only for a new account. At least 12 characters.",
            },
            {
              name: "workspaceId",
              label: "Where they work",
              options: [
                { value: "", label: "The whole tenant" },
                ...(workspaces.data?.items ?? []).map((w) => ({ value: w.id, label: w.name })),
              ],
            },
            {
              name: "roleId",
              label: "Role",
              options: [
                { value: "", label: "No access yet" },
                ...(roles.data?.items ?? [])
                  .filter((role) => !role.workspaceId)
                  .map((role) => ({ value: role.id, label: role.name })),
              ],
              hint: "Given with the membership, in the same change.",
            },
          ],
          submit: ({ email, name, password, roleId, workspaceId }) =>
            api.post(`${base}/members`, {
              email,
              ...(name ? { name } : {}),
              ...(password ? { password } : {}),
              ...(roleId
                ? { bindings: [{ roleId, ...(workspaceId ? { workspaceId } : {}) }] }
                : {}),
            }),
          done: (_made, values) =>
            values.roleId
              ? `${values.email} is a member, with ${roles.data?.items.find((one) => one.id === values.roleId)?.name ?? "their role"}.`
              : `${values.email} is a member. They hold no role yet.`,
        }}
      />
    </>
  );
}

type Who = "all" | "member" | "group" | "service_account" | "end_user";
const WHO_OF: Record<string, Who> = {
  member: "member",
  group: "group",
  service_account: "service_account",
  end_user: "end_user",
  end_users: "end_user",
  end_user_group: "end_user",
};
const KIND_LABEL: Record<string, string> = {
  member: "Member",
  group: "Group",
  service_account: "Service account",
  end_user: "End user",
  end_users: "Every end user",
  end_user_group: "End-user group",
  anonymous: "Anyone",
};

/** Who holds which role, and where. */
export function AccessList({ base, framed }: { base: string; framed?: Framed }) {
  const bindings = useLoad<{ items: Binding[] }>(`${base}/bindings`);
  const workspaces = useLoad<{ items: WorkspaceRef[] }>(`${base}/workspaces`);
  const [who, setWho] = useState<Who>("all");
  const [giving, setGiving] = useState(false);
  // Linked to from someone's access: the binding is shown, whatever the filter, and marked.
  const [linked] = useQueryValue("binding");
  const all = bindings.data?.items;
  useEffect(() => {
    if (!linked || !all?.some((row) => row.id === linked)) return;
    setWho("all");
    const timer = setTimeout(
      () => document.querySelector(`[data-row="${linked}"]`)?.scrollIntoView({ block: "center" }),
      50,
    );
    return () => clearTimeout(timer);
  }, [linked, all]);
  const rows = all?.filter((row) => who === "all" || WHO_OF[row.principalType] === who);
  const countOf = (kind: Who) =>
    all ? all.filter((row) => WHO_OF[row.principalType] === kind).length : null;

  return (
    <>
      <CollectionView<Binding>
        title={framed?.title ?? "Access"}
        description="Who holds which role, and where. Access given at the tenant applies to every workspace in it."
        actions={
          <Button variant="primary" onClick={() => setGiving(true)}>
            Give access
          </Button>
        }
        toolbar={toolbarOf(
          framed,
          <FilterChips<Who>
            label="Show"
            value={who}
            onChange={setWho}
            options={[
              { value: "all", label: "Everyone", count: all?.length ?? null },
              { value: "member", label: "Members", count: countOf("member") },
              { value: "group", label: "Groups", count: countOf("group") },
              {
                value: "service_account",
                label: "Service accounts",
                count: countOf("service_account"),
              },
              { value: "end_user", label: "End users", count: countOf("end_user") },
            ]}
          />,
        )}
        label="Access grants"
        rows={rows}
        selected={linked ?? undefined}
        error={bindings.error}
        onRetry={bindings.reload}
        rowKey={(row) => row.id}
        columns={[
          {
            header: "Who",
            cell: (row) => (
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{row.principalLabel}</span>
                <span className="text-meta text-ink-subtle">
                  {KIND_LABEL[row.principalType] ?? row.principalType}
                </span>
              </span>
            ),
          },
          { header: "Role", cell: (row) => <Mono>{row.roleName}</Mono> },
          {
            header: "Where",
            priority: 2,
            cell: (row) => whereOf(row, workspaces.data?.items ?? []),
          },
          {
            header: "",
            align: "end",
            cell: (row) =>
              row.managedByResource ? (
                <Tag tone="repository">From repository</Tag>
              ) : (
                <RemoveButton
                  confirm={`Remove the ${row.roleName} role from ${row.principalLabel}?`}
                  run={() => api.delete(`${base}/bindings/${row.id}`)}
                  onDone={bindings.reload}
                />
              ),
          },
        ]}
        empty={
          who === "all"
            ? {
                title: "Nobody has access yet",
                text: "Give a member, a group, a service account or an end user a role.",
              }
            : { title: "Nothing of this kind holds a role" }
        }
      />
      <GiveAccess
        base={base}
        open={giving}
        onClose={() => setGiving(false)}
        onGiven={bindings.reload}
      />
    </>
  );
}

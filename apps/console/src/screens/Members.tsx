import { Button, SelectField, TextField } from "@volvel/ui";
import { type ReactNode, useEffect, useState } from "react";
import { api, useLoad } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { CollectionView } from "../kit/CollectionView.tsx";
import { FilterChips, Inspector, KeyValues, SectionLabel } from "../kit/layout.tsx";
import { consoleLink, kindName, objectHref } from "../kit/objects.tsx";
import { LoadMore, usePagedList } from "../kit/paged.tsx";
import { Mono, StatePill, Tag } from "../kit/status.tsx";
import { Time } from "../kit/Time.tsx";
import { CreateDialog, RemoveButton } from "../ListScreen.tsx";
import { Link, navigate, useQueryValue, useUrlParam } from "../router.tsx";
import { AccessReleases } from "./AccessReleases.tsx";
import { GiveAccess } from "./GiveAccess.tsx";
import { Groups } from "./Groups.tsx";
import { type Role, Roles } from "./Roles.tsx";

/** The tabs of Members & access, each at its own address so old links keep working. */
export const ACCESS_TABS = [
  { slug: "members", label: "Members" },
  { slug: "groups", label: "Groups" },
  { slug: "roles", label: "Roles" },
  { slug: "access", label: "Access" },
  { slug: "releases", label: "Access changes" },
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

/** The tabs of End users: the people, and the groups they are sorted into. */
export const END_USER_TABS = [
  { slug: "end-users", label: "End users" },
  { slug: "end-user-groups", label: "Groups" },
] as const;
export type EndUserTab = (typeof END_USER_TABS)[number]["slug"];

/** What a list under End users is given: the same title, and the two tabs. */
export function endUsersFramed(tenantId: string, current: EndUserTab): Framed {
  return {
    title: "End users",
    tabs: (
      <SectionTabs label="End users" tenantId={tenantId} tabs={END_USER_TABS} current={current} />
    ),
  };
}

/** A screen's tabs, each a link to its own address under the tenant. */
export function SectionTabs({
  label,
  tenantId,
  tabs,
  current,
}: {
  label: string;
  tenantId: string;
  tabs: readonly { slug: string; label: string }[];
  current: string;
}) {
  return (
    <nav aria-label={label} className="-mb-4 flex flex-wrap gap-x-1">
      {tabs.map((tab) => {
        const on = tab.slug === current;
        return (
          <Link
            key={tab.slug}
            to={`/t/${tenantId}/${tab.slug}`}
            current={on}
            className={`shrink-0 border-b-2 px-2 py-2 text-body-sm sm:px-3 ${
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
    tabs: (
      <SectionTabs
        label="Members and access"
        tenantId={tenantId}
        tabs={ACCESS_TABS}
        current={tab}
      />
    ),
  };
  if (tab === "groups") return <Groups base={base} framed={framed} />;
  if (tab === "roles") return <Roles base={base} framed={framed} />;
  if (tab === "access") return <AccessList base={base} framed={framed} />;
  if (tab === "releases") return <AccessReleases base={base} framed={framed} />;
  return <MemberList base={base} framed={framed} />;
}

/** A toolbar: the tabs, if any, then the list's own controls. */
export function toolbarOf(framed: Framed | undefined, own?: ReactNode): ReactNode {
  if (!framed && !own) return undefined;
  return (
    <div className="flex flex-col gap-2">
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
  /** How many roles they are given directly, and how many groups they are in. */
  directRoles?: number;
  groups?: number;
}

interface Binding {
  id: string;
  scopeType: "tenant" | "workspace" | "resource";
  workspaceId: string | null;
  resourceId?: string | null;
  resourceKind?: string | null;
  resourcePath?: string | null;
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

/**
 * Where a binding applies, said so that two are told apart: the whole tenant, a workspace, or the
 * one script, flow or app in it, by kind and path, and a link to it.
 */
function WhereOf({
  binding,
  workspaces,
  base,
}: {
  binding: Binding;
  workspaces: WorkspaceRef[];
  base: string;
}) {
  if (binding.scopeType === "tenant") return <>Whole tenant</>;
  const workspace = workspaces.find((w) => w.id === binding.workspaceId)?.name ?? "A workspace";
  if (binding.scopeType !== "resource") return <>{workspace}</>;
  if (!binding.resourceKind || !binding.resourcePath) return <>{workspace} (one resource)</>;
  return (
    <>
      <Link
        to={objectHref(
          consoleLink(`${base}/workspaces/${binding.workspaceId}`),
          binding.resourceKind,
          binding.resourcePath,
        )}
      >
        {kindName(binding.resourceKind)} <Mono>{binding.resourcePath}</Mono>
      </Link>{" "}
      in {workspace}
    </>
  );
}

/** What a member holds in words, from the counts the server gave: nothing when they are not known. */
export function rolesHeld(member: Pick<Member, "directRoles" | "groups">): string {
  const { directRoles: direct, groups } = member;
  if (direct === undefined || groups === undefined) return "";
  if (direct === 0) return groups === 0 ? "No access" : "Through groups only";
  return `${direct} given directly`;
}

export function MemberList({ base, framed }: { base: string; framed?: Framed }) {
  const [search, setSearch] = useUrlParam("q", "");
  // The server searches, so a member past the first page is found by typing.
  const members = usePagedList<Member>(`${base}/members`, { search });
  const roles = useLoad<{ items: Role[] }>(`${base}/roles?limit=200`);
  const bindings = useLoad<{ items: Binding[] }>(`${base}/bindings`);
  const workspaces = useLoad<{ items: WorkspaceRef[] }>(`${base}/workspaces`);
  const [selected, setSelected] = useUrlParam("member", undefined, { push: true });
  const [adding, setAdding] = useState(false);
  const needle = search.trim().toLowerCase();
  const rows = members.items;
  const listed = members.items?.find((row) => row.id === selected);
  // A link to someone past the pages loaded opens them all the same: they are read by themselves.
  const alone = useLoad<Member>(
    selected && members.items && !listed ? `${base}/members/${selected}` : null,
  );
  const chosen = listed ?? alone.data;
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
        description="People who belong to this tenant. Belonging grants nothing by itself: give access under Access."
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
              labelHidden
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
        table={{
          footer: (
            <LoadMore
              shown={members.items?.length ?? 0}
              hasMore={members.hasMore}
              loading={members.loadingMore}
              error={members.moreError}
              noun="members"
              onMore={members.loadMore}
            />
          ),
        }}
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
          { header: "Email", priority: 2, truncate: true, cell: (row) => row.email },
          {
            header: "Status",
            cell: (row) =>
              row.suspended ? <StatePill state="suspended" /> : <StatePill state="active" />,
          },
          {
            header: "Roles",
            priority: 3,
            // What the server counted, so that nothing is said while it is not known.
            cell: (row) => <span className="text-ink-muted">{rolesHeld(row)}</span>,
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
                            <WhereOf
                              binding={binding}
                              workspaces={workspaces.data?.items ?? []}
                              base={base}
                            />
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
              hint: "Only for a new account. At least 12 characters. They can change it on their Account screen after signing in.",
            },
            {
              name: "grants",
              label: "Roles",
              render: ({ value, onChange, error }) => (
                <RolePairs
                  value={value || undefined}
                  onChange={onChange}
                  error={error}
                  roles={(roles.data?.items ?? []).filter((role) => !role.workspaceId)}
                  workspaces={workspaces.data?.items ?? []}
                />
              ),
            },
          ],
          submit: ({ email, name, password, grants }) => {
            const given = readPairs(grants);
            return api.post(`${base}/members`, {
              email,
              ...(name ? { name } : {}),
              ...(password ? { password } : {}),
              ...(given.length > 0 ? { bindings: given } : {}),
            });
          },
          done: (_made, values) => {
            const names = readPairs(values.grants).map(
              (one) => roles.data?.items.find((role) => role.id === one.roleId)?.name ?? "a role",
            );
            return names.length > 0
              ? `${values.email} is a member, with ${names.join(", ")}.`
              : `${values.email} is a member. They hold no role yet.`;
          },
        }}
      />
    </>
  );
}

const MOST_ROLES = 20;
interface Pair {
  roleId: string;
  workspaceId?: string;
}

/** What the roles field holds, kept as text by the form: the pairs with a role chosen. */
function readPairs(value: string | undefined): Pair[] {
  try {
    const found = JSON.parse(value ?? "[]") as Pair[];
    return found
      .filter((one) => one.roleId)
      .map((one) => ({
        roleId: one.roleId,
        ...(one.workspaceId ? { workspaceId: one.workspaceId } : {}),
      }));
  } catch {
    return [];
  }
}

/**
 * Roles to give with the membership, each in the whole tenant or in one workspace. Where a role
 * applies is asked only once there is a role, so a workspace is never chosen without one.
 */
function RolePairs({
  value,
  onChange,
  error,
  roles,
  workspaces,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  error: string | undefined;
  roles: Role[];
  workspaces: WorkspaceRef[];
}) {
  const rows: Pair[] = (() => {
    try {
      const found = JSON.parse(value ?? "[]") as Pair[];
      return found.length > 0 ? found : [{ roleId: "" }];
    } catch {
      return [{ roleId: "" }];
    }
  })();
  const set = (next: Pair[]) => onChange(JSON.stringify(next));
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="mb-1 font-medium text-ink">Roles</legend>
      {rows.map((row, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a row has no identity but its place
        <div key={index} className="flex flex-wrap items-end gap-2">
          <div className="min-w-40 flex-1">
            <SelectField
              name={`role-${index}`}
              label={index === 0 ? "Role" : `Role ${index + 1}`}
              options={[
                { value: "", label: index === 0 ? "No access yet" : "Choose a role" },
                ...roles.map((role) => ({ value: role.id, label: role.name })),
              ]}
              value={row.roleId}
              {...(index === 0 ? { hint: "Given with the membership, in the same change." } : {})}
              onChange={(roleId) =>
                set(
                  rows.map((one, at) =>
                    at === index ? (roleId ? { ...one, roleId } : { roleId: "" }) : one,
                  ),
                )
              }
            />
          </div>
          {row.roleId ? (
            <div className="min-w-40 flex-1">
              <SelectField
                name={`where-${index}`}
                label="Where they work"
                options={[
                  { value: "", label: "The whole tenant" },
                  ...workspaces.map((w) => ({ value: w.id, label: w.name })),
                ]}
                value={row.workspaceId ?? ""}
                onChange={(workspaceId) =>
                  set(
                    rows.map((one, at) =>
                      at === index
                        ? { roleId: one.roleId, ...(workspaceId ? { workspaceId } : {}) }
                        : one,
                    ),
                  )
                }
              />
            </div>
          ) : null}
          {rows.length > 1 ? (
            <Button
              size="small"
              aria-label={`Remove role ${index + 1}`}
              onClick={() => set(rows.filter((_, at) => at !== index))}
            >
              Remove
            </Button>
          ) : null}
        </div>
      ))}
      {error ? <p className="m-0 text-danger text-meta">{error}</p> : null}
      {rows.length < MOST_ROLES && rows.at(-1)?.roleId ? (
        <div>
          <Button size="small" onClick={() => set([...rows, { roleId: "" }])}>
            Add another role
          </Button>
        </div>
      ) : null}
    </fieldset>
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
        label="Access"
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
            cell: (row) => (
              <WhereOf binding={row} workspaces={workspaces.data?.items ?? []} base={base} />
            ),
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

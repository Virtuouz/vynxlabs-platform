import { Button } from "@volvel/ui";
import { api, type Me, useLoad } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { ListCollection } from "../kit/ListCollection.tsx";
import { KeyValues } from "../kit/layout.tsx";
import { MemberResetLink } from "../kit/MemberResetLink.tsx";
import { StatePill, Tag } from "../kit/status.tsx";
import { Time } from "../kit/Time.tsx";
import { RemoveButton } from "../ListScreen.tsx";
import { AuditTable } from "./Audit.tsx";

const OPERATOR_ROLE = "00000000-0000-7000-8000-000000000001";

interface MemberRow {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  disabled?: boolean;
  tenants?: { id: string; name: string }[];
}

function ToggleMember({ row, onDone }: { row: MemberRow; onDone: () => void }) {
  const me = useLoad<Me>("/me");
  // The server refuses it; the row says so in place of a button that can only fail.
  if (!row.disabled && me.data?.principal.id === row.id) {
    return <span className="text-meta text-ink-subtle">You cannot disable your own account.</span>;
  }
  return (
    <Button
      size="small"
      {...(row.disabled ? {} : { variant: "danger" as const })}
      onClick={async () => {
        if (!row.disabled) {
          const sure = await ask.confirm({
            title: `Disable ${row.email}?`,
            text: "They can sign in nowhere, in any tenant: their sessions end now and their API keys stop working. The account and what it holds are kept. A tenant where they are the only admin is left with none until an operator opens access to it: the next message names those tenants.",
            action: "Disable",
            danger: true,
          });
          if (!sure) return;
        }
        await api
          .patch<{ tenantsWithoutAdmin?: { id: string; name: string }[] }>(`/members/${row.id}`, {
            disabled: !row.disabled,
          })
          .then((done) => {
            const left = done?.tenantsWithoutAdmin ?? [];
            if (left.length > 0) {
              notify.success(
                `${row.email} is disabled. These tenants now have no admin: ${left.map((one) => one.name).join(", ")}. An operator can open access to each from its page.`,
              );
            } else {
              notify.success(`${row.email} is ${row.disabled ? "enabled" : "disabled"}.`);
            }
            onDone();
          }, notify.error);
      }}
    >
      {row.disabled ? "Enable" : "Disable"}
    </Button>
  );
}

export function InstanceMembers() {
  return (
    <ListCollection<MemberRow>
      title="All members"
      description="Every person with an identity on this instance, across all tenants."
      path="/members"
      needs={{ base: "/instance", permission: "member:write", what: "the members" }}
      rowKey={(row) => row.id}
      paged
      columns={[
        {
          header: "Name",
          cell: (row) => (
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">{row.name}</span>
              <span title={row.email} className="truncate text-meta text-ink-subtle sm:hidden">
                {row.email}
              </span>
            </span>
          ),
        },
        {
          header: "Email",
          priority: 2,
          truncate: true,
          cell: (row) => <span title={row.email}>{row.email}</span>,
        },
        {
          header: "Tenants",
          priority: 3,
          cell: (row) =>
            row.tenants && row.tenants.length > 0 ? (
              row.tenants.map((one) => one.name).join(", ")
            ) : (
              <span className="text-ink-subtle">None</span>
            ),
        },
        {
          header: "State",
          cell: (row) =>
            row.disabled ? <Tag tone="danger">Disabled</Tag> : <StatePill state="active" />,
        },
        {
          header: "Created",
          priority: 3,
          cell: (row) => <Time value={row.createdAt} mode="ago" />,
        },
      ]}
      empty={{ title: "No members" }}
      create={{
        action: "Create member",
        description: "Creates an identity without adding it to any tenant.",
        fields: [
          { name: "name", label: "Name" },
          { name: "email", label: "Email", type: "email" },
          {
            name: "password",
            label: "Initial password",
            type: "password",
            hint: "At least 12 characters. They can change it on their Account screen after signing in.",
          },
        ],
        submit: (values) => api.post("/members", values),
      }}
      rowActions={(row, reload) => (
        <>
          {row.disabled ? null : (
            <MemberResetLink
              path={`/members/${row.id}/password-link`}
              email={row.email}
              needs={{ base: "/instance", permission: "member:write", what: "the members" }}
            />
          )}
          <ToggleMember row={row} onDone={reload} />
        </>
      )}
      inspect={{
        title: (row) => row.name,
        eyebrow: () => "Member",
        body: (row) => (
          <KeyValues
            rows={[
              { label: "Email", value: row.email },
              {
                label: "Tenants",
                value:
                  row.tenants && row.tenants.length > 0
                    ? row.tenants.map((one) => one.name).join(", ")
                    : "Belongs to no tenant",
              },
              { label: "State", value: row.disabled ? "Disabled: signs in nowhere" : "Active" },
              { label: "Created", value: <Time value={row.createdAt} mode="stamp" /> },
              { label: "ID", value: row.id, mono: true },
            ]}
          />
        ),
      }}
    />
  );
}

export function Operators() {
  const me = useLoad<Me>("/me");
  return (
    <ListCollection<{
      id: string;
      memberEmail: string;
      roleName: string;
      createdAt: string;
      memberDisabled?: boolean;
    }>
      title="Operators"
      description="Members who run this instance. An operator manages tenants and members, and sees inside a tenant only through an access grant."
      path="/bindings"
      needs={{ base: "/instance", permission: "binding:write", what: "the operators" }}
      rowKey={(row) => row.id}
      search={(row) => row.memberEmail}
      columns={[
        {
          header: "Member",
          cell: (row) => (
            <span className="flex flex-wrap items-center gap-2">
              {row.memberEmail}
              {row.memberDisabled ? <Tag tone="danger">Disabled</Tag> : null}
            </span>
          ),
        },
        { header: "Role", priority: 2, cell: (row) => row.roleName },
        { header: "Since", priority: 3, cell: (row) => <Time value={row.createdAt} mode="ago" /> },
      ]}
      empty={{ title: "No operators" }}
      // A disabled operator keeps the role but cannot sign in, so it does not count as one who can.
      create={{
        action: "Add operator",
        fields: [
          {
            name: "memberId",
            label: "Member",
            placeholder: "Find a member by email",
            choose: {
              path: "/members",
              search: true,
              option: (item: { id: string; email: string; name?: string }) => ({
                value: item.id,
                label: item.email,
                ...(item.name ? { hint: item.name } : {}),
              }),
            },
          },
        ],
        submit: (values) =>
          api.post("/bindings", { memberId: values.memberId, roleId: OPERATOR_ROLE }),
      }}
      rowActions={(row, reload) => {
        const yourself = me.data?.principal.email === row.memberEmail;
        return (
          <RemoveButton
            {...(yourself ? { label: "Remove yourself" } : {})}
            confirm={
              yourself
                ? "Remove yourself as an operator? You lose the Instance area at once, and another operator has to add you back."
                : `Remove ${row.memberEmail} as an operator?`
            }
            run={() => api.delete(`/bindings/${row.id}`)}
            onDone={reload}
          />
        );
      }}
    />
  );
}

export function InstanceAudit() {
  return (
    <AuditTable
      title="Instance audit log"
      description="Changes that belong to no tenant: members, operators and sign-ins. Each tenant has its own log."
      path="/audit"
    />
  );
}

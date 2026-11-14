import { Button } from "@vynxlabs/ui";
import { api } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { ListCollection } from "../kit/ListCollection.tsx";
import { KeyValues } from "../kit/layout.tsx";
import { StatePill, Tag } from "../kit/status.tsx";
import { RemoveButton, when } from "../ListScreen.tsx";
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
  return (
    <Button
      size="small"
      {...(row.disabled ? {} : { variant: "danger" as const })}
      onClick={async () => {
        if (!row.disabled) {
          const sure = await ask.confirm({
            title: `Disable ${row.email}?`,
            text: "They can sign in nowhere, in any tenant: their sessions end now and their API keys stop working. The account and what it holds are kept.",
            action: "Disable",
            danger: true,
          });
          if (!sure) return;
        }
        await api
          .patch(`/members/${row.id}`, { disabled: !row.disabled })
          .then(onDone, notify.error);
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
      path="/members?limit=200"
      rowKey={(row) => row.id}
      search={(row) => `${row.name} ${row.email}`}
      columns={[
        {
          header: "Name",
          cell: (row) => (
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">{row.name}</span>
              <span className="truncate text-meta text-ink-subtle sm:hidden">{row.email}</span>
            </span>
          ),
        },
        { header: "Email", priority: 2, cell: (row) => row.email },
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
            row.disabled ? (
              <Tag tone="danger">Disabled</Tag>
            ) : (
              <StatePill state="ok">Active</StatePill>
            ),
        },
        { header: "Created", priority: 3, cell: (row) => when(row.createdAt) },
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
            hint: "At least 12 characters. They can change it after signing in.",
          },
        ],
        submit: (values) => api.post("/members", values),
      }}
      rowActions={(row, reload) => <ToggleMember row={row} onDone={reload} />}
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
              { label: "Created", value: when(row.createdAt) },
              { label: "ID", value: row.id, mono: true },
            ]}
          />
        ),
      }}
    />
  );
}

export function Operators() {
  return (
    <ListCollection<{ id: string; memberEmail: string; roleName: string; createdAt: string }>
      title="Operators"
      description="Members who run this instance. An operator manages tenants and members, and sees inside a tenant only through an access grant."
      path="/bindings"
      rowKey={(row) => row.id}
      search={(row) => row.memberEmail}
      columns={[
        { header: "Member", cell: (row) => row.memberEmail },
        { header: "Role", priority: 2, cell: (row) => row.roleName },
        { header: "Since", priority: 3, cell: (row) => when(row.createdAt) },
      ]}
      empty={{ title: "No operators" }}
      create={{
        action: "Add operator",
        fields: [
          {
            name: "memberId",
            label: "Member",
            placeholder: "Find a member by email",
            choose: {
              path: "/members?limit=200",
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
      rowActions={(row, reload) => (
        <RemoveButton
          confirm={`Remove ${row.memberEmail} as an operator?`}
          run={() => api.delete(`/bindings/${row.id}`)}
          onDone={reload}
        />
      )}
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

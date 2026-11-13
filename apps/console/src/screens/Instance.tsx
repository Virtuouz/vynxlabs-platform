import { api } from "../api.ts";
import { ListScreen, RemoveButton, when } from "../ListScreen.tsx";
import { AuditTable } from "./Audit.tsx";

const OPERATOR_ROLE = "00000000-0000-7000-8000-000000000001";

export function InstanceMembers() {
  return (
    <ListScreen<{ id: string; name: string; email: string; createdAt: string }>
      title="All members"
      description="Every person with an identity on this instance, across all tenants."
      path="/members?limit=200"
      rowKey={(row) => row.id}
      columns={[
        { header: "Name", cell: (row) => row.name },
        { header: "Email", cell: (row) => row.email },
        { header: "Created", cell: (row) => when(row.createdAt) },
        {
          header: "ID",
          cell: (row) => <code className="font-mono text-[13px] text-ink-muted">{row.id}</code>,
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
            hint: "At least 12 characters. They can change it after signing in.",
          },
        ],
        submit: (values) => api.post("/members", values),
      }}
    />
  );
}

export function Operators() {
  return (
    <ListScreen<{ id: string; memberEmail: string; roleName: string; createdAt: string }>
      title="Operators"
      description="Members who run this instance. An operator manages tenants and members, and sees inside a tenant only through an access grant."
      path="/bindings"
      rowKey={(row) => row.id}
      columns={[
        { header: "Member", cell: (row) => row.memberEmail },
        { header: "Role", cell: (row) => row.roleName },
        { header: "Since", cell: (row) => when(row.createdAt) },
      ]}
      empty={{ title: "No operators" }}
      create={{
        action: "Add operator",
        fields: [{ name: "memberId", label: "Member ID", hint: "Copy it from All members." }],
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

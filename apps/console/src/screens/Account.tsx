import { Badge } from "@vynxlabs/ui";
import { api } from "../api.ts";
import { ListScreen, RemoveButton, when } from "../ListScreen.tsx";

export interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export const keyColumns = [
  { header: "Name", cell: (row: KeyRow) => row.name },
  {
    header: "Key",
    cell: (row: KeyRow) => <code class="font-mono text-[13px]">{row.prefix}…</code>,
  },
  { header: "Last used", cell: (row: KeyRow) => (row.lastUsedAt ? when(row.lastUsedAt) : "Never") },
  {
    header: "Status",
    cell: (row: KeyRow) =>
      row.revokedAt ? (
        <Badge tone="danger">Revoked</Badge>
      ) : row.expiresAt && new Date(row.expiresAt) < new Date() ? (
        <Badge tone="danger">Expired</Badge>
      ) : (
        <Badge tone="action">Active</Badge>
      ),
  },
];

export const showNewKey = (result: unknown) => (
  <span>
    Copy this key now. It is not shown again:{" "}
    <code class="font-mono break-all select-all">{(result as { token: string }).token}</code>
  </span>
);

export function Account() {
  return (
    <ListScreen<KeyRow>
      title="API keys"
      description="A key acts as you, with your permissions. Use one for the command line or a script."
      path="/api-keys"
      rowKey={(row) => row.id}
      columns={keyColumns}
      empty={{ title: "No API keys", text: "Create a key to sign in from the command line." }}
      create={{
        action: "Create API key",
        fields: [
          {
            name: "name",
            label: "Name",
            placeholder: "My laptop",
            hint: "Where the key will be used.",
          },
        ],
        submit: (values) => api.post("/api-keys", values),
        afterCreate: showNewKey,
      }}
      rowActions={(row, reload) =>
        row.revokedAt ? null : (
          <RemoveButton
            label="Revoke"
            confirm={`Revoke the key "${row.name}"? Anything using it stops working.`}
            run={() => api.delete(`/api-keys/${row.id}`)}
            onDone={reload}
          />
        )
      }
    />
  );
}

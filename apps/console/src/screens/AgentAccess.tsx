import { EmptyState, Notice, SelectField, Table } from "@vynxlabs/ui";
import { useState } from "react";
import { useLoad } from "../api.ts";
import { CopyButton } from "../ListScreen.tsx";

interface Tool {
  name: string;
  description: string;
  inputSchema: { properties?: Record<string, unknown>; required?: string[] };
}

/**
 * What an AI agent gets when it connects with one of a service account's
 * keys: the address to connect to, what to put in the agent's settings, and
 * the tools it would be offered in a workspace. Nothing is run from here.
 */
export function AgentAccess({ base, account }: { base: string; account: string }) {
  const workspaces = useLoad<{ items: { id: string; name: string; slug: string; type: string }[] }>(
    `${base}/workspaces`,
  );
  const [chosen, setChosen] = useState<string>();
  const workspace = chosen ?? workspaces.data?.items[0]?.id;
  const offered = useLoad<{ address: string; reachable: boolean; tools: Tool[] }>(
    workspace ? `${base}/service-accounts/${account}/tools?workspace=${workspace}` : null,
  );

  if (workspaces.error) return <Notice tone="danger">{workspaces.error.message}</Notice>;
  if (!workspaces.data) return <p className="text-ink-muted">Loading…</p>;
  if (workspaces.data.items.length === 0) {
    return <EmptyState title="This tenant has no workspaces yet" />;
  }
  const settings = offered.data
    ? JSON.stringify(
        {
          mcpServers: {
            platform: {
              type: "http",
              url: offered.data.address,
              headers: { Authorization: "Bearer <one of this account's API keys>" },
            },
          },
        },
        null,
        2,
      )
    : "";

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 max-w-3xl text-ink-muted">
        An agent that speaks the Model Context Protocol can connect to a workspace with one of this
        account's keys. It is offered the scripts and flows the account may start, and nothing the
        account may not do.
      </p>
      <div className="max-w-sm">
        <SelectField
          name="workspace"
          label="In the workspace"
          value={workspace ?? ""}
          options={workspaces.data.items.map((one) => ({
            value: one.id,
            label: `${one.name} (${one.type === "dev" ? "dev" : "production"})`,
          }))}
          onChange={setChosen}
        />
      </div>
      {offered.error ? <Notice tone="danger">{offered.error.message}</Notice> : null}
      {offered.data ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0">
              <span className="block text-[13px] text-ink-muted">Address for the agent</span>
              <code className="font-mono text-[13px] break-all">{offered.data.address}</code>
            </span>
            <CopyButton value={offered.data.address} label="Copy the address" />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-ink-muted">
                For an agent's settings. Put a key of this account where it says.
              </span>
              <CopyButton value={settings} label="Copy the settings" />
            </div>
            <pre className="m-0 overflow-x-auto rounded-control border border-line bg-sunken p-3 font-mono text-[12.5px]">
              {settings}
            </pre>
          </div>
          {offered.data.reachable ? null : (
            <Notice tone="attention">
              This account has no access in this workspace, so an agent would be refused. Give it a
              role there under Access.
            </Notice>
          )}
          <Table<Tool>
            rows={offered.data.tools}
            rowKey={(row) => row.name}
            empty={
              <EmptyState title="No tools">
                The account may start no script or flow here. Bind it to a role that may, in this
                workspace or on one script or flow.
              </EmptyState>
            }
            columns={[
              {
                header: "Tool",
                cell: (row) => <code className="font-mono text-[13px]">{row.name}</code>,
              },
              { header: "What it does", cell: (row) => row.description },
              {
                header: "It takes",
                cell: (row) => (
                  <span className="text-ink-muted">
                    {Object.keys(row.inputSchema.properties ?? {})
                      .map((name) =>
                        (row.inputSchema.required ?? []).includes(name) ? name : `${name}?`,
                      )
                      .join(", ") || "Nothing"}
                  </span>
                ),
              },
            ]}
          />
        </>
      ) : offered.error ? null : (
        <p className="text-ink-muted">Loading…</p>
      )}
    </div>
  );
}

import { Button, Dialog, EmptyState, JsonView, Notice, SelectField } from "@vynxlabs/ui";
import { useState } from "react";
import { api, useLoad } from "../api.ts";
import { InputForm } from "../InputDialog.tsx";
import { DataTable } from "../kit/DataTable.tsx";
import { CopyButton } from "../ListScreen.tsx";
import { useUrlParam } from "../router.tsx";

interface Tool {
  name: string;
  description: string;
  inputSchema: { properties?: Record<string, unknown>; required?: string[] };
}

/**
 * What an AI agent gets when it connects with one of a service account's
 * keys: the address to connect to, what to put in the agent's settings, and
 * the tools it would be offered in a workspace. A tool can be tried from here,
 * as the account.
 */
export function AgentAccess({ base, account }: { base: string; account: string }) {
  const workspaces = useLoad<{ items: { id: string; name: string; slug: string; type: string }[] }>(
    `${base}/workspaces`,
  );
  const [chosen, setChosen] = useUrlParam("item", undefined, { push: true });
  const [trying, setTrying] = useState<Tool>();
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
              <span className="block text-body-sm text-ink-muted">Address for the agent</span>
              <code className="font-mono text-code break-all">{offered.data.address}</code>
            </span>
            <CopyButton value={offered.data.address} label="Copy the address" />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-body-sm text-ink-muted">
                For an agent's settings. Put a key of this account where it says.
              </span>
              <CopyButton value={settings} label="Copy the settings" />
            </div>
            <pre className="m-0 overflow-x-auto rounded-control border border-line bg-sunken p-3 font-mono text-code-sm">
              {settings}
            </pre>
          </div>
          {offered.data.reachable ? null : (
            <Notice tone="attention">
              An agent would be refused here: the account has no place in this workspace. Offer it a
              script or flow from that script's or flow's page, or give it a role here under Access.
            </Notice>
          )}
          <DataTable<Tool>
            variant="static"
            framed
            label="Tools offered"
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
                cell: (row) => <code className="font-mono text-code">{row.name}</code>,
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
              {
                header: "",
                align: "end",
                cell: (row) => (
                  <Button size="small" onClick={() => setTrying(row)}>
                    Try
                  </Button>
                ),
              },
            ]}
          />
          {workspace ? (
            <TryTool
              base={base}
              account={account}
              workspace={workspace}
              tool={trying}
              onClose={() => setTrying(undefined)}
            />
          ) : null}
        </>
      ) : offered.error ? null : (
        <p className="text-ink-muted">Loading…</p>
      )}
    </div>
  );
}

/**
 * Calls a tool as the account would, to see that it works. It is real work: a
 * script runs, a flow starts. The answer is what the agent would be told.
 */
function TryTool({
  base,
  account,
  workspace,
  tool,
  onClose,
}: {
  base: string;
  account: string;
  workspace: string;
  tool: Tool | undefined;
  onClose: () => void;
}) {
  const [answer, setAnswer] = useState<{ isError: boolean; result: unknown }>();
  const close = () => {
    setAnswer(undefined);
    onClose();
  };
  const { idempotencyKey: _key, ...properties } = tool?.inputSchema.properties ?? {};
  const schema = tool
    ? {
        ...tool.inputSchema,
        properties,
        required: (tool.inputSchema.required ?? []).filter((name) => name !== "idempotencyKey"),
      }
    : undefined;
  return (
    <Dialog open={tool !== undefined} onClose={close} title={`Try ${tool?.name ?? ""}`}>
      {tool ? (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-ink-muted">
            The call is made as this account, with only what it may do. It is real: a script runs
            and a flow starts, with whatever effects they have. You are recorded as the one who
            asked.
          </p>
          {answer ? (
            <>
              <Notice tone={answer.isError ? "danger" : "success"}>
                {answer.isError
                  ? "The agent would be told this failed."
                  : "The agent would be told this."}
              </Notice>
              <JsonView
                label="What the agent is told"
                value={answer.result}
                tone={answer.isError ? "danger" : "plain"}
              />
              <div className="flex justify-end gap-2">
                <Button onClick={() => setAnswer(undefined)}>Try again</Button>
                <Button variant="primary" onClick={close}>
                  Done
                </Button>
              </div>
            </>
          ) : (
            <InputForm
              schema={schema}
              action="Call it"
              onCancel={close}
              onSubmit={async (input) => {
                setAnswer(
                  await api.post<{ isError: boolean; result: unknown }>(
                    `${base}/service-accounts/${account}/tool-calls`,
                    { workspace, tool: tool.name, arguments: input ?? {} },
                  ),
                );
              }}
            />
          )}
        </div>
      ) : null}
    </Dialog>
  );
}

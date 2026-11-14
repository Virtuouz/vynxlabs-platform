import { Badge, Button, EmptyState, Menu, Notice } from "@vynxlabs/ui";
import { lazy, Suspense, useState } from "react";
import { api, isOperator, type Me, useLoad } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { UsedBy, useReferences } from "../kit/references.tsx";
import {
  type CreateConfig,
  CreateDialog,
  ListScreen,
  Page,
  RemoveButton,
  when,
} from "../ListScreen.tsx";
import { Link, match, navigate } from "../router.tsx";
import { type KeyRow, keyColumns, showNewKey } from "./Account.tsx";
import { AgentAccess } from "./AgentAccess.tsx";
import { Apps } from "./Apps.tsx";
import { AuditTable } from "./Audit.tsx";
import type { CodeKind } from "./Authoring.tsx";
import { Branding } from "./Branding.tsx";
import { Sources, SourceView, Tables, TableView } from "./Data.tsx";
import { Domains } from "./Domains.tsx";
import { EndUsers } from "./EndUsers.tsx";
import { Promotion, TenantExport, WorkspaceControls } from "./Environments.tsx";
import { ConnectionGroups, Connections, Scripts, Variables, Workers } from "./Execution.tsx";
import { GitSync } from "./GitSync.tsx";
import { ApprovalsQueue, EventsWorkbench, TriggersWorkbench } from "./Operate.tsx";
import { Overview } from "./Overview.tsx";
import { Release } from "./Release.tsx";
import { EDITED_KINDS, isEditedKind, ResourceEditor } from "./ResourceEditor.tsx";
import { RunsWorkbench } from "./Runs.tsx";

// Screens that bring a library with them, or that few people open, are fetched when first
// opened: the code editor, the screen builder with its charts, and single sign-on.
const Extensions = lazy(() => import("./Authoring.tsx").then((m) => ({ default: m.Extensions })));
const ScriptEditor = lazy(() =>
  import("./Authoring.tsx").then((m) => ({ default: m.ScriptEditor })),
);
const Dashboards = lazy(() => import("./Dashboards.tsx").then((m) => ({ default: m.Dashboards })));
const DashboardView = lazy(() =>
  import("./Dashboards.tsx").then((m) => ({ default: m.DashboardView })),
);
const InterfaceBuilder = lazy(() =>
  import("./Interfaces.tsx").then((m) => ({ default: m.InterfaceBuilder })),
);
const Interfaces = lazy(() => import("./Interfaces.tsx").then((m) => ({ default: m.Interfaces })));
const SingleSignOn = lazy(() =>
  import("./SingleSignOn.tsx").then((m) => ({ default: m.SingleSignOn })),
);

// The flow editor brings a canvas library with it, so it is fetched when first opened.
const FlowEditor = lazy(() =>
  import("./FlowEditor.tsx").then((module) => ({ default: module.FlowEditor })),
);

import { FlowRunView, Flows, FlowView } from "./Flows.tsx";
import { RepositorySettings } from "./Git.tsx";
import { EndUserGroups, Groups } from "./Groups.tsx";
import { type Role, Roles } from "./Roles.tsx";

interface Workspace {
  id: string;
  slug: string;
  name: string;
  type: "production" | "dev";
  linkedWorkspaceId: string | null;
  triggersPaused: boolean;
}
interface Grant {
  id: string;
  memberId: string;
  memberEmail: string;
  roleName: string;
  reason: string;
  createdAt: string;
  expiresAt: string;
  active: boolean;
}

const code = (text: string) => <code className="font-mono text-[13px]">{text}</code>;

/** Production is always marked. It is the one thing nobody should have to look for. */
export const TypeBadge = ({ type }: { type: "production" | "dev" }) =>
  type === "production" ? <Badge tone="attention">Production</Badge> : <Badge>Dev</Badge>;

const grantForm = (tenantId: string, roles: Role[]): CreateConfig => ({
  action: "Open operator access",
  description:
    "Access is time-limited. The tenant's admins see this grant, your reason, and everything you do under it.",
  fields: [
    {
      name: "reason",
      label: "Reason",
      placeholder: "Support ticket 1042",
      hint: "Shown to the tenant's admins.",
    },
    {
      name: "roleId",
      label: "Access level",
      options: roles
        .filter((role) => role.builtin)
        .sort((a, b) => Number(b.name === "viewer") - Number(a.name === "viewer"))
        .map((role) => ({
          value: role.id,
          label: role.name === "viewer" ? "viewer (read only)" : role.name,
        })),
    },
    {
      name: "durationMinutes",
      label: "Duration",
      options: [
        { value: "60", label: "1 hour" },
        { value: "240", label: "4 hours" },
        { value: "1440", label: "24 hours" },
      ],
    },
  ],
  submit: (values) =>
    api.post(`/tenants/${tenantId}/access-grants`, {
      reason: values.reason,
      roleId: values.roleId,
      durationMinutes: Number(values.durationMinutes),
    }),
});

/** Built-in roles an operator can pick before having any access to the tenant. */
const BUILTIN_ROLES: Role[] = [
  ["00000000-0000-7000-8000-000000000005", "viewer"],
  ["00000000-0000-7000-8000-000000000004", "developer"],
  ["00000000-0000-7000-8000-000000000003", "workspace_admin"],
  ["00000000-0000-7000-8000-000000000002", "tenant_admin"],
].map(([id, name]) => ({
  id: id as string,
  name: name as string,
  description: "",
  permissions: [],
  builtin: true,
  workspaceId: null,
  managedByResource: false,
}));

export function Tenant({ tenantId, me, path }: { tenantId: string; me: Me; path: string }) {
  const base = `/tenants/${tenantId}`;
  const operator = isOperator(me);
  const isMember = me.tenants.some((tenant) => tenant.id === tenantId);
  const grants = useLoad<{ items: Grant[] }>(operator ? `${base}/access-grants` : null);
  const [opening, setOpening] = useState(false);
  const mine = grants.data?.items.find(
    (grant) => grant.active && grant.memberId === me.principal.id,
  );

  if (operator && !isMember && !grants.data && !grants.error) return null;
  if (operator && !isMember && !mine) {
    return (
      <Page title="You have no access to this tenant">
        <EmptyState
          title="Operators see inside a tenant only through an access grant"
          action={
            <Button variant="primary" onClick={() => setOpening(true)}>
              Open operator access
            </Button>
          }
        >
          A grant is time-limited and needs a reason. The tenant's admins can see it and end it.
        </EmptyState>
        <CreateDialog
          config={grantForm(tenantId, BUILTIN_ROLES)}
          open={opening}
          onClose={() => setOpening(false)}
          onCreated={() => {
            setOpening(false);
            grants.reload();
          }}
        />
      </Page>
    );
  }

  const section = match("/t/:t/:section/*", path)?.section ?? "workspaces";
  const workspace = match("/t/:t/workspaces/:w/:tab/*", path);
  const runId = match("/t/:t/workspaces/:w/runs/:id", path)?.id;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      {mine ? (
        <Notice
          tone="attention"
          action={
            <Button
              size="small"
              onClick={async () => {
                await api.delete(`${base}/access-grants/${mine.id}`);
                grants.reload();
              }}
            >
              End access now
            </Button>
          }
        >
          <strong>Operator access</strong> as {mine.roleName}, until {when(mine.expiresAt)}. Reason:{" "}
          {mine.reason}. Everything you do here is recorded for the tenant.
        </Notice>
      ) : null}
      {workspace?.w ? (
        <WorkspaceDetail
          base={base}
          tenantId={tenantId}
          workspaceId={workspace.w}
          tab={workspace.tab ?? "overview"}
          rest={path.split("/").slice(6).map(decodeURIComponent).join("/")}
          runId={runId}
        />
      ) : section === "approvals" ? (
        <ApprovalsQueue base={base} tenantId={tenantId} />
      ) : section === "workers" ? (
        <Workers base={base} />
      ) : section === "members" ? (
        <Members base={base} />
      ) : section === "end-users" ? (
        <EndUsers base={base} />
      ) : section === "branding" ? (
        <Branding base={base} />
      ) : section === "domains" ? (
        <Domains base={base} />
      ) : section === "groups" ? (
        <Groups base={base} />
      ) : section === "end-user-groups" ? (
        <EndUserGroups base={base} />
      ) : section === "service-accounts" ? (
        <ServiceAccounts base={base} path={path} />
      ) : section === "roles" ? (
        <Roles base={base} />
      ) : section === "access" ? (
        <Access base={base} />
      ) : section === "operator-access" ? (
        <OperatorAccess base={base} />
      ) : section === "repository" ? (
        <RepositorySettings base={base} />
      ) : section === "single-sign-on" ? (
        <SingleSignOn base={base} />
      ) : section === "export" ? (
        <ExportSection base={base} />
      ) : section === "audit" ? (
        <AuditTable
          title="Audit log"
          description="Every change in this tenant, and every request an operator made under an access grant."
          path={`${base}/audit`}
        />
      ) : (
        <Workspaces base={base} tenantId={tenantId} />
      )}
    </div>
  );
}

function Workspaces({ base, tenantId }: { base: string; tenantId: string }) {
  const existing = useLoad<{ items: Workspace[] }>(`${base}/workspaces`);
  const production = (existing.data?.items ?? []).filter(
    (workspace) => workspace.type === "production",
  );
  return (
    <ListScreen<Workspace>
      title="Workspaces"
      description="A workspace is a project or an environment. Each one is production or dev, decided when it is created."
      path={`${base}/workspaces`}
      rowKey={(row) => row.id}
      columns={[
        {
          header: "Name",
          cell: (row) => (
            <Link
              to={`/t/${tenantId}/workspaces/${row.id}/overview`}
              className="font-medium text-action"
            >
              {row.name}
            </Link>
          ),
        },
        { header: "Slug", cell: (row) => code(row.slug) },
        { header: "Type", cell: (row) => <TypeBadge type={row.type} /> },
        {
          header: "Promotes to",
          cell: (row) =>
            production.find((candidate) => candidate.id === row.linkedWorkspaceId)?.name ?? "",
        },
      ]}
      empty={{
        title: "No workspaces yet",
        text: "Start with a production workspace. Add a dev workspace linked to it when you want somewhere safe to make changes.",
      }}
      create={{
        action: "Create workspace",
        description: "The type cannot be changed afterwards.",
        fields: [
          { name: "name", label: "Name", placeholder: "Order sync" },
          {
            name: "slug",
            label: "Slug",
            placeholder: "order-sync",
            hint: "Lowercase letters, digits and hyphens.",
          },
          {
            name: "type",
            label: "Type",
            options: [
              { value: "dev", label: "Dev" },
              { value: "production", label: "Production" },
            ],
          },
          {
            name: "linkedWorkspaceId",
            label: "Promotes to",
            hint: "For a dev workspace: the production workspace its changes go to.",
            options: [
              { value: "", label: "Nothing" },
              ...production.map((w) => ({ value: w.id, label: w.name })),
            ],
          },
        ],
        submit: ({ linkedWorkspaceId, ...values }) =>
          api.post(`${base}/workspaces`, {
            ...values,
            ...(linkedWorkspaceId ? { linkedWorkspaceId } : {}),
          }),
      }}
    />
  );
}

function ExportSection({ base }: { base: string }) {
  const tenant = useLoad<{ slug: string }>(base);
  if (tenant.error) return <Notice tone="danger">{tenant.error.message}</Notice>;
  if (!tenant.data) return null;
  return <TenantExport base={base} slug={tenant.data.slug} />;
}

function WorkspaceDetail({
  base,
  tenantId,
  workspaceId,
  tab,
  rest,
  runId,
}: {
  base: string;
  tenantId: string;
  workspaceId: string;
  tab: string;
  /** What follows the tab in the address: a flow's path, or a flow run's ID. */
  rest: string;
  runId: string | undefined;
}) {
  const workspace = useLoad<Workspace>(`${base}/workspaces/${workspaceId}`);
  const root = `${base}/workspaces/${workspaceId}`;
  const secretUses = useReferences(root, "secret", tab === "secrets");
  if (workspace.error) return <Notice tone="danger">{workspace.error.message}</Notice>;
  if (!workspace.data) return null;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      {tab === "overview" ? (
        <Overview
          root={root}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
          workspace={workspace.data}
        />
      ) : null}
      {tab === "settings" ? (
        <Page
          title="Workspace settings"
          description="Pause what starts by itself, make a copy, or delete a dev workspace."
        >
          <WorkspaceControls
            key={workspaceId}
            base={base}
            tenantId={tenantId}
            workspace={workspace.data}
            reload={workspace.reload}
          />
          <Promotion base={base} workspace={workspace.data} reload={workspace.reload} />
        </Page>
      ) : null}
      {tab === "flows" && (rest === "new" || rest.startsWith("edit/")) ? (
        workspace.data.type === "dev" ? (
          <Suspense fallback={<p className="text-ink-muted">Loading the editor…</p>}>
            <FlowEditor
              key={rest}
              root={root}
              link={`/t/${tenantId}/workspaces/${workspaceId}`}
              path={rest === "new" ? undefined : rest.slice("edit/".length)}
            />
          </Suspense>
        ) : (
          <Notice tone="attention">
            This is a production workspace. Flows are edited in a dev workspace and reach production
            by promotion.
          </Notice>
        )
      ) : tab === "flows" && rest ? (
        <FlowView
          key={rest}
          root={root}
          path={rest}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
          editable={workspace.data.type === "dev"}
        />
      ) : tab === "flows" ? (
        <Flows
          root={root}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
          editable={workspace.data.type === "dev"}
        />
      ) : tab === "flow-runs" && rest ? (
        <FlowRunView
          key={rest}
          root={root}
          id={rest}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
        />
      ) : tab === "dashboards" && rest ? (
        <DashboardView
          key={rest}
          root={root}
          id={rest}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
        />
      ) : tab === "dashboards" ? (
        <Dashboards root={root} link={`/t/${tenantId}/workspaces/${workspaceId}`} />
      ) : tab === "screens" && rest ? (
        <InterfaceBuilder
          key={rest}
          root={root}
          path={rest}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
        />
      ) : tab === "screens" ? (
        <Interfaces
          root={root}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
          editable={workspace.data.type === "dev"}
        />
      ) : tab === "events" ? (
        <EventsWorkbench root={root} link={`/t/${tenantId}/workspaces/${workspaceId}`} />
      ) : tab === "tables" && rest ? (
        <TableView
          key={rest}
          root={root}
          name={rest}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
        />
      ) : tab === "tables" ? (
        <Tables root={root} link={`/t/${tenantId}/workspaces/${workspaceId}`} />
      ) : tab === "sources" && rest ? (
        <SourceView
          key={rest}
          root={root}
          path={rest}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
        />
      ) : tab === "sources" ? (
        <Sources root={root} link={`/t/${tenantId}/workspaces/${workspaceId}`} />
      ) : null}
      {tab === "apps" ? (
        <Apps root={root} />
      ) : tab === "scripts" && (rest === "new" || rest.startsWith("edit/")) ? (
        <ScriptEditor
          key={rest}
          root={root}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
          path={rest === "new" ? undefined : rest.slice("edit/".length)}
          editable={workspace.data.type === "dev"}
        />
      ) : tab === "extensions" && /^(connector|trigger_source)\/(new$|edit\/)/.test(rest) ? (
        <ScriptEditor
          key={rest}
          root={root}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
          kind={rest.split("/")[0] as CodeKind}
          path={
            rest.endsWith("/new") ? undefined : rest.slice(rest.indexOf("/edit/") + "/edit/".length)
          }
          editable={workspace.data.type === "dev"}
        />
      ) : tab === "extensions" ? (
        <Extensions
          root={root}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
          editable={workspace.data.type === "dev"}
        />
      ) : tab === "release" || tab === "changes" || tab === "deployments" ? (
        <Release
          base={base}
          root={root}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
          workspace={workspace.data}
          step={tab === "deployments" ? "deploy" : "review"}
          reload={workspace.reload}
        />
      ) : tab === "git" ? (
        <GitSync root={root} link={`/t/${tenantId}/workspaces/${workspaceId}`} />
      ) : tab === "scripts" ? (
        <Scripts
          root={root}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
          editable={workspace.data.type === "dev"}
        />
      ) : tab === "runs" ? (
        <RunsWorkbench
          root={root}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
          selected={runId}
        />
      ) : tab === "triggers" ? (
        <TriggersWorkbench
          root={root}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
          workspacePaused={workspace.data.triggersPaused}
          production={workspace.data.type === "production"}
        />
      ) : tab === "connections" ? (
        <div className="flex flex-col gap-8">
          <Connections root={root} />
          <ConnectionGroups root={root} />
        </div>
      ) : tab === "variables" ? (
        <Variables root={root} />
      ) : null}
      {tab === "resources" && /^(new|edit)\//.test(rest) ? (
        (() => {
          const [mode, kind = "", ...at] = rest.split("/");
          return isEditedKind(kind) ? (
            <ResourceEditor
              key={rest}
              root={root}
              link={`/t/${tenantId}/workspaces/${workspaceId}`}
              kind={kind}
              path={mode === "edit" ? at.join("/") : undefined}
              editable={workspace.data.type === "dev"}
            />
          ) : (
            <Notice tone="danger">There is no editor here for a {kind}.</Notice>
          );
        })()
      ) : tab === "resources" ? (
        <ListScreen<{
          id: string;
          path: string;
          kind: string;
          ownership: string;
          version: number;
          updatedAt: string;
        }>
          title="Resources"
          description="Everything deployed to this workspace. Connections, variables, events, schedules and triggers can be made and changed here in a dev workspace. Scripts, flows and apps have screens of their own."
          path={`${root}/resources`}
          rowKey={(row) => row.id}
          action={
            workspace.data.type === "dev" ? (
              <Menu
                label="New"
                align="end"
                items={EDITED_KINDS.map((kind) => ({
                  label: `${kind[0]?.toUpperCase()}${kind.slice(1).replace("_", " ")}`,
                  onSelect: () =>
                    navigate(`/t/${tenantId}/workspaces/${workspaceId}/resources/new/${kind}`),
                }))}
              />
            ) : undefined
          }
          columns={[
            {
              header: "Path",
              cell: (row) =>
                isEditedKind(row.kind) ? (
                  <Link
                    to={`/t/${tenantId}/workspaces/${workspaceId}/resources/edit/${row.kind}/${row.path}`}
                    className="font-mono text-[13px] text-action"
                  >
                    {row.path}
                  </Link>
                ) : (
                  code(row.path)
                ),
            },
            { header: "Kind", cell: (row) => row.kind },
            {
              header: "Managed in",
              cell: (row) => (row.ownership === "code" ? "Repository" : "Console"),
            },
            { header: "Version", cell: (row) => row.version, align: "end" },
            { header: "Changed", cell: (row) => when(row.updatedAt) },
          ]}
          empty={{
            title: "No resources yet",
            text: "Resources appear here when they are deployed from the tenant's repository.",
          }}
        />
      ) : tab === "secrets" ? (
        <ListScreen<{ name: string; updatedAt: string; updatedBy?: string | null }>
          title="Secrets"
          description="Values are encrypted with this tenant's own key. A value can be replaced but never read back here."
          path={`${root}/secrets`}
          rowKey={(row) => row.name}
          columns={[
            { header: "Name", cell: (row) => code(row.name) },
            { header: "Used by", cell: (row) => <UsedBy uses={secretUses(row.name)} /> },
            {
              header: "Last set",
              cell: (row) => (
                <span>
                  {when(row.updatedAt)}
                  {row.updatedBy ? (
                    <span className="text-ink-muted"> by {row.updatedBy}</span>
                  ) : null}
                </span>
              ),
            },
          ]}
          empty={{
            title: "No secrets yet",
            text: "Store API keys and passwords here. Resources refer to a secret by its name.",
          }}
          create={{
            action: "Set secret",
            description: "Setting a name that already exists replaces its value.",
            fields: [
              {
                name: "name",
                label: "Name",
                placeholder: "STRIPE_API_KEY",
                hint: "Letters, digits and underscores.",
              },
              { name: "value", label: "Value", type: "password" },
            ],
            submit: (values) =>
              api.put(`${root}/secrets/${encodeURIComponent(values.name ?? "")}`, {
                value: values.value,
              }),
          }}
          rowActions={(row, reload) => (
            <RemoveButton
              label="Delete"
              confirm={`Delete the secret ${row.name}? Anything that uses it will fail.`}
              run={() => api.delete(`${root}/secrets/${row.name}`)}
              onDone={reload}
            />
          )}
        />
      ) : null}
    </div>
  );
}

function Members({ base }: { base: string }) {
  return (
    <ListScreen<{ id: string; name: string; email: string; suspended?: boolean }>
      title="Members"
      description="People who belong to this tenant. Belonging grants nothing by itself: give access under Access."
      path={`${base}/members?limit=200`}
      rowKey={(row) => row.id}
      columns={[
        { header: "Name", cell: (row) => row.name },
        { header: "Email", cell: (row) => row.email },
        {
          header: "",
          cell: (row) => (row.suspended ? <Badge tone="attention">Suspended</Badge> : null),
        },
      ]}
      empty={{ title: "No members yet" }}
      create={{
        action: "Add member",
        description:
          "For someone who already has an account, the email is enough. Otherwise fill in all three to create one.",
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
        ],
        submit: ({ email, name, password }) =>
          api.post(`${base}/members`, {
            email,
            ...(name ? { name } : {}),
            ...(password ? { password } : {}),
          }),
      }}
      rowActions={(row, reload) => (
        <span className="flex justify-end gap-2">
          <Button
            size="small"
            onClick={async () => {
              if (!row.suspended) {
                const sure = await ask.confirm({
                  title: `Suspend ${row.email}?`,
                  text: "They hold nothing in this tenant until they are resumed. What they were given is kept, and so is whatever they hold in other tenants.",
                  action: "Suspend",
                  danger: true,
                });
                if (!sure) return;
              }
              await api
                .patch(`${base}/members/${row.id}`, { suspended: !row.suspended })
                .then(reload, notify.error);
            }}
          >
            {row.suspended ? "Resume" : "Suspend"}
          </Button>
          <RemoveButton
            confirm={`Remove ${row.email} from this tenant? Their access here is removed too.`}
            run={() => api.delete(`${base}/members/${row.id}`)}
            onDone={reload}
          />
        </span>
      )}
    />
  );
}

function ServiceAccounts({ base, path }: { base: string; path: string }) {
  const selected = match("/t/:t/service-accounts/:id", path)?.id;
  if (selected) {
    const keys = `${base}/service-accounts/${selected}/api-keys`;
    return (
      <>
        <ListScreen<KeyRow>
          title="Service account keys"
          description="A key acts as the service account, with the access the account has been given."
          path={keys}
          rowKey={(row) => row.id}
          columns={keyColumns}
          empty={{ title: "No keys yet" }}
          create={{
            action: "Create API key",
            fields: [{ name: "name", label: "Name", placeholder: "Deploy pipeline" }],
            submit: (values) => api.post(keys, values),
            afterCreate: showNewKey,
          }}
          rowActions={(row, reload) =>
            row.revokedAt ? null : (
              <RemoveButton
                label="Revoke"
                confirm={`Revoke the key "${row.name}"?`}
                run={() => api.delete(`${keys}/${row.id}`)}
                onDone={reload}
              />
            )
          }
        />
        <Page
          title="Agent access"
          description="What an AI agent gets when it connects with one of these keys."
        >
          <AgentAccess base={base} account={selected} />
        </Page>
      </>
    );
  }
  const tenantId = base.split("/")[2];
  return (
    <ListScreen<{ id: string; name: string; createdAt: string }>
      title="Service accounts"
      description="Identities for machines: a deploy pipeline, another system. They sign in with an API key."
      path={`${base}/service-accounts`}
      rowKey={(row) => row.id}
      columns={[
        {
          header: "Name",
          cell: (row) => (
            <Link
              to={`/t/${tenantId}/service-accounts/${row.id}`}
              className="font-medium text-action"
            >
              {row.name}
            </Link>
          ),
        },
        { header: "Created", cell: (row) => when(row.createdAt) },
      ]}
      empty={{ title: "No service accounts yet" }}
      create={{
        action: "Create service account",
        fields: [{ name: "name", label: "Name", placeholder: "ci" }],
        submit: (values) => api.post(`${base}/service-accounts`, values),
      }}
      rowActions={(row, reload) => (
        <RemoveButton
          label="Delete"
          confirm={`Delete ${row.name}? Its keys stop working.`}
          run={() => api.delete(`${base}/service-accounts/${row.id}`)}
          onDone={reload}
        />
      )}
    />
  );
}

interface Binding {
  id: string;
  scopeType: string;
  workspaceId: string | null;
  principalType: string;
  principalLabel: string;
  roleName: string;
  managedByResource: boolean;
}

function Access({ base }: { base: string }) {
  const roles = useLoad<{ items: Role[] }>(`${base}/roles`);
  const members = useLoad<{ items: { id: string; email: string }[] }>(`${base}/members?limit=200`);
  const groups = useLoad<{ items: { id: string; name: string }[] }>(`${base}/groups`);
  const accounts = useLoad<{ items: { id: string; name: string }[] }>(`${base}/service-accounts`);
  const endUserGroups = useLoad<{ items: { id: string; name: string }[] }>(
    `${base}/end-user-groups`,
  );
  const endUsers = useLoad<{ items: { id: string; email: string }[] }>(
    `${base}/end-users?limit=200`,
  );
  const workspaces = useLoad<{ items: Workspace[] }>(`${base}/workspaces`);
  const workspaceName = (id: string | null) =>
    workspaces.data?.items.find((w) => w.id === id)?.name ?? "";
  const principals = [
    ...(members.data?.items ?? []).map((m) => ({ value: `member:${m.id}`, label: m.email })),
    ...(groups.data?.items ?? []).map((g) => ({
      value: `group:${g.id}`,
      label: `Group: ${g.name}`,
    })),
    ...(accounts.data?.items ?? []).map((a) => ({
      value: `service_account:${a.id}`,
      label: `Service account: ${a.name}`,
    })),
    // Every end user is one principal with no ID: whoever has signed in to this tenant's portal.
    { value: "end_users:", label: "Every end user" },
    ...(endUserGroups.data?.items ?? []).map((g) => ({
      value: `end_user_group:${g.id}`,
      label: `End-user group: ${g.name}`,
    })),
    ...(endUsers.data?.items ?? []).map((u) => ({
      value: `end_user:${u.id}`,
      label: `End user: ${u.email}`,
    })),
  ];
  return (
    <ListScreen<Binding>
      title="Access"
      description="Who holds which role, and where. Access given at the tenant applies to every workspace in it."
      path={`${base}/bindings`}
      rowKey={(row) => row.id}
      columns={[
        { header: "Who", cell: (row) => row.principalLabel },
        { header: "Role", cell: (row) => code(row.roleName) },
        {
          header: "Where",
          cell: (row) =>
            row.scopeType === "tenant"
              ? "Whole tenant"
              : `${workspaceName(row.workspaceId)}${row.scopeType === "resource" ? " (one resource)" : ""}`,
        },
        {
          header: "",
          cell: (row) =>
            row.managedByResource ? <Badge tone="action">From repository</Badge> : null,
        },
      ]}
      empty={{
        title: "Nobody has access yet",
        text: "Give a member, a group, a service account or an end user a role.",
      }}
      create={{
        action: "Give access",
        fields: [
          { name: "principal", label: "Who", options: principals },
          {
            name: "roleId",
            label: "Role",
            options: (roles.data?.items ?? [])
              .filter((role) => !role.workspaceId)
              .map((role) => ({ value: role.id, label: role.name })),
          },
          {
            name: "workspaceId",
            label: "Where",
            options: [
              { value: "", label: "Whole tenant" },
              ...(workspaces.data?.items ?? []).map((w) => ({ value: w.id, label: w.name })),
            ],
          },
        ],
        submit: ({ principal = "", roleId, workspaceId }) => {
          const [principalType, principalId] = principal.split(":");
          return api.post(`${base}/bindings`, {
            principalType,
            ...(principalId ? { principalId } : {}),
            roleId,
            ...(workspaceId ? { workspaceId } : {}),
          });
        },
      }}
      rowActions={(row, reload) =>
        row.managedByResource ? null : (
          <RemoveButton
            confirm={`Remove the ${row.roleName} role from ${row.principalLabel}?`}
            run={() => api.delete(`${base}/bindings/${row.id}`)}
            onDone={reload}
          />
        )
      }
    />
  );
}

function OperatorAccess({ base }: { base: string }) {
  return (
    <ListScreen<Grant>
      title="Operator access"
      description="Every time the people who run this instance opened access to your tenant, and why. You can end an active grant at any time."
      path={`${base}/access-grants`}
      rowKey={(row) => row.id}
      columns={[
        { header: "Operator", cell: (row) => row.memberEmail },
        { header: "Reason", cell: (row) => row.reason },
        { header: "Access level", cell: (row) => code(row.roleName) },
        { header: "Opened", cell: (row) => when(row.createdAt) },
        {
          header: "Status",
          cell: (row) =>
            row.active ? (
              <Badge tone="attention">Active until {when(row.expiresAt)}</Badge>
            ) : (
              <Badge>Ended</Badge>
            ),
        },
      ]}
      empty={{
        title: "No operator has accessed this tenant",
        text: "If one ever does, the grant and its reason appear here.",
      }}
      rowActions={(row, reload) =>
        row.active ? (
          <RemoveButton
            label="End access"
            confirm={`End ${row.memberEmail}'s access now?`}
            run={() => api.delete(`${base}/access-grants/${row.id}`)}
            onDone={reload}
          />
        ) : null
      }
    />
  );
}

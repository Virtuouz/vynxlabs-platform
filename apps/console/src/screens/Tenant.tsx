import { Button, EmptyState, Menu, Notice, SelectField, TextField } from "@volvel/ui";
import { lazy, Suspense, useEffect, useState } from "react";
import { ApiError, api, isOperator, type Me, useLoad } from "../api.ts";
import { notify } from "../ask.tsx";
import { Can, useNeeds } from "../kit/Can.tsx";
import { CollectionView } from "../kit/CollectionView.tsx";
import { useEditorKey } from "../kit/editorKey.ts";
import { KeyValues } from "../kit/layout.tsx";
import { setOperatorAccess } from "../kit/OperatorStrip.tsx";
import { UsedBy, useReferences, usersOf } from "../kit/references.tsx";
import { Time } from "../kit/Time.tsx";
import { Truncate } from "../kit/Truncate.tsx";
import {
  type CreateConfig,
  CreateDialog,
  ListScreen,
  Page,
  RemoveButton,
  when,
} from "../ListScreen.tsx";
import { Link, match, navigate } from "../router.tsx";
import { EffectiveAccess, MemberPage } from "./Access.tsx";
import { type KeyRow, keyColumns, keyExpiryField, newKeyBody, showNewKey } from "./Account.tsx";
import { AgentAccess } from "./AgentAccess.tsx";
import { Apps } from "./Apps.tsx";
import { AuditTable } from "./Audit.tsx";
import type { CodeKind } from "./Authoring.tsx";
import { Branding } from "./Branding.tsx";
import { Sources, SourceView, Tables, TableView } from "./Data.tsx";
import { Domains } from "./Domains.tsx";
import { EndUsers } from "./EndUsers.tsx";
import { TenantExport, WorkspaceSettings } from "./Environments.tsx";
import { ConnectionGroups, Connections, Scripts, Variables, Workers } from "./Execution.tsx";
import { Files } from "./Files.tsx";
import { GitSync } from "./GitSync.tsx";
import { NotFound } from "./NotFound.tsx";
import { OldPaths } from "./OldPaths.tsx";
import { ApprovalsQueue, EventsWorkbench, TriggersWorkbench } from "./Operate.tsx";
import { Overview } from "./Overview.tsx";
import { Release } from "./Release.tsx";
import { EDITED_KINDS, isEditedKind, ResourceEditor } from "./ResourceEditor.tsx";
import { definedWhere, type NamedResource, ResourceIdentity } from "./ResourceIdentity.tsx";
import { RetentionSettings } from "./Retention.tsx";
import { RunPage, ToRunPage } from "./RunPage.tsx";
import { RunsWorkbench } from "./Runs.tsx";

// Screens that bring a library with them, or that few people open, are fetched when first
// opened: the code editor, the screen builder with its charts, and single sign-on.
const Extensions = lazy(() => import("./Authoring.tsx").then((m) => ({ default: m.Extensions })));
const ScriptEditor = lazy(() =>
  import("./Authoring.tsx").then((m) => ({ default: m.ScriptEditor })),
);
const Queries = lazy(() => import("./Queries.tsx").then((m) => ({ default: m.Queries })));
const Dashboards = lazy(() => import("./Dashboards.tsx").then((m) => ({ default: m.Dashboards })));
const DashboardView = lazy(() =>
  import("./Dashboards.tsx").then((m) => ({ default: m.DashboardView })),
);
const AppPreview = lazy(() =>
  import("./builder/AppPreview.tsx").then((m) => ({ default: m.AppPreview })),
);

import { BuilderSkeleton } from "./builder/BuilderSkeleton.tsx";

const InterfaceBuilder = lazy(() =>
  import("./builder/AppBuilder.tsx").then((m) => ({ default: m.AppBuilder })),
);
const Interfaces = lazy(() => import("./Interfaces.tsx").then((m) => ({ default: m.Interfaces })));
// Documentation brings the reader of Markdown with it, and its editor the code editor.
const Docs = lazy(() => import("./docs/Docs.tsx").then((m) => ({ default: m.Docs })));
const DocEditor = lazy(() =>
  import("./docs/DocEditor.tsx").then((m) => ({ default: m.DocEditor })),
);
const SingleSignOn = lazy(() =>
  import("./SingleSignOn.tsx").then((m) => ({ default: m.SingleSignOn })),
);

// The flow editor brings a canvas library with it, so it is fetched when first opened.
const FlowEditor = lazy(() =>
  import("./FlowEditor.tsx").then((module) => ({ default: module.FlowEditor })),
);

import { ErrorState, Loading } from "../kit/LoadState.tsx";
import { ObjectPage } from "../kit/ObjectPage.tsx";
import { hasHome, ObjectLink, objectHref, ProductionNotice } from "../kit/objects.tsx";
import { Code, EnvTag, StatePill } from "../kit/status.tsx";
import { Alerts } from "./Alerts.tsx";
import { Flows, FlowView } from "./Flows.tsx";
import { RepositorySettings } from "./Git.tsx";
import { GiveAccess } from "./GiveAccess.tsx";
import { EndUserGroups } from "./Groups.tsx";
import { ACCESS_TABS, type AccessTab, endUsersFramed, MembersAndAccess } from "./Members.tsx";
import { ConnectionPage, EventPage, ScriptPage, SecretPage, VariablePage } from "./ObjectPages.tsx";
import type { Role } from "./Roles.tsx";
import { RunComparePage } from "./RunCompare.tsx";
import { TenantOverview } from "./TenantOverview.tsx";

const isAccessTab = (slug: string): slug is AccessTab =>
  ACCESS_TABS.some((tab) => tab.slug === slug);

interface Workspace {
  id: string;
  slug: string;
  name: string;
  type: "production" | "dev";
  linkedWorkspaceId: string | null;
  triggersPaused: boolean;
  /** An operator has paused every trigger in the instance. */
  pausedByInstance?: boolean;
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

/** Production is always marked. It is the one thing nobody should have to look for. */
export const TypeBadge = ({ type }: { type: "production" | "dev" }) => <EnvTag type={type} />;

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
      render: ({ value, onChange, error }) => (
        <GrantLength value={value || undefined} onChange={onChange} error={error} />
      ),
    },
  ],
  submit: (values) =>
    api.post(`/tenants/${tenantId}/access-grants`, {
      reason: values.reason,
      roleId: values.roleId,
      durationMinutes: grantMinutes(values.durationMinutes),
    }),
});

const LONGEST_GRANT = 1440;
const GRANT_LENGTHS = [
  { value: "60", label: "1 hour" },
  { value: "240", label: "4 hours" },
  { value: "1440", label: "24 hours" },
];

/** A grant's length in minutes: one of the offered, or `other:<minutes>` typed by the person. */
function grantMinutes(value: string | undefined): number {
  const minutes = Number((value ?? "60").replace(/^other:/, ""));
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > LONGEST_GRANT) {
    throw new ApiError(400, {
      detail: `The length is 1 to ${LONGEST_GRANT} minutes.`,
      errors: [
        {
          path: "/body/durationMinutes",
          message: `Give a whole number of minutes, from 1 to ${LONGEST_GRANT} (24 hours).`,
        },
      ],
    });
  }
  return minutes;
}

function GrantLength({
  value,
  onChange,
  error,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  error: string | undefined;
}) {
  const current = value ?? "60";
  const other = current.startsWith("other:");
  return (
    <div className="flex flex-col gap-3">
      <SelectField
        name="duration"
        label="Duration"
        options={[...GRANT_LENGTHS, { value: "other", label: "Other" }]}
        value={other ? "other" : current}
        {...(other ? {} : error ? { error } : {})}
        onChange={(next) => onChange(next === "other" ? "other:" : next)}
      />
      {other ? (
        <TextField
          name="durationMinutes"
          label="Minutes"
          type="number"
          value={current.slice("other:".length)}
          hint={`A whole number, from 1 to ${LONGEST_GRANT} (24 hours).`}
          {...(error ? { error } : {})}
          onChange={(text) => onChange(`other:${text}`)}
        />
      ) : null}
    </div>
  );
}

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

  const reloadGrants = grants.reload;
  // The strip says access is open, so it is read again when the grant runs out.
  const endsAt = mine ? new Date(mine.expiresAt).getTime() : null;
  useEffect(() => {
    if (endsAt === null) return;
    const wait = endsAt - Date.now();
    // A grant the clock says is over but the server still lists is asked about slowly, not at once.
    const timer = setTimeout(reloadGrants, Math.min(wait > 0 ? wait + 500 : 5000, 2_147_000_000));
    return () => clearTimeout(timer);
  }, [endsAt, reloadGrants]);
  // The shell says it under its header on every screen while the grant lasts.
  useEffect(() => {
    setOperatorAccess(
      mine
        ? {
            grant: mine,
            end: async () => {
              await api.delete(`${base}/access-grants/${mine.id}`);
              reloadGrants();
            },
          }
        : null,
    );
  }, [mine, base, reloadGrants]);
  useEffect(() => () => setOperatorAccess(null), []);

  if (operator && !isMember && !grants.data && !grants.error) return null;
  if (operator && !isMember && !grants.data && grants.error) {
    return (
      <div className="px-4 py-4 md:px-8">
        <Page title="Your access to this tenant could not be read">
          <ErrorState error={grants.error} onRetry={grants.reload} />
        </Page>
      </div>
    );
  }
  if (operator && !isMember && !mine) {
    return (
      <div className="px-4 py-4 md:px-8">
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
      </div>
    );
  }

  const section = match("/t/:t/:section/*", path)?.section ?? "overview";
  const workspace = match("/t/:t/workspaces/:w/:tab/*", path);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      {workspace?.w ? (
        <WorkspaceDetail
          base={base}
          tenantId={tenantId}
          workspaceId={workspace.w}
          tab={workspace.tab ?? "overview"}
          rest={path.split("/").slice(6).map(decodeURIComponent).join("/")}
        />
      ) : section === "approvals" ? (
        <ApprovalsQueue base={base} tenantId={tenantId} />
      ) : section === "workers" ? (
        <Workers base={base} />
      ) : section === "overview" ? (
        <TenantOverview base={base} tenantId={tenantId} />
      ) : section === "members" && match("/t/:t/members/:id", path) ? (
        <MemberPage
          base={base}
          tenantId={tenantId}
          id={match("/t/:t/members/:id", path)?.id as string}
        />
      ) : isAccessTab(section) ? (
        <MembersAndAccess base={base} tenantId={tenantId} tab={section} />
      ) : section === "end-users" ? (
        <EndUsers base={base} framed={endUsersFramed(tenantId, "end-users")} />
      ) : section === "branding" ? (
        <Branding base={base} />
      ) : section === "domains" ? (
        <Domains base={base} />
      ) : section === "end-user-groups" ? (
        <EndUserGroups base={base} framed={endUsersFramed(tenantId, "end-user-groups")} />
      ) : section === "service-accounts" ? (
        <ServiceAccounts base={base} path={path} />
      ) : section === "operator-access" ? (
        <OperatorAccess base={base} />
      ) : section === "repository" ? (
        <RepositorySettings base={base} />
      ) : section === "single-sign-on" ? (
        <SingleSignOn base={base} />
      ) : section === "export" ? (
        <ExportSection base={base} />
      ) : section === "retention" ? (
        <RetentionSettings base={base} />
      ) : section === "audit" ? (
        <AuditTable
          title="Audit log"
          description="Every change in this tenant, and every request an operator made under an access grant."
          path={`${base}/audit`}
        />
      ) : section === "workspaces" ? (
        <Workspaces base={base} tenantId={tenantId} />
      ) : (
        <NotFound home={`/t/${tenantId}`} homeLabel="Go to the tenant overview" />
      )}
    </div>
  );
}

function Workspaces({ base, tenantId }: { base: string; tenantId: string }) {
  const existing = useLoad<{ items: Workspace[] }>(`${base}/workspaces`);
  // A dev workspace may promote to production or to another dev workspace, which is what a clone does.
  const all = existing.data?.items ?? [];
  return (
    <ListScreen<Workspace>
      title="Workspaces"
      needs={{ base, permission: "workspace:write", what: "this tenant's workspaces" }}
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
        { header: "Slug", cell: (row) => <Code>{row.slug}</Code> },
        { header: "Type", cell: (row) => <TypeBadge type={row.type} /> },
        {
          header: "Promotes to",
          cell: (row) =>
            all.find((candidate) => candidate.id === row.linkedWorkspaceId)?.name ?? "",
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
            // Chosen on purpose: it cannot be changed afterwards.
            pick: true,
            options: [
              { value: "production", label: "Production" },
              { value: "dev", label: "Dev" },
            ],
          },
          {
            name: "linkedWorkspaceId",
            label: "Promotes to",
            hint: "For a dev workspace: the workspace its changes go to, production or another dev workspace.",
            options: [
              { value: "", label: "Nothing" },
              ...all.map((w) => ({ value: w.id, label: `${w.name} (${w.type})` })),
            ],
          },
        ],
        submit: ({ linkedWorkspaceId, ...values }) =>
          api.post(`${base}/workspaces`, {
            ...values,
            ...(linkedWorkspaceId ? { linkedWorkspaceId } : {}),
          }),
        done: (made, values) => ({
          message: `Workspace ${values.name} is made.`,
          link: {
            label: `Open ${values.name}`,
            href: `/t/${tenantId}/workspaces/${(made as { id: string }).id}/overview`,
          },
        }),
      }}
    />
  );
}

function ExportSection({ base }: { base: string }) {
  const tenant = useLoad<{ slug: string }>(base);
  if (tenant.error) return <ErrorState error={tenant.error} onRetry={tenant.reload} />;
  if (!tenant.data) return <Loading />;
  return <TenantExport base={base} slug={tenant.data.slug} />;
}

/** Every tab a workspace has. Any other address in a workspace has no page. */
const WORKSPACE_TABS = new Set([
  "alerts",
  "approvals",
  "apps",
  "changes",
  "connections",
  "dashboards",
  "deployments",
  "docs",
  "events",
  "extensions",
  "files",
  "flow-runs",
  "flows",
  "git",
  "overview",
  "queries",
  "release",
  "resources",
  "runs",
  "screens",
  "scripts",
  "secrets",
  "settings",
  "sources",
  "tables",
  "triggers",
  "variables",
]);

function WorkspaceDetail({
  base,
  tenantId,
  workspaceId,
  tab,
  rest,
}: {
  base: string;
  tenantId: string;
  workspaceId: string;
  tab: string;
  /** What follows the tab in the address: a flow's path, or a flow run's ID. */
  rest: string;
}) {
  const workspace = useLoad<Workspace>(`${base}/workspaces/${workspaceId}`);
  const codeEditorKey = useEditorKey(`${tab}/${rest}`);
  // An address may name the workspace by its slug, as people type it. When the
  // ID is refused, the slug is looked up and the address replaced by the ID's.
  const refused = workspace.error?.status === 400 || workspace.error?.status === 404;
  const all = useLoad<{ items: Workspace[] }>(refused ? `${base}/workspaces` : null);
  const named = all.data?.items.find((one) => one.slug === workspaceId);
  useEffect(() => {
    if (!named) return;
    const from = `/workspaces/${encodeURIComponent(workspaceId)}`;
    navigate(location.pathname.replace(from, `/workspaces/${named.id}`) + location.search, {
      replace: true,
    });
  }, [named, workspaceId]);
  const root = `${base}/workspaces/${workspaceId}`;
  const secretUses = useReferences(root, "secret", tab === "secrets");
  if (refused) {
    if (named || (!all.data && !all.error)) return null;
    return <NotFound home={`/t/${tenantId}/workspaces`} homeLabel="Go to the workspaces" />;
  }
  if (workspace.error) return <ErrorState error={workspace.error} onRetry={workspace.reload} />;
  if (!workspace.data) return <Loading />;
  if (!WORKSPACE_TABS.has(tab)) {
    return (
      <NotFound
        home={`/t/${tenantId}/workspaces/${workspaceId}/overview`}
        homeLabel={`Go to the ${workspace.data.name} overview`}
      />
    );
  }
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
        <WorkspaceSettings
          key={workspaceId}
          base={base}
          tenantId={tenantId}
          workspace={workspace.data}
          reload={workspace.reload}
        />
      ) : null}
      {tab === "flows" && (rest === "new" || rest.startsWith("edit/")) ? (
        workspace.data.type === "dev" ? (
          <Suspense fallback={<p className="text-ink-muted">Loading the editor…</p>}>
            <FlowEditor
              key={codeEditorKey}
              root={root}
              link={`/t/${tenantId}/workspaces/${workspaceId}`}
              path={rest === "new" ? undefined : rest.slice("edit/".length)}
            />
          </Suspense>
        ) : (
          <ProductionNotice
            root={root}
            noun="Flows"
            edit={rest.startsWith("edit/") ? `flows/${rest}` : undefined}
          />
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
        // A flow run's page is the run page now; old links still arrive.
        <ToRunPage to={`/t/${tenantId}/workspaces/${workspaceId}/runs/${rest}`} />
      ) : tab === "docs" && (rest === "new" || rest.startsWith("edit/")) ? (
        workspace.data.type === "dev" ? (
          <Suspense fallback={<p className="text-ink-muted">Loading the editor…</p>}>
            <DocEditor
              key={rest}
              root={root}
              link={`/t/${tenantId}/workspaces/${workspaceId}`}
              tenantId={tenantId}
              workspaceId={workspaceId}
              path={rest === "new" ? undefined : rest.slice("edit/".length)}
            />
          </Suspense>
        ) : (
          <ProductionNotice root={root} noun="Pages" edit={`docs/${rest}`} />
        )
      ) : tab === "docs" ? (
        <Suspense fallback={<Loading />}>
          <Docs
            root={root}
            link={`/t/${tenantId}/workspaces/${workspaceId}`}
            tenantId={tenantId}
            workspaceId={workspaceId}
            path={rest === "" ? undefined : rest}
            editable={workspace.data.type === "dev"}
          />
        </Suspense>
      ) : tab === "queries" ? (
        <Queries
          root={root}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
          editable={workspace.data.type === "dev"}
        />
      ) : tab === "dashboards" && rest ? (
        <DashboardView
          key={rest}
          root={root}
          id={rest}
          editable={workspace.data.type === "dev"}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
        />
      ) : tab === "dashboards" ? (
        <Dashboards root={root} link={`/t/${tenantId}/workspaces/${workspaceId}`} />
      ) : tab === "screens" && /^.+?\/preview(\/.*)?$/.test(rest) ? (
        <AppPreview
          key={rest.replace(/\/preview(\/.*)?$/, "")}
          root={root}
          path={rest.replace(/\/preview(\/.*)?$/, "")}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
          workspaceName={workspace.data.name}
        />
      ) : tab === "screens" && rest ? (
        <Suspense fallback={<BuilderSkeleton />}>
          <InterfaceBuilder
            key={rest}
            root={root}
            path={rest}
            link={`/t/${tenantId}/workspaces/${workspaceId}`}
          />
        </Suspense>
      ) : tab === "screens" ? (
        <Interfaces
          root={root}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
          editable={workspace.data.type === "dev"}
        />
      ) : tab === "events" && rest ? (
        <EventPage
          root={root}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
          path={rest}
          production={workspace.data.type === "production"}
        />
      ) : tab === "events" ? (
        <EventsWorkbench
          root={root}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
          production={workspace.data.type === "production"}
        />
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
      ) : tab === "files" ? (
        <Files root={root} />
      ) : null}
      {tab === "apps" ? (
        <Apps root={root} />
      ) : tab === "scripts" && (rest === "new" || rest.startsWith("edit/")) ? (
        <ScriptEditor
          key={codeEditorKey}
          root={root}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
          path={rest === "new" ? undefined : rest.slice("edit/".length)}
          editable={workspace.data.type === "dev"}
        />
      ) : tab === "extensions" && /^(connector|trigger_source)\/(new$|edit\/)/.test(rest) ? (
        <ScriptEditor
          key={codeEditorKey}
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
        <GitSync
          root={root}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
          production={
            workspace.data.type === "production" ? { slug: workspace.data.slug } : undefined
          }
        />
      ) : tab === "scripts" && rest ? (
        <ScriptPage
          root={root}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
          path={rest}
          production={workspace.data.type === "production"}
        />
      ) : tab === "scripts" ? (
        <Scripts
          root={root}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
          editable={workspace.data.type === "dev"}
        />
      ) : tab === "runs" && /^[^/]+\/compare\/[^/]+$/.test(rest) ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
          <RunComparePage
            key={rest}
            root={root}
            link={`/t/${tenantId}/workspaces/${workspaceId}`}
            id={rest.split("/")[0] as string}
            other={rest.split("/")[2] as string}
          />
        </div>
      ) : tab === "runs" && rest ? (
        <RunPage
          key={rest}
          root={root}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
          id={rest}
        />
      ) : tab === "runs" ? (
        <RunsWorkbench root={root} link={`/t/${tenantId}/workspaces/${workspaceId}`} />
      ) : tab === "approvals" ? (
        <ApprovalsQueue
          base={`/tenants/${tenantId}`}
          tenantId={tenantId}
          workspaceId={workspaceId}
        />
      ) : tab === "triggers" ? (
        <TriggersWorkbench
          root={root}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
          workspacePaused={workspace.data.triggersPaused}
          instancePaused={workspace.data.pausedByInstance === true}
          production={workspace.data.type === "production"}
        />
      ) : tab === "connections" && rest ? (
        <ConnectionPage root={root} link={`/t/${tenantId}/workspaces/${workspaceId}`} path={rest} />
      ) : tab === "connections" ? (
        <div className="flex flex-col gap-8">
          <Connections root={root} production={workspace.data.type === "production"} />
          <ConnectionGroups root={root} />
        </div>
      ) : tab === "variables" && rest ? (
        <VariablePage root={root} link={`/t/${tenantId}/workspaces/${workspaceId}`} path={rest} />
      ) : tab === "variables" ? (
        <Variables root={root} />
      ) : tab === "alerts" ? (
        <Alerts
          root={root}
          link={`/t/${tenantId}/workspaces/${workspaceId}`}
          workspaceRoot={`${base}/workspaces/${workspaceId}`}
          editable
        />
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
        <>
          <ListScreen<NamedResource & { id: string; version: number; updatedAt: string }>
            title="Resources"
            needs={{ base: root, permission: "resource:write", what: "this workspace's resources" }}
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
                wide: true,
                cell: (row) => (
                  <span className="flex min-w-0 flex-col">
                    {hasHome(row.kind) ? (
                      <Link
                        to={objectHref(
                          `/t/${tenantId}/workspaces/${workspaceId}`,
                          row.kind,
                          row.path,
                        )}
                        className="block min-w-0 font-mono text-code text-action"
                      >
                        <Truncate mode="middle">{row.path}</Truncate>
                      </Link>
                    ) : (
                      <Code>
                        <Truncate mode="middle">{row.path}</Truncate>
                      </Code>
                    )}
                    {row.title ? (
                      <span className="text-meta text-ink-muted">{row.title}</span>
                    ) : null}
                  </span>
                ),
              },
              { header: "Kind", cell: (row) => row.kind },
              {
                // Said only for one that was moved: until then a resource's key is its path.
                header: "Key",
                priority: 3,
                cell: (row) => (row.key === row.path ? "" : <Code>{row.key}</Code>),
              },
              // On a phone a row keeps what it is; when it changed shows from a tablet up.
              { header: "Defined in", priority: 3, cell: (row) => definedWhere(row) },
              { header: "Version", priority: 3, cell: (row) => row.version, align: "end" },
              {
                header: "Changed",
                priority: 2,
                cell: (row) => <Time value={row.updatedAt} mode="ago" />,
              },
            ]}
            empty={{
              title: "No resources yet",
              text: "Resources appear here when they are deployed from the tenant's repository.",
            }}
            {...(workspace.data.type === "dev"
              ? {
                  rowActions: (
                    row: NamedResource & { id: string; version: number; updatedAt: string },
                    reload: () => void,
                  ) => (
                    <ResourceIdentity
                      root={root}
                      link={`/t/${tenantId}/workspaces/${workspaceId}`}
                      row={row}
                      onDone={reload}
                    />
                  ),
                }
              : {})}
          />
          <OldPaths root={root} canEnd />
        </>
      ) : tab === "secrets" && rest ? (
        <SecretPage root={root} link={`/t/${tenantId}/workspaces/${workspaceId}`} name={rest} />
      ) : tab === "secrets" ? (
        <ListScreen<{ name: string; updatedAt: string; updatedBy?: string | null }>
          title="Secrets"
          needs={{ base: root, permission: "secret:write", what: "this workspace's secrets" }}
          setupField="name"
          description="Values are encrypted with this tenant's own key. A value can be replaced but never read back here."
          path={`${root}/secrets`}
          rowKey={(row) => row.name}
          columns={[
            {
              header: "Name",
              cell: (row) => (
                <ObjectLink
                  link={`/t/${tenantId}/workspaces/${workspaceId}`}
                  kind="secret"
                  path={row.name}
                />
              ),
            },
            {
              header: "Used by",
              cell: (row) => (
                <UsedBy
                  uses={secretUses(row.name)}
                  failed={secretUses.failed}
                  loaded={secretUses.loaded}
                  link={`/t/${tenantId}/workspaces/${workspaceId}`}
                  all={`/t/${tenantId}/workspaces/${workspaceId}/secrets/${row.name}?tab=used-by`}
                />
              ),
            },
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
            action: "New secret",
            description:
              "A name already in use is refused. To change a secret's value, open it and replace it.",
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
              api.post(`${root}/secrets`, { name: values.name, value: values.value }),
            done: (_made, values) => ({
              message: `The secret ${values.name} is made. Name it in a script's uses to read it.`,
              link: {
                label: `Open ${values.name}`,
                href: `/t/${tenantId}/workspaces/${workspaceId}/secrets/${values.name}`,
              },
            }),
          }}
          rowActions={(row, reload) => (
            <RemoveButton
              label="Delete"
              confirm={`Delete the secret ${row.name}? Anything that uses it will fail.`}
              affected={usersOf(secretUses(row.name))}
              usesUnread={secretUses.failed || !secretUses.loaded}
              run={() => api.delete(`${root}/secrets/${row.name}`)}
              onDone={reload}
            />
          )}
        />
      ) : null}
    </div>
  );
}

function ServiceAccounts({ base, path }: { base: string; path: string }) {
  const selected = match("/t/:t/service-accounts/:id", path)?.id;
  if (selected) return <ServiceAccountPage base={base} id={selected} />;
  return <ServiceAccountList base={base} />;
}

interface ServiceAccount {
  id: string;
  /** What code and a repository name it by. It never changes. */
  key?: string;
  name: string;
  description: string;
  createdAt: string;
}

/**
 * One service account, all in one place (08 §6.3): what it is and what it is
 * for, its keys, what it may do and where, and what an agent gets with it.
 */
function ServiceAccountPage({ base, id }: { base: string; id: string }) {
  const tenantId = base.split("/")[2] as string;
  const accounts = useLoad<{ items: ServiceAccount[] }>(`${base}/service-accounts`);
  const account = accounts.data?.items.find((one) => one.id === id);
  const [giving, setGiving] = useState(false);
  const may = useNeeds({ base, permission: "service_account:write", what: "this service account" });
  const [accessVersion, setAccessVersion] = useState(0);
  const mayGive = useNeeds({ base, permission: "binding:write", what: "this account's access" });
  if (accounts.error) return <ErrorState error={accounts.error} onRetry={accounts.reload} />;
  if (!accounts.data) return <Loading />;
  if (!account) {
    return (
      <NotFound home={`/t/${tenantId}/service-accounts`} homeLabel="Go to the service accounts" />
    );
  }
  const keys = `${base}/service-accounts/${id}/api-keys`;
  return (
    <>
      <ObjectPage
        eyebrow="Service account"
        title={account.name}
        meta={
          <p className="m-0 mt-2 text-ink-muted">
            {account.description || "What it is for is not said."} Made {when(account.createdAt)}.
          </p>
        }
        actions={
          <fieldset disabled={!may.can} className="contents">
            <RemoveButton
              label="Delete"
              confirm={`Delete ${account.name}? Its keys stop working at once.`}
              run={() => api.delete(`${base}/service-accounts/${id}`)}
              onDone={() => navigate(`/t/${tenantId}/service-accounts`)}
            />
          </fieldset>
        }
        tabs={[
          {
            id: "identity",
            label: "Identity",
            content: (
              <div className="max-w-xl">
                <Can base={base} permission="service_account:write" what="this service account">
                  <DescriptionForm base={base} account={account} onSaved={accounts.reload} />
                </Can>
              </div>
            ),
          },
          {
            id: "keys",
            label: "Keys",
            content: (
              <ListScreen<KeyRow>
                as="section"
                title="Keys"
                needs={{ base, permission: "service_account:write", what: "this account's keys" }}
                description="A key acts as the service account, with the access the account has been given."
                path={keys}
                rowKey={(row) => row.id}
                columns={keyColumns}
                empty={{ title: "No keys yet" }}
                create={{
                  action: "Create API key",
                  fields: [
                    { name: "name", label: "Name", placeholder: "Deploy pipeline" },
                    keyExpiryField,
                  ],
                  submit: (values) => api.post(keys, newKeyBody(values)),
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
            ),
          },
          {
            id: "access",
            label: "Access",
            content: (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="m-0 text-ink-muted">
                    Everything this account may do in the tenant, where, and what gives it.
                  </p>
                  <Button
                    variant="primary"
                    disabled={!mayGive.can}
                    {...(mayGive.reason ? { tooltip: mayGive.reason } : {})}
                    onClick={() => setGiving(true)}
                  >
                    Give access
                  </Button>
                </div>
                {mayGive.line}
                <EffectiveAccess
                  key={accessVersion}
                  base={base}
                  tenantId={tenantId}
                  principalType="service_account"
                  id={id}
                />
              </div>
            ),
          },
          {
            id: "agent",
            label: "Agent tools",
            content: <AgentAccess base={base} account={id} />,
          },
        ]}
      />
      <GiveAccess
        base={base}
        open={giving}
        onClose={() => setGiving(false)}
        onGiven={() => setAccessVersion((n) => n + 1)}
        who={{ type: "service_account", id, label: account.name }}
      />
    </>
  );
}

function ServiceAccountList({ base }: { base: string }) {
  const tenantId = base.split("/")[2];
  const accounts = useLoad<{ items: ServiceAccount[] }>(`${base}/service-accounts`);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <CollectionView<ServiceAccount>
        title="Service accounts"
        description="Identities for machines: a deploy pipeline, another system. They sign in with an API key."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            Create service account
          </Button>
        }
        needs={{
          base: base,
          permission: "service_account:write",
          what: "this tenant's service accounts",
        }}
        label="Service accounts"
        rows={accounts.data?.items}
        error={accounts.error}
        onRetry={accounts.reload}
        rowKey={(row) => row.id}
        onSelect={(row) => navigate(`/t/${tenantId}/service-accounts/${row.id}`)}
        columns={[
          {
            header: "Name",
            cell: (row) => (
              <span className="flex min-w-0 flex-col">
                <Link
                  to={`/t/${tenantId}/service-accounts/${row.id}`}
                  className="font-medium text-action"
                >
                  {row.name}
                </Link>
                {row.description ? (
                  <span className="text-meta text-ink-muted md:hidden">{row.description}</span>
                ) : null}
              </span>
            ),
          },
          {
            header: "What it is for",
            priority: 2,
            cell: (row) =>
              row.description ? (
                <span className="text-ink-muted">{row.description}</span>
              ) : (
                <span className="text-ink-subtle">Not said</span>
              ),
          },
          {
            header: "Created",
            priority: 3,
            cell: (row) => <Time value={row.createdAt} mode="ago" />,
          },
        ]}
        empty={{
          title: "No service accounts yet",
          text: "Create one for each system that calls this tenant, so each can be given only what it needs.",
        }}
      />
      <CreateDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(made) => {
          setCreating(false);
          accounts.reload();
          navigate(`/t/${tenantId}/service-accounts/${(made as { id: string }).id}?tab=keys`);
        }}
        config={{
          action: "Create service account",
          fields: [
            { name: "name", label: "Name", placeholder: "ci" },
            {
              name: "description",
              label: "What it is for",
              placeholder: "Deploys from CI",
              required: false,
            },
          ],
          submit: ({ name, description }) =>
            api.post(`${base}/service-accounts`, {
              name,
              ...(description ? { description } : {}),
            }),
          done: (_made, values) => `${values.name} is made. Give it a key, then access.`,
        }}
      />
    </>
  );
}

/** What a service account is called and what it is for, changed in place. Its key stays. */
function DescriptionForm({
  base,
  account,
  onSaved,
}: {
  base: string;
  account: ServiceAccount;
  onSaved: () => void;
}) {
  const [text, setText] = useState(account.description);
  const [name, setName] = useState(account.name);
  const [busy, setBusy] = useState(false);
  const renamed = name.trim() !== account.name;
  const changed = renamed || text.trim() !== account.description;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
          if (name.trim() === "") return;
          await api.patch(`${base}/service-accounts/${account.id}`, {
            ...(renamed ? { name: name.trim() } : {}),
            ...(text.trim() !== account.description ? { description: text } : {}),
          });
          notify.success(
            renamed
              ? `${account.name} is now called ${name.trim()}.`
              : `What ${account.name} is for is saved.`,
          );
          onSaved();
        } catch (error) {
          notify.error(error);
        } finally {
          setBusy(false);
        }
      }}
    >
      <KeyValues
        rows={[
          ...(account.key ? [{ label: "Key", value: account.key, mono: true }] : []),
          { label: "Created", value: <Time value={account.createdAt} mode="stamp" /> },
        ]}
      />
      <TextField
        name="name"
        label="Name"
        hint="What people see. Its key, which code and repositories name it by, never changes, and access given to it and its keys are not touched."
        value={name}
        onChange={setName}
      />
      <TextField
        name="description"
        label="What it is for"
        hint="A sentence, so whoever finds its key later knows what breaks if it is revoked."
        value={text}
        required={false}
        onChange={setText}
      />
      <div>
        <Button type="submit" size="small" variant="primary" loading={busy} disabled={!changed}>
          Save
        </Button>
      </div>
    </form>
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
        // On a phone a row keeps who and whether it is active; why, from a tablet up.
        {
          header: "Operator",
          cell: (row) => <Truncate mode="middle">{row.memberEmail}</Truncate>,
        },
        { header: "Reason", priority: 2, cell: (row) => row.reason },
        { header: "Access level", priority: 3, cell: (row) => <Code>{row.roleName}</Code> },
        {
          header: "Opened",
          priority: 3,
          cell: (row) => <Time value={row.createdAt} mode="ago" />,
        },
        {
          header: "Status",
          cell: (row) =>
            row.active ? (
              <StatePill state="active" detail={`until ${when(row.expiresAt)}`} />
            ) : (
              <StatePill state="ended" />
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

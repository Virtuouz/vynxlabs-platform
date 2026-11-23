import { isExplicitKind } from "@volvel/manifest";
import { Notice, TextField } from "@volvel/ui";
import { useState } from "react";
import { type Me, useLoad } from "../api.ts";
import { clock } from "../kit/format.ts";
import { ErrorState, Pending } from "../kit/LoadState.tsx";
import { KeyValues, PageHeader, Panel, SectionLabel } from "../kit/layout.tsx";
import { Mono, StatePill } from "../kit/status.tsx";
import { useTitleObject } from "../kit/title.ts";
import { Link } from "../router.tsx";

type Scope =
  | { type: "tenant" }
  | { type: "workspace"; workspaceId: string; workspaceName: string }
  | {
      type: "resource";
      resourceId: string;
      workspaceId: string;
      workspaceName: string;
      kind: string;
      path: string;
    };

interface Source {
  source: "binding" | "access_grant";
  id: string;
  role: { id: string; name: string; permissions: string[] };
  scope: Scope;
  through: { type: "direct" } | { type: "group"; id: string; name: string } | { type: "anyone" };
  expiresAt: string | null;
  counts: boolean;
}

interface Held {
  permission: string;
  kind: string;
  verb: string;
  label: string;
  meaning: string;
  group: string;
  sources: string[];
}

export interface AccessReport {
  principal: {
    type: string;
    id: string;
    name: string;
    email: string | null;
    suspended: boolean;
    groups: { id: string; name: string }[];
  };
  sources: Source[];
  permissions: Held[];
}

/** Where a source applies, said briefly. */
export function whereOfSource(scope: Scope): string {
  if (scope.type === "tenant") return "whole tenant";
  if (scope.type === "workspace") return `${scope.workspaceName} workspace`;
  return `${scope.kind} ${scope.path} in ${scope.workspaceName}`;
}

/** Where a source is managed: a binding on the access list, an access grant with the others. */
export function sourceLink(tenantId: string, source: Source): string {
  return source.source === "access_grant"
    ? `/t/${tenantId}/operator-access`
    : `/t/${tenantId}/access?binding=${source.id}`;
}

/** One source in a line: the role, where, and how it reaches them. */
function SourceLine({ tenantId, source }: { tenantId: string; source: Source }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-meta">
      <Link to={sourceLink(tenantId, source)} className="text-action">
        <Mono>{source.source === "access_grant" ? "operator access" : source.role.name}</Mono>
      </Link>
      <span className="text-ink-muted">· {whereOfSource(source.scope)}</span>
      {source.through.type === "group" ? (
        <span className="text-ink-muted">
          · through the group{" "}
          <Link to={`/t/${tenantId}/groups?group=${source.through.id}`}>{source.through.name}</Link>
        </span>
      ) : source.through.type === "anyone" ? (
        <span className="text-ink-muted">· given to anyone</span>
      ) : null}
      {source.source === "access_grant" ? (
        <span className="text-ink-muted">
          · {source.role.name}, until {source.expiresAt ? clock(source.expiresAt) : "it is revoked"}
        </span>
      ) : null}
      {!source.counts ? <span className="text-attention">· not while suspended</span> : null}
    </span>
  );
}

const PERMISSION = /^[a-z_*]+:(read|write|\*)$/;

/**
 * Every permission someone holds in the tenant, by area, with where each holds
 * and what gives it. Each source links to where it is managed.
 */
export function EffectiveAccess({
  base,
  tenantId,
  principalType,
  id,
}: {
  base: string;
  tenantId: string;
  principalType: "member" | "service_account";
  id: string;
}) {
  const report = useLoad<AccessReport>(`${base}/access/${principalType}/${id}`);
  const [query, setQuery] = useState("");
  if (report.error) return <ErrorState error={report.error} onRetry={report.reload} />;
  if (!report.data) return <Pending of={report} />;
  const { sources, permissions, principal } = report.data;
  const byId = new Map(sources.map((source) => [source.id, source]));
  const wanted = query.trim().toLowerCase();
  const shown = permissions.filter(
    (one) =>
      !wanted ||
      one.permission.includes(wanted) ||
      one.label.toLowerCase().includes(wanted) ||
      one.meaning.toLowerCase().includes(wanted),
  );
  const groups = [...new Set(shown.map((one) => one.group))];
  const checking = PERMISSION.test(wanted) && !wanted.includes("*");
  const held = checking ? permissions.find((one) => one.permission === wanted) : undefined;
  // Where it is held matters: promoting, for one, is checked in the workspace promoted to.
  const heldWhere = held
    ? [
        ...new Set(
          held.sources
            .map((sourceId) => byId.get(sourceId))
            .filter((source): source is Source => source?.counts === true)
            .map((source) =>
              source.scope.type === "tenant" ? "the whole tenant" : whereOfSource(source.scope),
            ),
        ),
      ]
    : [];
  // Operator access is not the member's own role: said, when it is all that gives the permission.
  const counting = held
    ? held.sources.map((sourceId) => byId.get(sourceId)).filter((source) => source?.counts === true)
    : [];
  const byOperatorAccess =
    counting.length > 0 && counting.every((source) => source?.source === "access_grant");
  // Allowed only when a source that counts gives it: a suspended member's bindings count for nothing.
  const holds = held !== undefined && heldWhere.length > 0;
  const everything = sources.some((source) => source.role.permissions.includes("*:*"));
  return (
    <section className="flex flex-col gap-4" aria-label="Access">
      {principal.suspended ? (
        <Notice tone="attention">
          Suspended: none of their bindings count until they are resumed. They are listed as they
          will be.
        </Notice>
      ) : null}
      <div className="flex flex-col gap-2">
        <SectionLabel>What gives them access</SectionLabel>
        <Panel className="flex flex-col gap-2 p-4">
          {sources.length === 0 ? (
            <p className="m-0 text-ink-muted">Nothing: they hold no permission in this tenant.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {sources.map((source) => (
                <li key={source.id}>
                  <SourceLine tenantId={tenantId} source={source} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <div className="flex flex-col gap-2">
        <SectionLabel>Permissions</SectionLabel>
        <div className="max-w-md">
          <TextField
            name="permission"
            label="Find or check a permission"
            placeholder="promotion:write, or secrets"
            value={query}
            onChange={setQuery}
          />
        </div>
        {checking ? (
          holds ? (
            <p className="m-0 flex items-center gap-2" role="status">
              <StatePill state="allowed" />
              <span className="text-meta text-ink-muted">
                {principal.name} holds <Mono>{wanted}</Mono>{" "}
                {heldWhere.includes("the whole tenant")
                  ? "everywhere in the tenant."
                  : heldWhere.length > 0
                    ? `only in: ${heldWhere.join(", ")}.`
                    : ""}
                {byOperatorAccess
                  ? " It comes only from operator access, which ends when the grant does."
                  : ""}
              </span>
            </p>
          ) : (
            <p className="m-0 flex flex-wrap items-center gap-2" role="status">
              <StatePill state="denied" />
              <span className="text-meta text-ink-muted">
                {held !== undefined ? (
                  <>
                    {principal.name} is given <Mono>{wanted}</Mono>, but none of it counts while
                    they are suspended. It counts again when they are resumed.
                  </>
                ) : everything && isExplicitKind(wanted.split(":")[0] ?? "") ? (
                  <>
                    {principal.name} holds <Mono>*:*</Mono>, which gives every permission except
                    those given by name, and <Mono>{wanted}</Mono> is one of those. A role that
                    lists it, bound to them or a group of theirs, would give it.
                  </>
                ) : (
                  <>
                    {principal.name} does not hold <Mono>{wanted}</Mono> anywhere. A role with it,
                    bound to them or a group of theirs where it is needed, would give it.
                  </>
                )}
              </span>
            </p>
          )
        ) : null}
        {everything && !wanted ? (
          <p className="m-0 text-meta text-ink-muted">
            A role they hold gives every permission except those given by name (<Mono>*:*</Mono>):
            each is listed with it.
          </p>
        ) : null}
        {groups.map((group) => (
          <Panel key={group} className="flex flex-col gap-2 p-4">
            <h3 className="m-0 text-label text-ink-subtle uppercase">{group}</h3>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {shown
                .filter((one) => one.group === group)
                .map((one) => (
                  <li key={one.permission} className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium">
                        {one.label}: {one.verb}
                      </span>
                      <Mono>{one.permission}</Mono>
                    </span>
                    <span className="text-meta text-ink-muted">{one.meaning}</span>
                    <ul className="m-0 flex list-none flex-col gap-0.5 p-0 pl-3">
                      {one.sources.map((sourceId) => {
                        const source = byId.get(sourceId);
                        return source ? (
                          <li key={sourceId}>
                            <SourceLine tenantId={tenantId} source={source} />
                          </li>
                        ) : null;
                      })}
                    </ul>
                  </li>
                ))}
            </ul>
          </Panel>
        ))}
        {shown.length === 0 && !checking ? (
          <p className="m-0 text-ink-muted">No permission matches.</p>
        ) : null}
      </div>
    </section>
  );
}

/** A member of the tenant, with everything they may do in it and why. */
export function MemberPage({ base, tenantId, id }: { base: string; tenantId: string; id: string }) {
  const report = useLoad<AccessReport>(`${base}/access/member/${id}`);
  const me = useLoad<Me>("/me");
  const principal = report.data?.principal;
  // Anyone may read this page about themselves; the list of members is for those who may read it.
  const self = me.data?.principal.id === id;
  useTitleObject(self ? "What I may do here" : principal?.name);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={self ? "You" : "Member"}
        title={self ? "What I may do here" : (principal?.name ?? "Member")}
        description={
          self
            ? "Everything you may do in this tenant, where, and what gives it."
            : "Everything they may do in this tenant, where, and what gives it."
        }
        {...(self
          ? {}
          : {
              meta: (
                <Link to={`/t/${tenantId}/members`} className="text-meta">
                  All members
                </Link>
              ),
            })}
      />
      {principal ? (
        <Panel className="p-4">
          <KeyValues
            rows={[
              { label: "Email", value: principal.email ?? "" },
              { label: "Status", value: principal.suspended ? "Suspended" : "Active" },
              {
                label: "Groups",
                value:
                  principal.groups.length === 0
                    ? "None"
                    : principal.groups.map((group) => group.name).join(", "),
              },
            ]}
          />
        </Panel>
      ) : null}
      <EffectiveAccess base={base} tenantId={tenantId} principalType="member" id={id} />
    </div>
  );
}

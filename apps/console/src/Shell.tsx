import { Menu } from "@vynxlabs/ui";
import type { ComponentChildren } from "preact";
import { isOperator, type Me, useLoad } from "./api.ts";
import { Link, navigate } from "./router.tsx";

function NavLink({
  to,
  path,
  children,
}: {
  to: string;
  path: string;
  children: ComponentChildren;
}) {
  const current = path === to || path.startsWith(`${to}/`);
  return (
    <Link
      to={to}
      current={current}
      class={`block rounded-control px-2 py-1.5 no-underline ${
        current ? "bg-action-soft font-medium text-action" : "text-ink hover:bg-sunken"
      }`}
    >
      {children}
    </Link>
  );
}

function Group({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="flex flex-col gap-0.5">
      <p class="m-0 px-2 pb-1 text-[13px] text-ink-muted">{label}</p>
      {children}
    </div>
  );
}

export const TENANT_SECTIONS = [
  ["workspaces", "Workspaces"],
  ["approvals", "Approvals"],
  ["members", "Members"],
  ["groups", "Groups"],
  ["service-accounts", "Service accounts"],
  ["workers", "Workers"],
  ["roles", "Roles"],
  ["access", "Access"],
  ["operator-access", "Operator access"],
  ["audit", "Audit log"],
  ["export", "Export"],
] as const;

export function Shell({
  me,
  path,
  tenantId,
  onSignOut,
  children,
}: {
  me: Me;
  path: string;
  tenantId: string | undefined;
  onSignOut: () => void;
  children: ComponentChildren;
}) {
  const known = me.tenants.find((candidate) => candidate.id === tenantId);
  // An operator is not a member of most tenants, so the name comes from the tenant record.
  const fetched = useLoad<{ name: string }>(tenantId && !known ? `/tenants/${tenantId}` : null);
  const tenant = known ?? fetched.data;
  return (
    <div class="grid min-h-screen grid-cols-1 md:grid-cols-[15rem_1fr]">
      <nav
        aria-label="Main"
        class="flex flex-col gap-5 border-line border-b bg-surface p-3 md:border-r md:border-b-0"
      >
        <Link to="/" class="px-2 pt-1 font-semibold text-ink no-underline">
          Console
        </Link>
        <Group label="Tenants">
          <NavLink to="/" path={path === "/" ? "/" : ""}>
            All tenants
          </NavLink>
        </Group>
        {tenantId ? (
          <Group label={tenant?.name ?? "This tenant"}>
            {TENANT_SECTIONS.map(([slug, label]) => (
              <NavLink key={slug} to={`/t/${tenantId}/${slug}`} path={path}>
                {label}
              </NavLink>
            ))}
          </Group>
        ) : null}
        {isOperator(me) ? (
          <Group label="Instance">
            <NavLink to="/instance/members" path={path}>
              All members
            </NavLink>
            <NavLink to="/instance/operators" path={path}>
              Operators
            </NavLink>
            <NavLink to="/instance/databases" path={path}>
              Database locations
            </NavLink>
            <NavLink to="/instance/import" path={path}>
              Import a tenant
            </NavLink>
            <NavLink to="/instance/audit" path={path}>
              Instance audit log
            </NavLink>
          </Group>
        ) : null}
        <div class="mt-auto border-line border-t pt-3">
          <Menu
            label={<span class="truncate">{me.principal.email ?? me.principal.name}</span>}
            items={[
              { label: "API keys", onSelect: () => navigate("/account/api-keys") },
              { label: "Sign out", onSelect: onSignOut },
            ]}
          />
        </div>
      </nav>
      <main class="min-w-0 px-4 py-6 md:px-8">
        <div class="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}

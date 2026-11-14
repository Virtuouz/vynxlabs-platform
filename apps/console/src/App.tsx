import { Notice } from "@vynxlabs/ui";
import { lazy, Suspense, useEffect } from "react";
import { api, type Me, useLoad } from "./api.ts";
import { match, navigate, usePath } from "./router.tsx";
import { Shell } from "./Shell.tsx";
import { Account } from "./screens/Account.tsx";
import { DatabaseLocations, TenantImport } from "./screens/Environments.tsx";
import { InstanceAudit, InstanceMembers, Operators } from "./screens/Instance.tsx";
import { InstanceBranding } from "./screens/InstanceBranding.tsx";
import { KitSheet } from "./screens/KitSheet.tsx";
import { SignIn } from "./screens/SignIn.tsx";
import { Tenant } from "./screens/Tenant.tsx";

const SingleSignOn = lazy(() =>
  import("./screens/SingleSignOn.tsx").then((m) => ({ default: m.SingleSignOn })),
);

import { Tenants } from "./screens/Tenants.tsx";

const RETURN_TO = ["/apps/", "/portal/", "/api/v1/app-handoffs/start"];

/**
 * Where to go once signed in, when an app sent the person here with `?return=`.
 * Only a path of an app, the portal or the hand-off to an app is followed, so that
 * a link to the console cannot send a signed-in member to another site.
 */
export function returnTarget(search: string): string | null {
  const value = new URLSearchParams(search).get("return");
  if (!value || value.startsWith("//")) return null;
  return RETURN_TO.some((prefix) => value.startsWith(prefix)) ? value : null;
}

export function App() {
  const me = useLoad<Me>("/me");
  const path = usePath();
  const tenant = match("/t/:tenantId/*", path);
  const target = me.data ? returnTarget(location.search) : null;
  useEffect(() => {
    if (target) window.location.assign(target);
  }, [target]);

  if (me.loading && !me.data && !me.error) return null;
  if (me.error?.status === 401 || !me.data) {
    if (me.error && me.error.status !== 401) {
      return (
        <main className="mx-auto mt-24 max-w-md px-4">
          <Notice tone="danger">The instance could not be reached. {me.error.message}</Notice>
        </main>
      );
    }
    return <SignIn onSignedIn={me.reload} />;
  }
  // The browser is on its way back to the app that asked for the sign-in.
  if (target) return null;

  const signOut = async () => {
    await api.post("/auth/sign-out");
    navigate("/", { replace: true });
    me.reload();
  };

  let screen = <Tenants me={me.data} />;
  if (tenant?.tenantId)
    screen = <Tenant key={tenant.tenantId} tenantId={tenant.tenantId} me={me.data} path={path} />;
  else if (path === "/account/api-keys") screen = <Account />;
  else if (path === "/instance/members") screen = <InstanceMembers />;
  else if (path === "/instance/operators") screen = <Operators />;
  else if (path === "/instance/single-sign-on") screen = <SingleSignOn base="/instance" />;
  else if (path === "/instance/audit") screen = <InstanceAudit />;
  else if (path === "/instance/databases") screen = <DatabaseLocations />;
  else if (path === "/instance/import") screen = <TenantImport />;
  else if (path === "/instance/branding") screen = <InstanceBranding />;
  else if (path === "/instance/kit") screen = <KitSheet />;

  return (
    <Shell me={me.data} path={path} tenantId={tenant?.tenantId} onSignOut={signOut}>
      {/* Some screens are fetched when first opened. */}
      <Suspense fallback={<p className="text-ink-muted">Loading…</p>}>{screen}</Suspense>
    </Shell>
  );
}

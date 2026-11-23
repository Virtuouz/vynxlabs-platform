import { Closing, Notice } from "@volvel/ui";
import { lazy, Suspense, useEffect, useRef } from "react";
import { api, isOperator, type Me, useLoad } from "./api.ts";
import { notify } from "./ask.tsx";
import { clearSession } from "./clearSession.ts";
import { loadPreferences } from "./prefs.ts";
import { confirmLeave, match, navigate, usePath } from "./router.tsx";
import { SessionSheet } from "./SessionSheet.tsx";
import { Shell } from "./Shell.tsx";
import { Account } from "./screens/Account.tsx";
import { ApproveLink } from "./screens/ApproveLink.tsx";
import { DatabaseLocations, TenantImport } from "./screens/Environments.tsx";
import { InstanceAudit, InstanceMembers, Operators } from "./screens/Instance.tsx";
import { InstanceBranding } from "./screens/InstanceBranding.tsx";
import { InstanceHealth } from "./screens/InstanceHealth.tsx";
import { InstanceTriggers } from "./screens/InstanceTriggers.tsx";
import { KitSheet } from "./screens/KitSheet.tsx";
import { ForOperators, NotFound } from "./screens/NotFound.tsx";
import { SignIn } from "./screens/SignIn.tsx";
import { Tenant } from "./screens/Tenant.tsx";
import { beginSession, endSession, useSessionEnded } from "./session.ts";

const SingleSignOn = lazy(() =>
  import("./screens/SingleSignOn.tsx").then((m) => ({ default: m.SingleSignOn })),
);

import { Loading } from "./kit/LoadState.tsx";
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

/**
 * Tells the server which tenant and workspace the member is in, so "where you
 * were" follows them to another device. Sent once the place has settled, and
 * only when it changes; a failure changes nothing here.
 */
export function useRememberPlace(signedIn: boolean, path: string) {
  const sent = useRef<string | undefined>(undefined);
  // The next person to sign in is told where they are, even if it is the same place.
  if (!signedIn) sent.current = undefined;
  const inWorkspace = match("/t/:t/workspaces/:w/*", path);
  const tenantId = match("/t/:t/*", path)?.t;
  const workspaceId = inWorkspace?.w;
  useEffect(() => {
    if (!signedIn || !tenantId) return;
    const key = `${tenantId} ${workspaceId ?? ""}`;
    if (sent.current === key) return;
    const timer = setTimeout(() => {
      sent.current = key;
      api.put("/me/recent", { tenantId, workspaceId: workspaceId ?? null }).catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [signedIn, tenantId, workspaceId]);
}

/**
 * What an OAuth provider's answer says, when the browser comes back to a page that is not the
 * Connections list (which reads it itself): a connection that was removed on the way, a member
 * who was signed out, a provider's refusal. Said once, then taken out of the address.
 */
export function useOAuthReturn(signedIn: boolean, path: string) {
  useEffect(() => {
    if (!signedIn || path.endsWith("/connections")) return;
    const query = new URLSearchParams(location.search);
    const error = query.get("oauth_error");
    const connected = query.get("oauth") === "connected" ? query.get("connection") : null;
    if (error === null && connected === null) return;
    if (error !== null) notify.error(new Error(error));
    else notify.success(`${connected} is connected.`);
    for (const name of ["oauth", "oauth_error", "connection"]) query.delete(name);
    const rest = query.toString();
    navigate(`${location.pathname}${rest ? `?${rest}` : ""}`, { replace: true });
  }, [signedIn, path]);
}

/**
 * Opening the console at its root goes back to where the member was last: the
 * workspace, or the tenant, kept by `useRememberPlace`. Only on opening, so the
 * tenant list stays one click away afterward.
 */
export function useReopenLastPlace(signedIn: boolean) {
  const opening = useRef(location.pathname === "/" && returnTarget(location.search) === null);
  useEffect(() => {
    if (!signedIn || !opening.current) return;
    opening.current = false;
    let live = true;
    api
      .get<{ items: { tenantId: string; workspaceId: string | null }[] }>("/me/recent")
      .then(({ items }) => {
        const last = items[0];
        // The member may have gone somewhere else while this was asked.
        if (!live || !last || location.pathname !== "/") return;
        navigate(
          last.workspaceId
            ? `/t/${last.tenantId}/workspaces/${last.workspaceId}/overview`
            : `/t/${last.tenantId}`,
          { replace: true },
        );
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [signedIn]);
}

export function App() {
  const me = useLoad<Me>("/me");
  const path = usePath();
  const signedIn = me.data !== undefined && !me.error;
  useRememberPlace(signedIn, path);
  useOAuthReturn(signedIn, path);
  useReopenLastPlace(signedIn);
  // A member's settings follow them from browser to browser.
  useEffect(() => {
    if (signedIn && me.data?.principal.type === "member") void loadPreferences();
  }, [signedIn, me.data?.principal.type]);
  const ended = useSessionEnded();
  const holder = me.data?.principal.id;
  // From here on a 401 means the session ended, not that nobody signed in.
  const stale = me.error !== undefined;
  useEffect(() => {
    if (holder && !stale) beginSession(holder);
  }, [holder, stale]);
  const tenant = match("/t/:tenantId/*", path);
  const target = me.data ? returnTarget(location.search) : null;
  useEffect(() => {
    if (target) window.location.assign(target);
  }, [target]);

  // An approval mail's link needs no sign-in: the link is the approver's own.
  const approving = match("/approve/:token", path);
  if (approving?.token) return <ApproveLink token={approving.token} />;
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
    // Unsaved changes are asked about first: once the session is gone they cannot be kept.
    if (!(await confirmLeave())) return;
    try {
      await api.post("/auth/sign-out");
    } catch {
      notify.error(new Error("You could not be signed out. Check your connection and try again."));
      return;
    }
    endSession();
    clearSession();
    navigate("/", { replace: true });
    me.reload();
  };

  let screen = <NotFound home="/" homeLabel="Go to your tenants" />;
  if (path === "/") screen = <Tenants me={me.data} />;
  else if (tenant?.tenantId)
    screen = <Tenant key={tenant.tenantId} tenantId={tenant.tenantId} me={me.data} path={path} />;
  else if (path === "/account/api-keys") screen = <Account />;
  // The whole Instance area is for operators: the server refuses the rest, and says so only after
  // a header and a create button were drawn over it.
  else if (path.startsWith("/instance/") && !isOperator(me.data))
    screen = <ForOperators home="/" homeLabel="Go to your tenants" />;
  else if (path === "/instance/members") screen = <InstanceMembers />;
  else if (path === "/instance/operators") screen = <Operators />;
  else if (path === "/instance/single-sign-on") screen = <SingleSignOn base="/instance" />;
  else if (path === "/instance/audit") screen = <InstanceAudit />;
  else if (path === "/instance/databases") screen = <DatabaseLocations />;
  else if (path === "/instance/import") screen = <TenantImport />;
  else if (path === "/instance/branding") screen = <InstanceBranding />;
  else if (path === "/instance/triggers") screen = <InstanceTriggers />;
  else if (path === "/instance/health") screen = <InstanceHealth />;
  else if (path === "/instance/kit") screen = <KitSheet />;

  return (
    <Shell me={me.data} path={path} tenantId={tenant?.tenantId} onSignOut={signOut}>
      {/* Some screens are fetched when first opened. */}
      <Suspense fallback={<Loading />}>{screen}</Suspense>
      <Closing subject={ended && me.data.principal.email}>
        {(email, open) => <SessionSheet email={email} open={open} />}
      </Closing>
    </Shell>
  );
}

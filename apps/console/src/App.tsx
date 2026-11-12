import { Notice } from "@vynxlabs/ui";
import { api, type Me, useLoad } from "./api.ts";
import { match, navigate, usePath } from "./router.tsx";
import { Shell } from "./Shell.tsx";
import { Account } from "./screens/Account.tsx";
import { InstanceAudit, InstanceMembers, Operators } from "./screens/Instance.tsx";
import { SignIn } from "./screens/SignIn.tsx";
import { Tenant } from "./screens/Tenant.tsx";
import { Tenants } from "./screens/Tenants.tsx";

export function App() {
  const me = useLoad<Me>("/me");
  const path = usePath();

  if (me.loading && !me.data && !me.error) return null;
  if (me.error?.status === 401 || !me.data) {
    if (me.error && me.error.status !== 401) {
      return (
        <main class="mx-auto mt-24 max-w-md px-4">
          <Notice tone="danger">The instance could not be reached. {me.error.message}</Notice>
        </main>
      );
    }
    return <SignIn onSignedIn={me.reload} />;
  }

  const signOut = async () => {
    await api.post("/auth/sign-out");
    navigate("/", { replace: true });
    me.reload();
  };

  const tenant = match("/t/:tenantId/*", path);
  let screen = <Tenants me={me.data} />;
  if (tenant?.tenantId)
    screen = <Tenant key={tenant.tenantId} tenantId={tenant.tenantId} me={me.data} path={path} />;
  else if (path === "/account/api-keys") screen = <Account />;
  else if (path === "/instance/members") screen = <InstanceMembers />;
  else if (path === "/instance/operators") screen = <Operators />;
  else if (path === "/instance/audit") screen = <InstanceAudit />;

  return (
    <Shell me={me.data} path={path} tenantId={tenant?.tenantId} onSignOut={signOut}>
      {screen}
    </Shell>
  );
}

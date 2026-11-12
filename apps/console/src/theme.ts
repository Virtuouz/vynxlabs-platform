import { useEffect } from "preact/hooks";

const href = (tenantId: string) => `/api/v1/tenants/${tenantId}/theme.css`;
const find = (tenantId: string) =>
  [...document.head.querySelectorAll<HTMLLinkElement>("link[data-tenant-theme]")].find(
    (link) => link.dataset.tenantTheme === tenantId,
  );

/**
 * Shows the console in a tenant's colours while one of its screens is open. The
 * tenant's stylesheet is loaded after the kit's own, so its values replace the
 * kit's, and it is taken away again on leaving the tenant.
 */
export function useTenantTheme(tenantId: string | undefined) {
  useEffect(() => {
    if (!tenantId) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href(tenantId);
    link.dataset.tenantTheme = tenantId;
    document.head.append(link);
    return () => link.remove();
  }, [tenantId]);
}

/** Loads the tenant's stylesheet again after its theme was saved. The browser may keep the old one for a minute otherwise. */
export function refreshTenantTheme(tenantId: string) {
  const link = find(tenantId);
  if (link) link.href = `${href(tenantId)}?saved=${Date.now()}`;
}

import type { Kernel } from "../kernel.js";
import type { Place } from "./hosts.js";

/** Appends each path segment, escaped, to a base that ends without a slash. */
const join = (base: string, ...segments: string[]) =>
  `${base}/${segments.map((segment) => segment.split("/").map(encodeURIComponent).join("/")).join("/")}`;

/**
 * Where a tenant's sign-in pages are, as a path at the place a request came to.
 * At a registered hostname the tenant is known from the name, so they are short.
 */
export function portalPath(place: Place, tenantSlug: string): string {
  return place.kind === "domain" ? "/_" : `/portal/${tenantSlug}`;
}

/** The path an app is served under at the place a request came to, ending in a slash. */
export function appBasePath(
  place: Place,
  app: { tenantSlug: string; workspaceSlug: string; path: string },
): string {
  if (place.kind === "domain") {
    // A hostname for the portal serves every app of its workspace by path beneath it.
    return place.domain.appPath === "" ? `${join("", app.path)}/` : "/";
  }
  return `${join("/apps", app.tenantSlug, app.workspaceSlug, app.path)}/`;
}

/** The full address of a tenant's sign-in pages, for a link that is sent to someone. */
export function portalUrl(kernel: Kernel, tenantSlug: string, hostname?: string): string {
  if (hostname) return `${new URL(kernel.hosts.mainOrigin).protocol}//${hostname}/_`;
  return `${kernel.hosts.appsOrigin}/portal/${tenantSlug}`;
}

/** The full address of an app by path, where apps are served. */
export function appUrl(
  kernel: Kernel,
  app: { tenantSlug: string; workspaceSlug: string; path: string },
): string {
  return `${join(`${kernel.hosts.appsOrigin}/apps`, app.tenantSlug, app.workspaceSlug, app.path)}/`;
}

/**
 * The address of an app at a hostname registered for it. With `appPath`, the
 * hostname serves the portal and the app is found by its path beneath it.
 */
export function domainUrl(kernel: Kernel, hostname: string, appPath?: string): string {
  const root = `${new URL(kernel.hosts.mainOrigin).protocol}//${hostname}`;
  return appPath ? `${join(root, appPath)}/` : `${root}/`;
}

import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { codeAppPolicy } from "@volvel/manifest";
import { loadVite, viteSettings } from "./apps.js";
import { appSources } from "./build.js";
import { siteApps, startSiteServer } from "./dev-site.js";
import { BuildError } from "./errors.js";

export interface DevOptions {
  /** The tenant repository. */
  directory: string;
  /** Where the code is, when a flag says so; else `volvel.yaml`, else `src/index.ts`. */
  entry?: string;
  resources?: string;
  /** The app's path, whatever its kind. May be left out when the repository has one app. */
  app: string | undefined;
  port: number;
  /**
   * Serve the page under the policy the platform serves an app with, so that what it would
   * refuse once deployed is refused here. On unless said otherwise.
   */
  strict?: boolean;
  instance: { url: string; token: string };
  tenant: { id: string; slug: string; name: string };
  workspace: { id: string; slug: string };
  principal: { type: string; id?: string | null; name: string | null; email: string | null };
  /** Where the files that draw an interface are; `SCREENS_DIR`, else beside this build. For tests. */
  screens?: string;
}

interface ProxyRequest {
  setHeader(name: string, value: string): void;
}

/**
 * The instance knows whether the tenant has a logo; an app asks so as to show none that is
 * not there. Left unsaid when the instance cannot be reached, as an older platform leaves it.
 */
async function tenantHasLogo(instance: string, tenantId: string): Promise<boolean | undefined> {
  return fetch(`${instance}/api/v1/tenants/${tenantId}/portal/logo`, { method: "HEAD" })
    .then((response) =>
      response.status === 200 ? true : response.status === 404 ? false : undefined,
    )
    .catch(() => undefined);
}

/**
 * Where the development server's reload socket may be connected to. A policy has no way to
 * write an IPv6 address as a host, so a page opened at `[::1]` is served by `'self'`, which the
 * browser matches to the socket of the same host and port.
 */
const DEV_SOCKETS = ["ws://localhost:*", "ws://127.0.0.1:*"];

/**
 * Gives the nonce to the scripts the development tooling put in the page and to no other: an
 * inline script the app's own `index.html` carries is refused, as the instance refuses it.
 * `own` is what the app's file said before the tooling worked on it.
 */
export function nonceToolingScripts(html: string, own: string, nonce: string): string {
  const inline = /<script\b(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
  const mine = new Set([...own.matchAll(inline)].map((one) => one[2]));
  return html.replace(inline, (whole, attributes: string, body: string) =>
    mine.has(body) || /\bnonce=|type=["']application\/json["']/.test(attributes)
      ? whole
      : whole.replace(/^<script\b/i, `<script nonce="${nonce}"`),
  );
}

const forHtml = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

/**
 * Serves one app from its source with Vite, reloading as it changes. The page
 * gets the same context the platform gives it when deployed. Its API calls go
 * to the chosen instance with the developer's own key, so the app shows that
 * workspace's data as the developer may see it.
 */
export async function startDevServer(options: DevOptions) {
  const directory = resolve(options.directory);
  const apps = await appSources({
    directory,
    ...(options.entry ? { entry: options.entry } : {}),
    ...(options.resources ? { resources: options.resources } : {}),
  });
  const sites = await siteApps({
    directory,
    ...(options.entry ? { entry: options.entry } : {}),
    ...(options.resources ? { resources: options.resources } : {}),
  });
  const all = [
    ...apps.map((candidate) => ({ path: candidate.path, kind: "files" as const })),
    ...sites.map((candidate) => ({ path: candidate.path, kind: candidate.kind })),
  ].sort((one, other) => (one.path < other.path ? -1 : 1));
  if (all.length === 0) throw new BuildError(["This repository defines no app."]);
  const names = all.map((candidate) => `${candidate.path} (${candidate.kind})`).join(", ");
  const chosen = options.app ? all.find((candidate) => candidate.path === options.app) : all[0];
  if (options.app && !chosen) {
    throw new BuildError([
      `This repository has no app at "${options.app}". Its apps: ${names}.`,
      "volvel dev draws an app made of files, an interface and a docs site.",
    ]);
  }
  if (!chosen || (!options.app && all.length > 1)) {
    throw new BuildError([`Say which app: ${names}.`]);
  }
  const instance = options.instance.url.replace(/\/+$/, "");
  const logo = await tenantHasLogo(instance, options.tenant.id);
  const site = sites.find((candidate) => candidate.path === chosen.path);
  if (site) {
    return startSiteServer({
      directory,
      ...(options.entry ? { entry: options.entry } : {}),
      ...(options.resources ? { resources: options.resources } : {}),
      app: site,
      port: options.port,
      ...(options.strict === undefined ? {} : { strict: options.strict }),
      ...(options.screens ? { screens: options.screens } : {}),
      instance: options.instance,
      tenant: options.tenant,
      workspace: options.workspace,
      principal: options.principal,
      logo,
    });
  }
  const app = apps.find((candidate) => candidate.path === chosen.path) as (typeof apps)[number];
  const { vite, plugins } = await loadVite(directory);
  const context = {
    api: "/api/v1",
    tenant: { ...options.tenant, ...(logo === undefined ? {} : { logo }) },
    workspace: options.workspace,
    app: { path: app.path, title: app.title },
    base: "/",
    // The sign-in pages are the instance's, reached through this server, so that a person
    // who signs in comes back here and not to the instance.
    portal: `/portal/${options.tenant.slug}`,
    principal: { id: null, ...options.principal },
    // Sandboxed as when deployed (decision 0008): the page sends no cookie. This server adds the
    // developer's key to what it sends on to the instance, so the page needs no token of its own.
    token: null,
  };
  const theme = `/api/v1/tenants/${options.tenant.id}/workspaces/${options.workspace.id}/theme.css`;
  // The development server's own inline scripts carry a nonce made for this run, and its
  // reload socket is the one thing besides the page's own origin that may be connected to.
  const nonce = randomBytes(16).toString("base64");
  const policy =
    options.strict === false ? undefined : codeAppPolicy({ nonce, connect: DEV_SOCKETS });
  const own = new Map<string, string>();
  const settings = viteSettings(resolve(directory, app.source), plugins);
  const server = await vite.createServer({
    ...settings,
    base: "/",
    logLevel: "warn",
    clearScreen: false,
    plugins: [
      ...("plugins" in settings ? (settings.plugins as unknown[]) : []),
      ...(policy
        ? [
            {
              name: "volvel-app-policy",
              // Before the tooling: what the app's own file says.
              transformIndexHtml: {
                order: "pre" as const,
                handler: (html: string, context: { path: string }) => {
                  own.set(context.path, html);
                },
              },
            },
            {
              name: "volvel-app-nonce",
              transformIndexHtml: {
                order: "post" as const,
                handler: (html: string, context: { path: string }) =>
                  nonceToolingScripts(html, own.get(context.path) ?? "", nonce),
              },
            },
          ]
        : []),
      {
        name: "volvel-app-context",
        transformIndexHtml: () => [
          {
            tag: "script",
            attrs: { type: "application/json", id: "vx-context" },
            children: forHtml(context),
            injectTo: "head-prepend",
          },
          { tag: "link", attrs: { rel: "stylesheet", href: theme }, injectTo: "head" },
        ],
      },
    ],
    server: {
      port: options.port,
      strictPort: false,
      ...(policy ? { headers: { "content-security-policy": policy } } : {}),
      // A sandboxed page asks for its modules as a page with no origin (`Origin: null`) would.
      cors: true,
      proxy: {
        "/portal": {
          target: instance,
          changeOrigin: true,
          // A form sent from this server is checked against the instance's own address.
          configure: (proxy: {
            on: (event: string, handler: (req: ProxyRequest) => void) => void;
          }) => proxy.on("proxyReq", (req) => req.setHeader("origin", instance)),
        },
        "/api": {
          target: instance,
          changeOrigin: true,
          headers: { authorization: `Bearer ${options.instance.token}` },
        },
      },
    },
  });
  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  return {
    app,
    url: `http://localhost:${port}/`,
    close: () => server.close() as Promise<void>,
  };
}

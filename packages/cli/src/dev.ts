import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { appPolicy } from "@volvel/manifest";
import { loadVite, viteSettings } from "./apps.js";
import { appSources } from "./build.js";
import { BuildError } from "./errors.js";

export interface DevOptions {
  /** The tenant repository. */
  directory: string;
  /** Where the code is, when a flag says so; else `volvel.yaml`, else `src/index.ts`. */
  entry?: string;
  resources?: string;
  /** The app's path. May be left out when the repository has one app. */
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
}

interface ProxyRequest {
  setHeader(name: string, value: string): void;
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
  if (apps.length === 0) throw new BuildError(["This repository defines no app."]);
  const app = options.app ? apps.find((candidate) => candidate.path === options.app) : apps[0];
  if (!app || (!options.app && apps.length > 1)) {
    throw new BuildError([`Say which app: ${apps.map((candidate) => candidate.path).join(", ")}.`]);
  }
  const { vite, plugins } = await loadVite(directory);
  const instance = options.instance.url.replace(/\/+$/, "");
  // The instance knows whether the tenant has a logo; an app asks so as to show none that is
  // not there. Left unsaid when the instance cannot be reached, as an older platform leaves it.
  const logo = await fetch(`${instance}/api/v1/tenants/${options.tenant.id}/portal/logo`, {
    method: "HEAD",
  })
    .then((response) =>
      response.status === 200 ? true : response.status === 404 ? false : undefined,
    )
    .catch(() => undefined);
  const context = {
    api: "/api/v1",
    tenant: { ...options.tenant, ...(logo === undefined ? {} : { logo }) },
    workspace: options.workspace,
    app: { path: app.path, title: app.path },
    base: "/",
    // The sign-in pages are the instance's, reached through this server, so that a person
    // who signs in comes back here and not to the instance.
    portal: `/portal/${options.tenant.slug}`,
    principal: { id: null, ...options.principal },
  };
  const theme = `/api/v1/tenants/${options.tenant.id}/workspaces/${options.workspace.id}/theme.css`;
  // The development server's own inline scripts carry a nonce made for this run, and its
  // reload socket is the one thing besides the page's own origin that may be connected to.
  const nonce = randomBytes(16).toString("base64");
  const policy =
    options.strict === false
      ? undefined
      : appPolicy({ nonce, connect: ["ws://localhost:*", "ws://127.0.0.1:*", "ws://[::1]:*"] });
  const settings = viteSettings(resolve(directory, app.source), plugins);
  const server = await vite.createServer({
    ...settings,
    base: "/",
    logLevel: "warn",
    clearScreen: false,
    ...(policy ? { html: { cspNonce: nonce } } : {}),
    plugins: [
      ...("plugins" in settings ? (settings.plugins as unknown[]) : []),
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

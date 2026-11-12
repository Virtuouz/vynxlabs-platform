import { resolve } from "node:path";
import { loadVite, viteSettings } from "./apps.js";
import { appSources } from "./build.js";
import { BuildError } from "./errors.js";

export interface DevOptions {
  /** The tenant repository. */
  directory: string;
  /** The app's path. May be left out when the repository has one app. */
  app: string | undefined;
  port: number;
  instance: { url: string; token: string };
  tenant: { id: string; slug: string; name: string };
  workspace: { id: string; slug: string };
  principal: { type: string; id?: string | null; name: string | null; email: string | null };
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
  const apps = await appSources({ directory });
  if (apps.length === 0) throw new BuildError(["This repository defines no app."]);
  const app = options.app ? apps.find((candidate) => candidate.path === options.app) : apps[0];
  if (!app || (!options.app && apps.length > 1)) {
    throw new BuildError([`Say which app: ${apps.map((candidate) => candidate.path).join(", ")}.`]);
  }
  const { vite, plugins } = await loadVite(directory);
  const instance = options.instance.url.replace(/\/+$/, "");
  const context = {
    api: "/api/v1",
    tenant: options.tenant,
    workspace: options.workspace,
    app: { path: app.path, title: app.path },
    base: "/",
    portal: `${instance}/portal/${options.tenant.slug}`,
    principal: { id: null, ...options.principal },
  };
  const theme = `/api/v1/tenants/${options.tenant.id}/workspaces/${options.workspace.id}/theme.css`;
  const settings = viteSettings(resolve(directory, app.source), plugins);
  const server = await vite.createServer({
    ...settings,
    base: "/",
    logLevel: "warn",
    clearScreen: false,
    plugins: [
      ...("plugins" in settings ? (settings.plugins as unknown[]) : []),
      {
        name: "vynxlabs-app-context",
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
      proxy: {
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

import { cpSync, createReadStream, existsSync, statSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** The product's documentation, built by `pnpm --filter @volvel/docs build`. */
const HELP = join(dirname(fileURLToPath(import.meta.url)), "../../packages/docs/dist");

const TYPES: Record<string, string> = {
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

/**
 * Ships the documentation with the console, under `/help`: the same files in
 * development and in the build, so help is the help of this version and needs
 * no network beyond the instance.
 */
function help(): Plugin {
  return {
    name: "volvel-help",
    configureServer(server) {
      server.middlewares.use("/help", (request, response, next) => {
        const file = normalize(
          join(HELP, decodeURIComponent((request.url ?? "").split("?")[0] ?? "")),
        );
        if (!file.startsWith(HELP) || !existsSync(file) || !statSync(file).isFile()) return next();
        response.setHeader("content-type", TYPES[extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(response);
      });
    },
    closeBundle() {
      if (!existsSync(HELP)) {
        throw new Error(
          "The documentation is not built. Run `pnpm --filter @volvel/docs build` before the console's build.",
        );
      }
      cpSync(HELP, join(this.environment.config.build.outDir, "help"), { recursive: true });
    },
  };
}

/**
 * On an address that opens an app's builder, its script and what it needs are asked for with the
 * page, beside the console's own, not after the console has drawn and found it needs them. On a
 * slow line that is the difference between one wait and two. Every other address loads as it did.
 */
function builderPreload(): Plugin {
  return {
    name: "volvel-builder-preload",
    transformIndexHtml: {
      order: "post",
      handler(html, context) {
        const bundle = context.bundle;
        if (!bundle) return html;
        const chunks = Object.values(bundle).filter((one) => one.type === "chunk");
        const byFile = new Map(chunks.map((one) => [one.fileName, one]));
        const builder = chunks.find((one) =>
          one.facadeModuleId?.endsWith("screens/builder/AppBuilder.tsx"),
        );
        if (!builder) return html;
        const closure = (start: string) => {
          const seen = new Set<string>();
          const walk = (file: string) => {
            if (seen.has(file)) return;
            seen.add(file);
            for (const next of byFile.get(file)?.imports ?? []) walk(next);
          };
          walk(start);
          return seen;
        };
        const entry = chunks.find((one) => one.isEntry);
        const have = entry ? closure(entry.fileName) : new Set<string>();
        const files = [...closure(builder.fileName)].filter((file) => !have.has(file));
        const script = `<script>if(/^\\/t\\/[^/]+\\/workspaces\\/[^/]+\\/screens\\/[^/?#]+/.test(location.pathname)){${JSON.stringify(files)}.forEach(function(f){var l=document.createElement("link");l.rel="modulepreload";l.href="/"+f;document.head.appendChild(l)})}</script>`;
        return html.replace("</head>", `${script}</head>`);
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), help(), builderPreload()],
  server: {
    // In development the console runs on its own port and talks to a local control plane.
    proxy: {
      "/api": "http://localhost:8080",
      // The product's documentation, and the stylesheet and script its pages load.
      "/docs": "http://localhost:8080",
      "/_platform": "http://localhost:8080",
    },
  },
});

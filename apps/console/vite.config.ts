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

export default defineConfig({
  plugins: [react(), tailwindcss(), help()],
  server: {
    // In development the console runs on its own port and talks to a local control plane.
    proxy: { "/api": "http://localhost:8080" },
  },
});

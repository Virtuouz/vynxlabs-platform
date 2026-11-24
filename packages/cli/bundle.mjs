// Makes the CLI one file, for publishing: everything of the platform's own
// that it is built from, and what those need, is inside it. So `@volvel/cli`
// installs without the packages that are not published, and the command it
// installs is `volvel`.
//
// Left outside: esbuild, which is a program for the machine it is installed
// on, and Vite, which the CLI loads from the tenant's own repository.
import { chmodSync, cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "dist/volvel.mjs");

await build({
  entryPoints: [join(here, "dist/bin.js")],
  outfile: out,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["esbuild", "vite", "lightningcss", "fsevents"],
  // Some of what is bundled was written to be `require`d, and asks for Node's own modules that way.
  banner: {
    js: 'import { createRequire as __volvelRequire } from "node:module";\nconst require = __volvelRequire(import.meta.url);',
  },
  legalComments: "none",
  logLevel: "warning",
});
chmodSync(out, 0o755);

// The files that draw an interface, built with the platform: `volvel dev` serves an interface
// app with them, so they travel with the command. docs-site is inlined above.
const screens = join(here, "../screens/runtime/dist");
if (!existsSync(join(screens, "index.html"))) {
  throw new Error("packages/screens/runtime/dist is not built. Run `pnpm build` first.");
}
rmSync(join(here, "dist/screens"), { recursive: true, force: true });
cpSync(screens, join(here, "dist/screens"), { recursive: true });
// The page `volvel dev` draws a widget in, which is the platform's host of a widget without React.
await build({
  entryPoints: [join(here, "../screens/runtime/dev-widget-host.ts")],
  outfile: join(here, "dist/widget-host.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"', "import.meta.env": "{}" },
  legalComments: "none",
  logLevel: "warning",
});
console.log("Wrote packages/cli/dist/volvel.mjs.");

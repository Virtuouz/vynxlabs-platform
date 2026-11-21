// Makes the CLI one file, for publishing: everything of the platform's own
// that it is built from, and what those need, is inside it. So `@volvel/cli`
// installs without the packages that are not published, and the command it
// installs is `volvel`.
//
// Left outside: esbuild, which is a program for the machine it is installed
// on, and Vite, which the CLI loads from the tenant's own repository.
import { chmodSync } from "node:fs";
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
console.log("Wrote packages/cli/dist/volvel.mjs.");

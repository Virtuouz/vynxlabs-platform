import { defineConfig } from "vite";

/**
 * The script a served page of documentation draws its diagrams with: Mermaid
 * and the instance's own drawing, as one module at a name that never changes,
 * `_platform/diagrams.js` among the console's files. The instance serves it at
 * `/_platform/diagrams.js` on every address a docs app answers on. Built after
 * the console, into the same folder.
 */
export default defineConfig({
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  publicDir: false,
  build: {
    outDir: "dist/_platform",
    emptyOutDir: false,
    copyPublicDir: false,
    // One module, with its exports, at a name that never changes. Not a library build: that would keep
    // every space and line of Mermaid, and this file is only ever run.
    rollupOptions: {
      input: "src/diagrams/served.ts",
      preserveEntrySignatures: "exports-only",
      output: { format: "es", entryFileNames: "diagrams.js", inlineDynamicImports: true },
    },
  },
});

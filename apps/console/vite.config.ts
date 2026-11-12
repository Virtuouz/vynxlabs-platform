import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [preact(), tailwindcss()],
  server: {
    // In development the console runs on its own port and talks to a local control plane.
    proxy: { "/api": "http://localhost:8080" },
  },
});

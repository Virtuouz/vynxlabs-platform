import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // In development the console runs on its own port and talks to a local control plane.
    proxy: { "/api": "http://localhost:8080" },
  },
});

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The app the platform serves for every interface. It is built once, with the
// platform, and is the same for every tenant: which interface it draws comes
// from the page it is served in.
export default defineConfig({
  // Relative, because the app is served under each generated app's own address.
  base: "./",
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist", emptyOutDir: true },
});

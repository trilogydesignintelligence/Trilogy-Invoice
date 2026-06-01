import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" makes all asset paths relative, so the build works
// whether it is served from username.github.io/<repo>/ (a project
// Pages site) or from a root domain. If you ever move it to a
// custom domain at the root, "./" still works.
export default defineConfig({
  plugins: [react()],
  base: "./",
});

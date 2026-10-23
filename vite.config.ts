import { defineConfig } from "vite";

const configuredBase = process.env.VITE_BASE_PATH ?? "/";
const base = configuredBase.endsWith("/")
  ? configuredBase
  : `${configuredBase}/`;

/* Vite's dev server and preview use the SPA fallback for routes such as
   /me and /n8ncation/<slug>. Static hosts need an equivalent fallback. */

export default defineConfig({
  base,
  server: { port: 5173, strictPort: true },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});

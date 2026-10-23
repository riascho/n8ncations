import { defineConfig } from "vite";

/* No routing config, on purpose. /n8ncation/<slug> is served by index.html
   through Vite's default appType: "spa" fallback, which rewrites any page
   request (GET, Accept: text/html) the server has no file for to
   /index.html — in both `vite` and `vite preview`. Whatever host this ends
   up on needs the same rule ("unknown path → index.html, status 200"), and
   that is the only routing it needs.

   The dev port is pinned because it has to be registered as an authorised
   JavaScript origin on the Google OAuth client; a shifting port would break
   sign-in locally. */
export default defineConfig({
  server: { port: 5173, strictPort: true },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});

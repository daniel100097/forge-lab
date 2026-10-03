import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const backend = process.env.FORGEJO_URL ?? "http://127.0.0.1:3000";
const subpath = (process.env.FORGEJO_SUBPATH ?? "").replace(/\/$/, "");
const mount = `${subpath}/-/ui/`;
// Like a production reverse proxy, strip the public installation prefix before
// forwarding to Forgejo, whose HTTP router is rooted at /.
const rewrite = (path: string) =>
  subpath ? path.slice(subpath.length) || "/" : path;

export default defineConfig(({ command }) => ({
  base: command === "serve" ? mount : "./",
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "forgejo-development-base",
      transformIndexHtml(html) {
        return command === "serve"
          ? html.replace("__FORGEJO_UI_BASE__", mount)
          : html;
      },
    },
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Native pages/actions and session cookies stay on the browser's origin.
      [`^${subpath}/-/ui/data(?:/|$)`]: {
        target: backend,
        changeOrigin: true,
        rewrite,
      },
      [`^${subpath}/(?!-/ui(?:/|$)|@|src/|node_modules/)`]: {
        target: backend,
        changeOrigin: true,
        rewrite,
        configure(proxy) {
          proxy.on("proxyRes", (response) => {
            const location = response.headers.location;
            if (location?.startsWith(backend))
              response.headers.location = location.slice(backend.length) || "/";
          });
        },
      },
    },
  },
}));

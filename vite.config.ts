import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

/**
 * GitHub Pages serves this repository as a project page, so the built gallery lives under
 * `/<repo>/`. Only the production build is re-based: the dev server, the capture scripts in
 * `scripts/` and `docs/` all address the app from `/`. Override `VGPU_BASE` if the repo name or
 * the hosting layout changes.
 */
const PAGES_BASE = process.env.VGPU_BASE ?? "/vgpu-render/";

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === "build" ? PAGES_BASE : "/",
  plugins: [tailwindcss()],
  build: {
    // `dist/` belongs to the published library build (`bun run build:lib`); the gallery is a
    // separate artifact, deployed by the Pages workflow.
    outDir: "dist-site",
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
}));

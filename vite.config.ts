import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import { sanitizeSource } from "./scripts/source-scrub.js";

/**
 * GitHub Pages serves this repository as a project page, so the built gallery lives under
 * `/<repo>/`. Only the production build is re-based: the dev server, the capture scripts in
 * `scripts/` and `docs/` all address the app from `/`. Override `VGPU_BASE` if the repo name or
 * the hosting layout changes.
 */
const PAGES_BASE = process.env.VGPU_BASE ?? "/vgpu-render/";

/** Scene modules whose source the gallery previews, so their comments reach the browser. */
const PREVIEWED_SCENE = /\/examples\/(?:basic|vfx)\/[^/]+\/scene\.ts$/;

/**
 * Scrubs the upstream brand names out of the `?raw` imports the source preview uses.
 *
 * Doing it here rather than at render time keeps the rewrite rules out of the shipped bundle:
 * they are regexes spelling the brand names, so anyone reading the deployed JavaScript would
 * find exactly what the previews are supposed to hide.
 */
function scrubPreviewedSources(): Plugin {
  return {
    name: "vgpu-render:scrub-previewed-sources",
    enforce: "pre",
    load(id) {
      const [file, query] = id.split("?") as [string, string | undefined];
      if (query !== "raw") return null;
      if (!PREVIEWED_SCENE.test(file)) return null;
      const source = readFileSync(file, "utf8");
      return `export default ${JSON.stringify(sanitizeSource(source))};`;
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === "build" ? PAGES_BASE : "/",
  plugins: [scrubPreviewedSources(), tailwindcss()],
  build: {
    // `dist/` belongs to the published library build (`bun run build:lib`); the gallery is a
    // separate artifact, deployed by the Pages workflow.
    outDir: "dist-site",
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./gallery"),
      "@examples": resolve(import.meta.dirname, "./examples"),
    },
  },
}));

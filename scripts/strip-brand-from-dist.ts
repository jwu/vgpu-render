/**
 * Scrubs upstream brand names out of the published build.
 *
 * `dist/` ships to npm, so the JSDoc that documents "the reference addon" or names the upstream
 * projects must not travel with it. The modules keep those comments for development; this script
 * rewrites them in place after `tsc`, touching only comments (see `scripts/source-scrub.ts`).
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { sanitizeSource } from "./source-scrub.js";

const DIST = resolve(import.meta.dir, "..", "dist");
const TARGETS = /\.(?:js|d\.ts)$/;
// `dist/assets` holds the inlined font data: one long base64-ish string per atlas, no prose to
// scrub and no way for the comment scanner to tell a chance substring from a mention.
const SKIP_DIRECTORIES = new Set(["assets"]);

async function* walk(directory: string): AsyncGenerator<string> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (TARGETS.test(entry.name)) yield path;
  }
}

let rewritten = 0;
let scanned = 0;
for await (const file of walk(DIST)) {
  scanned++;
  const source = await readFile(file, "utf8");
  const scrubbed = sanitizeSource(source);
  if (scrubbed === source) continue;
  await writeFile(file, scrubbed);
  rewritten++;
}

console.log(`scrubbed ${rewritten} of ${scanned} files in dist/`);

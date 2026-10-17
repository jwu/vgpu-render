/**
 * Brand scrubbing for anything that leaves the repository: the public gallery previews and the
 * published package. The source modules stay readable for development, so the upstream names are
 * rewritten on the way out instead of being erased at the definition.
 */

/**
 * Rewrites the upstream brand names and addon references. Order matters: the phrase patterns run
 * first so "a Godot addon" collapses to one word, and the doc path is handled before the bare
 * project name inside it.
 */
const BRAND_REWRITES: readonly (readonly [RegExp, string])[] = [
  [/~\/src\/[\w@./-]*/g, "the upstream reference"],
  [/docs\/(?:reference|godot-debug-draw)-parity\.md/gi, "the parity notes"],
  [/scripts\/capture-godot\.gd/gi, "the reference capture script"],
  [/capture-godot/gi, "the reference capture"],
  [/project\.godot/gi, "the reference project file"],
  [/crates\/[\w_]+(?:\/[\w_.-]+)*/gi, "the reference implementation"],
  [/@hardpixel[\w/-]*/gi, ""],
  [/godot-debug-draw/gi, "the reference library"],
  [/godot-infinite-grid/gi, "the reference grid library"],
  [/\b(?:reference|godot|bevy)\s+addon(?:'s)?\b/gi, "reference"],
  [/\b(?:godot|bevy)(?:'s)?\b/gi, "reference"],
  [/\baddon(?:'s)?\b/gi, "reference"],
];

const COMMENT_PATTERN = /\/\/[^\n]*|\/\*[\s\S]*?\*\//g;

/** Strips brand mentions from the comments of a source fragment, leaving its code untouched. */
export function sanitizeSource(source: string): string {
  return source.replace(COMMENT_PATTERN, (comment) =>
    BRAND_REWRITES.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), comment),
  );
}

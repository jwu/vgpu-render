/**
 * Source preview helpers for the example gallery.
 *
 * Kept free of DOM access so the tokenizer stays unit-testable and React can
 * render tokens as elements instead of raw HTML strings.
 */

export type SourceTokenKind =
  | "plain"
  | "comment"
  | "string"
  | "number"
  | "boolean"
  | "keyword"
  | "property"
  | "function";

export type SourceToken = {
  readonly kind: SourceTokenKind;
  readonly text: string;
};

const TOKEN_PATTERN =
  /\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:import|from|const|new|true|false|undefined|solid|width|color|dash|joint|headLength|headAngle|tolerance|widthMode|fontSize|pixelSize|fontFamily|weight|style|lineHeight|letterSpacing|justify|lineBreak|bounds|anchor|space|depthTest|layer)\b|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*(?=\s*\()/g;

const KEYWORDS = /^(?:import|from|const|new)$/;
const LITERALS = /^(?:true|false|undefined)$/;
const PROPERTIES = /^(?:solid|width|color|dash|joint|headLength|headAngle|tolerance|widthMode|fontSize|pixelSize|fontFamily|weight|style|lineHeight|letterSpacing|justify|lineBreak|bounds|anchor|space|depthTest|layer)$/;

function classify(token: string): SourceTokenKind {
  if (token.startsWith("//")) return "comment";
  if (token.startsWith('"') || token.startsWith("'") || token.startsWith("`")) return "string";
  if (/^\d/.test(token)) return "number";
  if (LITERALS.test(token)) return "boolean";
  if (KEYWORDS.test(token)) return "keyword";
  if (PROPERTIES.test(token)) return "property";
  return "function";
}

/** Splits source into highlightable tokens. Unterminated text stays plain. */
export function tokenizeSource(source: string): readonly SourceToken[] {
  const tokens: SourceToken[] = [];
  let cursor = 0;
  for (const match of source.matchAll(TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) tokens.push({ kind: "plain", text: source.slice(cursor, index) });
    const token = match[0];
    tokens.push({ kind: classify(token), text: token });
    cursor = index + token.length;
  }
  if (cursor < source.length) tokens.push({ kind: "plain", text: source.slice(cursor) });
  return tokens;
}

/**
 * Returns a page's own module source for the preview. Each page lives in
 * `examples/<slug>/scene.ts`, so the file is already the implementation the
 * selected example runs.
 *
 * The brand names in the comments are scrubbed before this module ever sees the source: the
 * `?raw` imports go through the Vite plugin in `vite.config.ts`, which keeps the rewrite rules
 * out of the bundle (see `scripts/source-scrub.ts`).
 */
export function sourceForExample(sceneSource: string): string {
  return sceneSource.trim();
}

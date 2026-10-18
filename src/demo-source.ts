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

const SCENE_FUNCTIONS: Readonly<Record<string, string>> = {
  index: "apiMatrix",
  line: "lineMatrix",
  arrow: "arrowMatrix",
  axes: "axesMatrix",
  grid: "gridMatrix",
  rect: "rectMatrix",
  box: "boxMatrix",
  circle: "circleMatrix",
  arc: "arcMatrix",
  curve: "curveMatrix",
  sphere: "shapeScene",
  cone: "shapeScene",
  cylinder: "shapeScene",
  capsule: "shapeScene",
  world_space_width: "worldWidthMatrix",
  "text-compare": "textCompareScene",
  "text-encodings": "textEncodingsScene",
  "text-scale": "textScaleScene",
  "text-world-zoom": "textWorldZoomScene",
  "text-layout": "textLayoutScene",
  "text-anchor": "textAnchorScene",
  "text-cjk": "textCjkScene",
  "text-font-query": "textFontQueryScene",
  "2d-gizmos": "gizmos2D",
  "2d-shapes": "shapes2D",
  "2d-lines": "lines2D",
  "2d-curves": "curves2D",
  "2d-markers": "markers2D",
  "2d-outlines": "outlines2D",
  "2d-fill": "fill2D",
  "2d-spaces": "spaces2D",
  "2d-grid": "grid2D",
};

/**
 * Returns the scene function that the selected example actually runs, so the
 * preview matches the direct recorder code in `scenes-3d.ts`.
 *
 * The brand names in the comments are scrubbed before this module ever sees the source: the
 * `?raw` imports go through the Vite plugin in `vite.config.ts`, which keeps the rewrite rules
 * out of the bundle (see `source-scrub.ts`).
 */
export function sourceForExample(id: string, sceneSource: string): string {
  const name = SCENE_FUNCTIONS[id] ?? "apiMatrix";
  // `export function` also starts a block: the text pages moved to their own module, where their
  // implementations are exported so the dispatcher can reach them.
  const start = sceneSource.search(new RegExp(`^(?:export )?function ${name}\\(`, "m"));
  if (start < 0) return "";
  // `export function` also ends a block: the scene helpers come first, `buildScene` last.
  const next = sceneSource.slice(start + 1).search(/^(?:export )?function /m);
  return sceneSource.slice(start, next < 0 ? undefined : start + 1 + next).trim();
}

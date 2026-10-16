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
  /\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:import|from|const|new|true|false|undefined|solid|width|color|dash|joint|headLength|headAngle|tolerance|widthMode|fontSize|pixelSize|fontFamily|lineHeight|letterSpacing|justify|lineBreak|bounds|anchor|space|depthTest|layer)\b|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*(?=\s*\()/g;

const KEYWORDS = /^(?:import|from|const|new)$/;
const LITERALS = /^(?:true|false|undefined)$/;
const PROPERTIES = /^(?:solid|width|color|dash|joint|headLength|headAngle|tolerance|widthMode|fontSize|pixelSize|fontFamily|lineHeight|letterSpacing|justify|lineBreak|bounds|anchor|space|depthTest|layer)$/;

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
  "text-hud": "textHudScene",
};

/**
 * Returns the scene function that the selected example actually runs, so the
 * preview matches the direct recorder code in `godot-scenes.ts`.
 */
export function sourceForExample(id: string, sceneSource: string): string {
  const name = SCENE_FUNCTIONS[id] ?? "apiMatrix";
  const start = sceneSource.search(new RegExp(`^function ${name}\\(`, "m"));
  if (start < 0) return "";
  // `export function` also ends a block: the scene helpers come first, `buildScene` last.
  const next = sceneSource.slice(start + 1).search(/^(?:export )?function /m);
  return sceneSource.slice(start, next < 0 ? undefined : start + 1 + next).trim();
}

/**
 * Text layout for the debug text renderer.
 *
 * Ported from bevy's `TextPipeline::update_text_layout_info`
 * (`crates/bevy_text/src/pipeline.rs`): a text block is wrapped to its `TextBounds`, split
 * into lines, justified, and turned into one positioned glyph per character. Each glyph
 * carries its ink box and resolved colour, which is what the GPU pass later instantiates as
 * a quad.
 *
 * Two deliberate differences from bevy:
 *
 * - There is no shaping. Characters advance one at a time and never form ligatures or
 *   reorder runs, which suits the monospaced debug font the library bundles.
 * - Every metric comes from an injected `TextMeasurer`. bevy reads parley and swash here;
 *   staying behind an interface keeps this module free of browser APIs and unit-testable in
 *   plain Node, and it is also the seam the GPU tests use to feed synthetic glyphs.
 *
 * Layout happens in one local space: origin at the block's anchor point, x to the right and
 * **y down**, matching Canvas2D. The renderer flips y for spaces where up is +y.
 */

export type Rgba = readonly [number, number, number, number];

/** Vertical font metrics, in the same units as the font size the measurer was asked for. */
export type VerticalMetrics = {
  readonly ascent: number;
  readonly descent: number;
};

/**
 * Per-character metrics, mirroring the `Placement` swash reports to bevy: an advance along
 * the baseline plus the ink box relative to the pen.
 */
export type GlyphMetrics = {
  /** Pen advance for this character. */
  readonly advance: number;
  /** Ink box width. Zero for whitespace. */
  readonly width: number;
  /** Ink box height. Zero for whitespace. */
  readonly height: number;
  /** Ink box left edge relative to the pen, y down: positive moves right. */
  readonly bearingLeft: number;
  /** Ink box top edge relative to the baseline, y down: positive is below the baseline. */
  readonly bearingTop: number;
};

/** Source of glyph metrics. The browser implementation measures through Canvas2D. */
export interface TextMeasurer {
  /** Vertical metrics for a `fontSize`-sized face of `fontFamily`. */
  verticalMetrics(fontFamily: string, fontSize: number): VerticalMetrics;
  /** Metrics for one character. Whitespace returns a zero-size ink box. */
  glyphMetrics(character: string, fontFamily: string, fontSize: number): GlyphMetrics;
}

/** Reference `Justify`. `start`/`end` resolve to left/right in this LTR-only layout. */
export type TextJustify = "left" | "center" | "right" | "justified" | "start" | "end";

/** Reference `LineBreak`, minus the Unicode-correct word segmentation bevy gets from parley. */
export type TextLineBreak = "word" | "character" | "word-or-character" | "none";

/** Normalized anchor: x 0 = left, 1 = right; y 0 = top, 1 = bottom (local y grows down). */
export type TextAnchorPoint = readonly [number, number];

/** Reference `Anchor` presets, named for the block corner that lands on the position. */
export type TextAnchor =
  | "center"
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

const TEXT_ANCHORS: Record<TextAnchor, TextAnchorPoint> = {
  center: [0.5, 0.5],
  "top-left": [0, 0],
  "top-center": [0.5, 0],
  "top-right": [1, 0],
  "center-left": [0, 0.5],
  "center-right": [1, 0.5],
  "bottom-left": [0, 1],
  "bottom-center": [0.5, 1],
  "bottom-right": [1, 1],
};

export function resolveTextAnchor(anchor: TextAnchor): TextAnchorPoint {
  const point = TEXT_ANCHORS[anchor];
  if (point === undefined) {
    throw new RangeError(`unknown text anchor "${anchor}"`);
  }
  return point;
}

/** One section of a text block, the equivalent of a bevy `TextSpan`. */
export type TextSpanInput = {
  readonly text: string;
  readonly color?: Rgba;
  readonly fontSize?: number;
  readonly fontFamily?: string;
};

export type TextLayoutOptions = {
  readonly color: Rgba;
  readonly fontSize: number;
  readonly fontFamily: string;
  /** Resolved line height in layout units (bevy's `LineHeight`, default `1.2 × fontSize`). */
  readonly lineHeight: number;
  /** Extra advance after every character except the last of a line. */
  readonly letterSpacing: number;
  readonly justify: TextJustify;
  readonly lineBreak: TextLineBreak;
  /** `TextBounds`: maximum width and height before wrapping and truncation. */
  readonly bounds?: readonly [number, number] | undefined;
  readonly anchor: TextAnchorPoint;
};

/** One laid-out glyph, ready to become an instance once its atlas rectangle is known. */
export type PositionedGlyph = {
  readonly character: string;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly color: Rgba;
  /** Ink box centre relative to the block's anchor point, y down. */
  readonly center: readonly [number, number];
  readonly width: number;
  readonly height: number;
};

export type TextLayoutResult = {
  readonly glyphs: readonly PositionedGlyph[];
  /** Block size before the anchor offset is applied. */
  readonly size: readonly [number, number];
  readonly lineCount: number;
};

type StyledCharacter = {
  readonly character: string;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly color: Rgba;
  readonly advance: number;
  readonly width: number;
  readonly height: number;
  readonly bearingLeft: number;
  readonly bearingTop: number;
  readonly isSpace: boolean;
};

type Token = {
  readonly kind: "word" | "space" | "break";
  readonly characters: readonly StyledCharacter[];
};

function isWhitespace(character: string): boolean {
  return character === " " || character === "\t";
}

/** Splits the flattened block into word / spaces / hard-break tokens. */
function tokenize(items: readonly StyledCharacter[]): Token[] {
  const tokens: Token[] = [];
  let current: StyledCharacter[] = [];
  let kind: "word" | "space" | undefined;
  const flush = (): void => {
    if (kind !== undefined && current.length > 0) tokens.push({ kind, characters: current });
    current = [];
    kind = undefined;
  };
  for (const item of items) {
    if (item.character === "\n") {
      flush();
      tokens.push({ kind: "break", characters: [] });
      continue;
    }
    const next: "word" | "space" = item.isSpace ? "space" : "word";
    if (kind !== undefined && next !== kind) flush();
    kind = next;
    current.push(item);
  }
  flush();
  return tokens;
}

/** Total advance of a run, with `letterSpacing` applied between characters but not after the last. */
function runWidth(characters: readonly StyledCharacter[], letterSpacing: number): number {
  let width = 0;
  for (let index = 0; index < characters.length; index++) {
    if (index > 0) width += letterSpacing;
    width += characters[index]!.advance;
  }
  return width;
}

/** Splits a word token one character at a time, the fallback for `word-or-character`. */
function splitCharacters(token: Token): Token[] {
  return token.characters.map((character) => ({ kind: "word", characters: [character] }));
}

/**
 * Greedy line breaker. Words move whole to the next line when they no longer fit, matching
 * bevy's `LineBreak::WordBoundary`; `character` strategies hand single characters to the same
 * loop, and `none` only honours explicit newlines.
 */
function breakLines(tokens: readonly Token[], maxWidth: number | undefined, lineBreak: TextLineBreak, letterSpacing: number): StyledCharacter[][] {
  const lines: StyledCharacter[][] = [];
  let line: StyledCharacter[] = [];

  const pushLine = (): void => {
    lines.push(line);
    line = [];
  };

  const addCharacters = (characters: readonly StyledCharacter[]): void => {
    for (const character of characters) {
      if (maxWidth !== undefined && lineWidth(line, letterSpacing) + (line.length > 0 ? letterSpacing : 0) + character.advance > maxWidth && line.length > 0) {
        // Trailing spaces never push a line over: they are dropped when the line breaks.
        const trimmed = trimTrailingSpaces(line);
        lines.push(trimmed);
        line = [];
      }
      line.push(character);
    }
  };

  for (const token of tokens) {
    if (token.kind === "break") {
      pushLine();
      continue;
    }
    if (maxWidth === undefined || lineBreak === "none") {
      line.push(...token.characters);
      continue;
    }
    if (lineBreak === "character") {
      addCharacters(token.characters);
      continue;
    }
    const width = lineWidth(line, letterSpacing) + (line.length > 0 && token.characters.length > 0 ? letterSpacing : 0) + runWidth(token.characters, letterSpacing);
    const fits = width <= maxWidth || lineWidth(line, letterSpacing) === 0;
    if (fits) {
      line.push(...token.characters);
      continue;
    }
    if (token.kind === "space") {
      // A space that no longer fits is where the line ends; it is not carried over.
      lines.push(trimTrailingSpaces(line));
      line = [];
      continue;
    }
    // A word too wide for an empty line falls back to per-character breaking.
    const trimmed = trimTrailingSpaces(line);
    lines.push(trimmed);
    line = [];
    const splittable = lineBreak === "word-or-character" || runWidth(token.characters, letterSpacing) > maxWidth;
    if (splittable) addCharacters(token.characters);
    else line.push(...token.characters);
  }
  pushLine();
  return lines;
}

function lineWidth(characters: readonly StyledCharacter[], letterSpacing: number): number {
  return runWidth(characters, letterSpacing);
}

function trimTrailingSpaces(characters: StyledCharacter[]): StyledCharacter[] {
  let end = characters.length;
  while (end > 0 && characters[end - 1]!.isSpace) end--;
  return end === characters.length ? characters : characters.slice(0, end);
}

function countSpaces(characters: readonly StyledCharacter[]): number {
  let count = 0;
  for (const character of characters) if (character.isSpace) count++;
  return count;
}

/**
 * Lays out one text block. `options.anchor` decides which part of the block lands on the
 * position the renderer is given; the returned glyph centres are already offset for it.
 */
export function layoutText(
  spans: readonly TextSpanInput[],
  options: TextLayoutOptions,
  measurer: TextMeasurer,
): TextLayoutResult {
  const items: StyledCharacter[] = [];
  for (const span of spans) {
    const fontSize = span.fontSize ?? options.fontSize;
    const fontFamily = span.fontFamily ?? options.fontFamily;
    const color = span.color ?? options.color;
    // Iterating the string yields code points, so surrogate pairs stay whole.
    for (const character of span.text) {
      if (character === "\n") {
        items.push({ character, fontFamily, fontSize, color, advance: 0, width: 0, height: 0, bearingLeft: 0, bearingTop: 0, isSpace: false });
        continue;
      }
      const metrics = measurer.glyphMetrics(character, fontFamily, fontSize);
      items.push({
        character,
        fontFamily,
        fontSize,
        color,
        advance: metrics.advance,
        width: metrics.width,
        height: metrics.height,
        bearingLeft: metrics.bearingLeft,
        bearingTop: metrics.bearingTop,
        isSpace: isWhitespace(character),
      });
    }
  }

  const maxWidth = options.bounds?.[0];
  const lines = breakLines(tokenize(items), maxWidth, options.lineBreak, options.letterSpacing);
  const maxHeight = options.bounds?.[1];
  const maxLines = maxHeight === undefined ? lines.length : Math.max(0, Math.floor(maxHeight / options.lineHeight));
  const visibleLines = lines.slice(0, maxLines);

  // Every line shares the block's default metrics: bevy resolves the line box from the
  // block's `TextFont`, not from the tallest span on the line.
  const base = measurer.verticalMetrics(options.fontFamily, options.fontSize);
  const halfLeading = (options.lineHeight - (base.ascent + base.descent)) / 2;

  const widths = visibleLines.map((line) => lineWidth(line, options.letterSpacing));
  const blockWidth = widths.length === 0 ? 0 : Math.max(...widths);
  const blockHeight = visibleLines.length * options.lineHeight;

  const offsetX = -options.anchor[0] * blockWidth;
  const offsetY = -options.anchor[1] * blockHeight;

  const glyphs: PositionedGlyph[] = [];
  for (let lineIndex = 0; lineIndex < visibleLines.length; lineIndex++) {
    const line = visibleLines[lineIndex]!;
    const natural = widths[lineIndex]!;
    const isLastLine = lineIndex === visibleLines.length - 1;
    let penX = alignPenX(options.justify, natural, blockWidth, maxWidth, isLastLine);
    let stretch = 0;
    if (options.justify === "justified" && !isLastLine && maxWidth !== undefined) {
      const spaces = countSpaces(line);
      if (spaces > 0 && maxWidth > natural) {
        stretch = (maxWidth - natural) / spaces;
        penX = 0;
      }
    }
    const baseline = lineIndex * options.lineHeight + halfLeading + base.ascent;
    for (let index = 0; index < line.length; index++) {
      if (index > 0) penX += options.letterSpacing;
      const character = line[index]!;
      if (character.width > 0 && character.height > 0) {
        glyphs.push({
          character: character.character,
          fontFamily: character.fontFamily,
          fontSize: character.fontSize,
          color: character.color,
          center: [offsetX + penX + character.bearingLeft + character.width / 2, offsetY + baseline + character.bearingTop + character.height / 2],
          width: character.width,
          height: character.height,
        });
      }
      penX += character.advance;
      if (character.isSpace) penX += stretch;
    }
  }

  return { glyphs, size: [blockWidth, blockHeight], lineCount: visibleLines.length };
}

/** Reference `Justify` → the pen offset for one line inside the block box. */
function alignPenX(justify: TextJustify, lineWidth: number, blockWidth: number, maxWidth: number | undefined, isLastLine: boolean): number {
  const box = justify === "justified" ? (isLastLine ? blockWidth : (maxWidth ?? blockWidth)) : blockWidth;
  switch (justify) {
    case "center":
      return (box - lineWidth) / 2;
    case "right":
    case "end":
      return box - lineWidth;
    case "justified":
      return 0;
    case "left":
    case "start":
      return 0;
    default:
      return 0;
  }
}

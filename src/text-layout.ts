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

/** bevy's `LineHeight` default, `RelativeToFont(1.2)`. */
export const DEFAULT_LINE_HEIGHT_SCALE = 1.2;

export type TextLayoutOptions = {
  readonly color: Rgba;
  readonly fontSize: number;
  readonly fontFamily: string;
  /**
   * Absolute line height in layout units, bevy's `LineHeight::Px`. When omitted the line height
   * is `lineHeightScale` times the line's own largest font size, which is bevy's
   * `LineHeight::RelativeToFont` — the default, and the reason a line holding a larger span gets
   * a taller box rather than being clipped to the block's own size.
   */
  readonly lineHeight?: number | undefined;
  /** Multiple of the line's largest font size, bevy's `LineHeight::RelativeToFont`. Default `1.2`. */
  readonly lineHeightScale?: number | undefined;
  /**
   * Added after every character, the last one on a line included: parley adds it to each cluster's
   * advance, and the trailing whitespace a line breaks at carries its share into the block width.
   */
  readonly letterSpacing: number;
  readonly justify: TextJustify;
  readonly lineBreak: TextLineBreak;
  /**
   * `TextBounds`. Only `width` feeds layout: it is the wrap width. `height` is not a layout input,
   * matching bevy, whose `Text2d` never truncates lines against it (it only sizes the node).
   */
  readonly bounds?: readonly [number, number] | undefined;
  readonly anchor: TextAnchorPoint;
};

/**
 * One line after breaking, with the two advances bevy/parley distinguish.
 *
 * - `advance` is the line as it is drawn: the whitespace it broke at is not part of it. This is
 *   what `Alignment` centres or right-aligns inside, and what `Justify` stretches.
 * - `fullAdvance` keeps that trailing whitespace, which is `Layout::full_width` and therefore the
 *   block width bevy reports and anchors on.
 */
type LaidOutLine = {
  readonly characters: readonly StyledCharacter[];
  readonly advance: number;
  readonly fullAdvance: number;
  /** Largest font size on the line; `0` only for a line with no characters at all. */
  readonly fontSize: number;
  readonly isEmpty: boolean;
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

/** Advance of a run. `letterSpacing` lands after every character, the last one included. */
function runWidth(characters: readonly StyledCharacter[], letterSpacing: number): number {
  let width = 0;
  for (const character of characters) width += character.advance + letterSpacing;
  return width;
}

/** Measures one broken line into the two advances and the line box size bevy works from. */
function measureLine(characters: readonly StyledCharacter[], letterSpacing: number): LaidOutLine {
  // UAX #14 never leaves a space at the start of a line, and the breakers bevy runs drop it there.
  let start = 0;
  while (start < characters.length && characters[start]!.isSpace) start++;
  const content = start === 0 ? characters : characters.slice(start);
  let end = content.length;
  while (end > 0 && content[end - 1]!.isSpace) end--;

  let fontSize = 0;
  for (const character of content) fontSize = Math.max(fontSize, character.fontSize);

  return {
    characters: content.slice(0, end),
    advance: runWidth(content.slice(0, end), letterSpacing),
    fullAdvance: runWidth(content, letterSpacing),
    fontSize,
    isEmpty: content.length === 0,
  };
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
function breakLines(tokens: readonly Token[], maxWidth: number | undefined, lineBreak: TextLineBreak, letterSpacing: number): LaidOutLine[] {
  const lines: StyledCharacter[][] = [];
  let line: StyledCharacter[] = [];

  const pushLine = (): void => {
    lines.push(line);
    line = [];
  };

  const addCharacters = (characters: readonly StyledCharacter[]): void => {
    for (const character of characters) {
      if (maxWidth !== undefined && line.length > 0 && lineWidth(line, letterSpacing) + character.advance + letterSpacing > maxWidth) {
        // The space a line breaks at stays on that line as trailing whitespace — it may even take the
        // line past its bounds, which is why a bounded block can report a wider width. Carrying it to
        // the next line instead would push the following characters right by one space.
        if (character.isSpace) line.push(character);
        lines.push(line);
        line = [];
        if (character.isSpace) continue;
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
    const width = lineWidth(line, letterSpacing) + runWidth(token.characters, letterSpacing);
    const fits = width <= maxWidth || lineWidth(line, letterSpacing) === 0;
    if (fits) {
      line.push(...token.characters);
      continue;
    }
    if (token.kind === "space") {
      // A space that no longer fits ends the line and belongs to it, as the trailing whitespace
      // parley keeps for its width even though it is not drawn.
      line.push(...token.characters);
      lines.push(line);
      line = [];
      continue;
    }
    // A word too wide for an empty line falls back to per-character breaking.
    lines.push(line);
    line = [];
    const splittable = lineBreak === "word-or-character" || runWidth(token.characters, letterSpacing) > maxWidth;
    if (splittable) addCharacters(token.characters);
    else line.push(...token.characters);
  }
  pushLine();
  return lines.map((characters) => measureLine(characters, letterSpacing));
}

function lineWidth(characters: readonly StyledCharacter[], letterSpacing: number): number {
  return runWidth(characters, letterSpacing);
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

  // bevy resolves the line box per line, from that line's own largest run: a relative
  // `LineHeight` multiplies the run's size, so a line holding a larger span grows its box
  // instead of being held to the block's default size.
  const boxes = lines.map((line) => {
    const fontSize = line.fontSize > 0 ? line.fontSize : options.fontSize;
    const base = measurer.verticalMetrics(options.fontFamily, fontSize);
    const height = options.lineHeight ?? (options.lineHeightScale ?? DEFAULT_LINE_HEIGHT_SCALE) * fontSize;
    return { base, height, halfLeading: (height - (base.ascent + base.descent)) / 2 };
  });

  // The block is what bevy reports and anchors on: `Layout::full_width`, which keeps the
  // whitespace each line broke at, over the summed line boxes. Both are rounded up.
  const blockWidth = Math.ceil(lines.reduce((widest, line) => Math.max(widest, line.fullAdvance), 0));
  let blockHeight = boxes.reduce((sum, box) => sum + box.height, 0);
  // parley leaves a trailing empty line's box out of the layout height.
  if (lines.length > 1 && lines[lines.length - 1]!.isEmpty) blockHeight -= boxes[boxes.length - 1]!.height;
  blockHeight = Math.ceil(blockHeight);

  const offsetX = -options.anchor[0] * blockWidth;
  const offsetY = -options.anchor[1] * blockHeight;

  // `Alignment` works inside parley's `max_advance`: the bounds width when bounded, otherwise the
  // widest line. That is a smaller box than `full_width` whenever a line breaks at a space.
  const alignBox = maxWidth ?? lines.reduce((widest, line) => Math.max(widest, line.advance), 0);

  const glyphs: PositionedGlyph[] = [];
  let penY = 0;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!;
    const box = boxes[lineIndex]!;
    const isLastLine = lineIndex === lines.length - 1;
    let penX = alignPenX(options.justify, line.advance, alignBox);
    let stretch = 0;
    if (options.justify === "justified" && !isLastLine && maxWidth !== undefined) {
      const spaces = countSpaces(line.characters);
      if (spaces > 0 && alignBox > line.advance) {
        stretch = (alignBox - line.advance) / spaces;
        penX = 0;
      }
    }
    const baseline = penY + box.halfLeading + box.base.ascent;
    for (const character of line.characters) {
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
      penX += character.advance + options.letterSpacing;
      if (character.isSpace) penX += stretch;
    }
    penY += box.height;
  }

  return { glyphs, size: [blockWidth, blockHeight], lineCount: lines.length };
}

/** Reference `Justify` → the pen offset for one line inside the box `Alignment` gets. */
function alignPenX(justify: TextJustify, lineWidth: number, box: number): number {
  switch (justify) {
    case "center":
      return (box - lineWidth) / 2;
    case "right":
    case "end":
      return box - lineWidth;
    default:
      return 0;
  }
}

import { describe, expect, test } from "vitest";
import { layoutText, resolveTextAnchor, type TextLayoutOptions } from "../src/text-layout.js";
import { ADVANCE_RATIO, ASCENT_RATIO, INK_HEIGHT_RATIO, INK_WIDTH_RATIO, SyntheticFont } from "./support/synthetic-font.js";

const font = new SyntheticFont();
const SIZE = 16;
const ADVANCE = SIZE * ADVANCE_RATIO;
const INK = SIZE * INK_WIDTH_RATIO;
const LINE_HEIGHT = SIZE * 1.2;
/** Ink centre on the first line when the block is anchored top-left with no half-leading. */
const FIRST_LINE_CENTER_Y = SIZE * ASCENT_RATIO - SIZE * INK_HEIGHT_RATIO + INK / 2;

function options(patch: Partial<TextLayoutOptions> = {}): TextLayoutOptions {
  return {
    color: [1, 1, 1, 1],
    fontSize: SIZE,
    fontFamily: "test",
    lineHeight: LINE_HEIGHT,
    letterSpacing: 0,
    justify: "left",
    lineBreak: "word",
    anchor: [0, 0],
    ...patch,
  };
}

describe("layoutText", () => {
  test("lays one ink box per character and advances by the glyph advance", () => {
    const result = layoutText([{ text: "AB" }], options(), font);
    expect(result.glyphs.map((glyph) => glyph.character)).toEqual(["A", "B"]);
    expect(result.glyphs[0]!.center[0]).toBeCloseTo(INK / 2, 6);
    expect(result.glyphs[0]!.center[1]).toBeCloseTo(FIRST_LINE_CENTER_Y, 6);
    expect(result.glyphs[1]!.center[0]).toBeCloseTo(ADVANCE + INK / 2, 6);
    expect(result.glyphs[0]!.width).toBeCloseTo(INK, 6);
  });

  test("sizes the block from the widest line and the line height", () => {
    const result = layoutText([{ text: "AB" }], options(), font);
    expect(result.size[0]).toBeCloseTo(2 * ADVANCE, 6);
    expect(result.size[1]).toBeCloseTo(LINE_HEIGHT, 6);
    expect(result.lineCount).toBe(1);
  });

  test("breaks on explicit newlines", () => {
    const result = layoutText([{ text: "A\nB" }], options(), font);
    expect(result.lineCount).toBe(2);
    expect(result.size[1]).toBeCloseTo(2 * LINE_HEIGHT, 6);
    expect(result.glyphs[1]!.center[1]).toBeCloseTo(LINE_HEIGHT + FIRST_LINE_CENTER_Y, 6);
  });

  test("wraps at the bounds width and drops the trailing space", () => {
    const wrapped = layoutText([{ text: "A B C" }], options({ bounds: [ADVANCE * 3, Number.POSITIVE_INFINITY] }), font);
    expect(wrapped.lineCount).toBe(2);
    expect(wrapped.glyphs.map((glyph) => glyph.character)).toEqual(["A", "B", "C"]);
    // "A B" fits the first line, so B keeps its place after the space and C starts the next line.
    expect(wrapped.glyphs[1]!.center[0]).toBeCloseTo(2 * ADVANCE + INK / 2, 6);
    expect(wrapped.glyphs[2]!.center[0]).toBeCloseTo(INK / 2, 6);

    const narrow = layoutText([{ text: "A B C" }], options({ bounds: [ADVANCE * 2, Number.POSITIVE_INFINITY] }), font);
    expect(narrow.lineCount).toBe(3);
    // The space that no longer fits ends the line instead of starting the next one.
    expect(narrow.glyphs[1]!.center[0]).toBeCloseTo(INK / 2, 6);
  });

  test("justifies against the widest line", () => {
    const centered = layoutText([{ text: "A\nAB" }], options({ justify: "center" }), font);
    // The block is two characters wide, so the single-character line moves half an advance in.
    expect(centered.glyphs[0]!.center[0]).toBeCloseTo(ADVANCE / 2 + INK / 2, 6);

    const right = layoutText([{ text: "A\nAB" }], options({ justify: "right" }), font);
    expect(right.glyphs[0]!.center[0]).toBeCloseTo(ADVANCE + INK / 2, 6);
  });

  test("applies letter spacing between characters only", () => {
    const result = layoutText([{ text: "AB" }], options({ letterSpacing: 2 }), font);
    expect(result.size[0]).toBeCloseTo(2 * ADVANCE + 2, 6);
    expect(result.glyphs[0]!.center[0]).toBeCloseTo(INK / 2, 6);
    expect(result.glyphs[1]!.center[0]).toBeCloseTo(ADVANCE + 2 + INK / 2, 6);
  });

  test("carries per-span colour and size", () => {
    const result = layoutText(
      [
        { text: "A", color: [1, 0, 0, 1] },
        { text: "B", color: [0, 1, 0, 1], fontSize: 32 },
      ],
      options(),
      font,
    );
    expect(result.glyphs[0]!.color).toEqual([1, 0, 0, 1]);
    expect(result.glyphs[1]!.color).toEqual([0, 1, 0, 1]);
    expect(result.glyphs[1]!.width).toBeCloseTo(32 * INK_WIDTH_RATIO, 6);
    // The second span keeps the block's advance unless it overrides the size, which it does.
    expect(result.glyphs[1]!.center[0]).toBeCloseTo(ADVANCE + 32 * INK_WIDTH_RATIO / 2, 6);
  });

  test("offsets the block for its anchor", () => {
    const result = layoutText([{ text: "AB" }], options({ anchor: resolveTextAnchor("center") }), font);
    expect(result.glyphs[0]!.center[0]).toBeCloseTo(-ADVANCE + INK / 2, 6);
    expect(result.glyphs[0]!.center[1]).toBeCloseTo(-LINE_HEIGHT / 2 + FIRST_LINE_CENTER_Y, 6);
  });

  test("truncates lines past the bounds height", () => {
    const result = layoutText([{ text: "A\nB\nC" }], options({ bounds: [Number.POSITIVE_INFINITY, LINE_HEIGHT * 2] }), font);
    expect(result.lineCount).toBe(2);
    expect(result.glyphs.map((glyph) => glyph.character)).toEqual(["A", "B"]);
  });

  test("emits no glyph for whitespace, but still counts the line", () => {
    const result = layoutText([{ text: "   " }], options(), font);
    expect(result.glyphs).toHaveLength(0);
    expect(result.lineCount).toBe(1);
  });

  test("rejects an unknown anchor name", () => {
    expect(() => resolveTextAnchor("middle" as never)).toThrow(RangeError);
  });
});

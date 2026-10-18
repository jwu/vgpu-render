/**
 * Font-face selection: weight, style and width from the recorder down to the atlas key.
 *
 * bevy's `font-query` example demonstrates these three axes on a variable font. Canvas2D can only
 * express part of that — see `canvasFontString` — so the tests below pin the parts that survive the
 * browser boundary plus the plumbing that keeps two faces apart in the glyph atlas.
 */

import { describe, expect, test } from "vitest";
import { FrameRecorder } from "../src/frame-recorder.js";
import { GlyphAtlas } from "../src/text-atlas.js";
import { canvasFontString } from "../src/text-font.js";
import {
  fontFaceKey,
  layoutText,
  resolveFontFace,
  type FontFace,
  type TextLayoutOptions,
  type TextMeasurer,
  type VerticalMetrics,
} from "../src/text-layout.js";
import { SyntheticFont } from "./support/synthetic-font.js";

const FACE = resolveFontFace({ family: "Fira" });

function options(patch: Partial<TextLayoutOptions> = {}): TextLayoutOptions {
  return {
    color: [1, 1, 1, 1],
    fontSize: 16,
    fontFamily: "Fira",
    lineHeight: 16 * 1.2,
    letterSpacing: 0,
    justify: "left",
    lineBreak: "word",
    anchor: [0, 0],
    ...patch,
  };
}

describe("resolveFontFace", () => {
  test("fills the axes with their defaults", () => {
    expect(resolveFontFace({ family: "Fira" })).toEqual({ family: "Fira", weight: 400, style: "normal", width: "normal" });
  });

  test("keeps every axis it was given", () => {
    expect(resolveFontFace({ family: "Mona", weight: 900, style: "italic", width: "ultra-condensed" }))
      .toEqual({ family: "Mona", weight: 900, style: "italic", width: "ultra-condensed" });
  });
});

describe("fontFaceKey", () => {
  test("separates every axis, so two faces cannot share a rasterised glyph", () => {
    const keys = [
      fontFaceKey(resolveFontFace({ family: "Fira" })),
      fontFaceKey(resolveFontFace({ family: "Fira", weight: 700 })),
      fontFaceKey(resolveFontFace({ family: "Fira", style: "italic" })),
      fontFaceKey(resolveFontFace({ family: "Fira", width: "condensed" })),
      fontFaceKey(resolveFontFace({ family: "Other" })),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("canvasFontString", () => {
  test("emits the shorthand in grammar order: style, weight, stretch, size, family", () => {
    expect(canvasFontString(FACE, 16)).toBe('400 16px "Fira"');
    expect(canvasFontString(resolveFontFace({ family: "Fira", weight: 700 }), 16)).toBe('700 16px "Fira"');
    expect(canvasFontString(resolveFontFace({ family: "Fira", weight: 700, style: "italic", width: "condensed" }), 24))
      .toBe('italic 700 condensed 24px "Fira"');
  });

  test("leaves out the axes that Canvas2D draws identically", () => {
    // A percentage is rejected outright by the shorthand, and `normal` is the default anyway.
    expect(canvasFontString(resolveFontFace({ family: "Fira", width: "normal" }), 12)).toBe('400 12px "Fira"');
    expect(canvasFontString(resolveFontFace({ family: "Fira" }), 12)).not.toContain("normal");
  });
});

describe("layoutText face resolution", () => {
  test("gives every glyph the block's face", () => {
    const font = new SyntheticFont();
    const result = layoutText([{ text: "AB" }], options({ weight: 700, style: "italic", width: "expanded" }), font);
    for (const glyph of result.glyphs) {
      expect(glyph.face).toEqual({ family: "Fira", weight: 700, style: "italic", width: "expanded" });
    }
  });

  test("lets a span override one axis without resetting the others", () => {
    const font = new SyntheticFont();
    const result = layoutText(
      [{ text: "A" }, { text: "B", weight: 900 }],
      options({ weight: 500, style: "italic" }),
      font,
    );
    expect(result.glyphs.map((glyph) => glyph.face.weight)).toEqual([500, 900]);
    expect(result.glyphs.map((glyph) => glyph.face.style)).toEqual(["italic", "italic"]);
  });

  test("measures the line box with the face of the line's largest run", () => {
    const seen: FontFace[] = [];
    const font = new SyntheticFont();
    const measurer: TextMeasurer = {
      verticalMetrics(face: FontFace, fontSize: number): VerticalMetrics {
        seen.push(face);
        return font.verticalMetrics(face, fontSize);
      },
      glyphMetrics: (character, face, fontSize) => font.glyphMetrics(character, face, fontSize),
    };
    layoutText(
      [
        { text: "small " },
        { text: "BIG", fontSize: 32, weight: 900 },
      ],
      options(),
      measurer,
    );
    expect(seen.at(-1)).toEqual({ family: "Fira", weight: 900, style: "normal", width: "normal" });
  });
});

describe("GlyphAtlas face keys", () => {
  test("keeps two weights of one character apart", () => {
    const atlas = new GlyphAtlas(new SyntheticFont(), { size: 128 });
    const regular = atlas.glyph("A", resolveFontFace({ family: "test" }), 16)!;
    const bold = atlas.glyph("A", resolveFontFace({ family: "test", weight: 700 }), 16)!;
    expect(bold).not.toBe(regular);
    expect(bold.uv).not.toEqual(regular.uv);
  });

  test("a source that names its own face key is not multiplied by the axes it cannot vary", () => {
    class FixedFaceFont extends SyntheticFont {
      readonly faceKey = (face: FontFace): string => face.family;
    }
    const atlas = new GlyphAtlas(new FixedFaceFont(), { size: 128 });
    const regular = atlas.glyph("A", resolveFontFace({ family: "test" }), 16)!;
    const bold = atlas.glyph("A", resolveFontFace({ family: "test", weight: 700 }), 16)!;
    expect(bold).toBe(regular);
  });
});

describe("recorder text face options", () => {
  test("defaults to weight 400, style normal and width normal", () => {
    const frame = new FrameRecorder();
    frame.text([0, 0, 0], "A");
    const [command] = frame.texts;
    expect(command!.weight).toBe(400);
    expect(command!.style).toBe("normal");
    expect(command!.width).toBe("normal");
    expect(command!.spans[0]).toMatchObject({ weight: 400, style: "normal", width: "normal" });
  });

  test("carries the block's face into its spans and lets a span override one axis", () => {
    const frame = new FrameRecorder();
    frame.text([0, 0, 0], [{ text: "A" }, { text: "B", weight: 900, style: "italic", width: "condensed" }], {
      weight: 600,
      width: "semi-condensed",
    });
    const command = frame.texts[0]!;
    expect(command).toMatchObject({ weight: 600, style: "normal", width: "semi-condensed" });
    expect(command.spans.map((span) => [span.weight, span.style, span.width])).toEqual([
      [600, "normal", "semi-condensed"],
      [900, "italic", "condensed"],
    ]);
  });

  test("takes the face from the recorder defaults when the block names none", () => {
    const frame = new FrameRecorder({ text: { weight: 300, style: "italic", width: "expanded" } });
    frame.text([0, 0, 0], "A");
    expect(frame.texts[0]).toMatchObject({ weight: 300, style: "italic", width: "expanded" });
  });

  test("rejects a weight outside bevy's 1..1000 range", () => {
    const frame = new FrameRecorder();
    expect(() => frame.text([0, 0, 0], "A", { weight: 0 })).toThrow("between 1 and 1000");
    expect(() => frame.text([0, 0, 0], "A", { weight: 1001 })).toThrow("between 1 and 1000");
    expect(() => frame.text([0, 0, 0], "A", { weight: Number.NaN })).toThrow("between 1 and 1000");
    expect(() => frame.text([0, 0, 0], [{ text: "A", weight: 2000 }])).toThrow("span weight");
  });

  test("rejects an unknown style or width", () => {
    const frame = new FrameRecorder();
    expect(() => frame.text([0, 0, 0], "A", { style: "oblique" as never })).toThrow("style must be one of normal, italic");
    expect(() => frame.text([0, 0, 0], "A", { width: "200%" as never })).toThrow("width must be one of");
    expect(() => new FrameRecorder({ text: { width: "narrow" as never } })).toThrow("default text width");
  });
});

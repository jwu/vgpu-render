import { describe, expect, test } from "vitest";
import { commandsToSegments, OutlineGlyphRasterizer } from "../src/text-msdf-font.js";
import { resolveFontFace } from "../src/text-layout.js";

describe("commandsToSegments", () => {
  test("carries control points through and closes an open contour", () => {
    const segments = commandsToSegments(
      [
        { type: "M", x: 0, y: 0 },
        { type: "L", x: 4, y: 0 },
        { type: "Q", x1: 6, y1: 2, x: 4, y: 4 },
        { type: "Z" },
      ],
      0,
      0,
    );
    expect(segments).toHaveLength(3);
    expect(segments[0]).toMatchObject({ from: [0, 0], to: [4, 0] });
    expect(segments[1]).toMatchObject({ control1: [6, 2], to: [4, 4] });
    // `Z` closes the contour back to where the subpath started.
    expect(segments[2]).toMatchObject({ from: [4, 4], to: [0, 0] });
  });

  test("adds no closing edge when the contour already returned", () => {
    const segments = commandsToSegments(
      [
        { type: "M", x: 0, y: 0 },
        { type: "L", x: 4, y: 0 },
        { type: "L", x: 0, y: 0 },
        { type: "Z" },
      ],
      0,
      0,
    );
    expect(segments).toHaveLength(2);
  });

  test("shifts the outline so its ink box starts at the origin", () => {
    const segments = commandsToSegments(
      [
        { type: "M", x: 5, y: -3 },
        { type: "L", x: 9, y: 1 },
      ],
      5,
      -3,
    );
    expect(segments[0]).toMatchObject({ from: [0, 0], to: [4, 4] });
  });
});

const TEST_FACE = resolveFontFace({ family: "test" });

describe("OutlineGlyphRasterizer", () => {
  const font = new OutlineGlyphRasterizer();

  test("reads the bundled face and reports a monospaced advance", () => {
    expect(font.encoding).toBe("msdf");
    // Fira Mono advances 600 per 1000 upem, so every glyph covers 0.6 em.
    expect(font.glyphMetrics("M", TEST_FACE, 32).advance).toBeCloseTo(19.2, 3);
    expect(font.glyphMetrics("i", TEST_FACE, 32).advance).toBeCloseTo(19.2, 3);
  });

  test("takes its vertical metrics from the face", () => {
    const metrics = font.verticalMetrics(TEST_FACE, 32);
    expect(metrics.ascent).toBeGreaterThan(24);
    expect(metrics.ascent).toBeLessThan(40);
    expect(metrics.descent).toBeGreaterThan(0);
  });

  test("encodes a real glyph as a three-channel field", () => {
    const glyph = font.rasterize("M", TEST_FACE, 32);
    expect(glyph).toBeDefined();
    expect(glyph!.width).toBeGreaterThan(4);
    expect(glyph!.height).toBeGreaterThan(8);
    expect(glyph!.texels).toHaveLength(glyph!.width * glyph!.height * 4);
    // Ink hangs above the baseline, so the bearing is negative under the y-down convention.
    expect(glyph!.bearingTop).toBeLessThan(0);
    expect(glyph!.advance).toBeCloseTo(19.2, 3);
    // The middle of an "M" stem is well inside, so red sits above the 128 midpoint.
    const middle = (Math.floor(glyph!.height / 2) * glyph!.width + 1) * 4;
    expect(glyph!.texels[middle]).toBeGreaterThan(128);
  });

  test("has nothing to encode for whitespace", () => {
    expect(font.rasterize(" ", TEST_FACE, 32)).toBeUndefined();
  });
});

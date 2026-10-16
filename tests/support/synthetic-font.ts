/**
 * Deterministic stand-in for the Canvas2D font source.
 *
 * GPU tests run under `vgpu/node`, where Canvas2D does not exist, so the text renderer takes
 * its font through an interface and the tests inject this. Every character rasterises to the
 * same solid box, which makes the advance, the atlas rectangle, the quad placement and the
 * shaded coverage predictable from the font size alone — a real font would make pixel
 * assertions depend on hinting and the browser's own rasteriser.
 */

import type { GlyphMetrics, TextMeasurer, VerticalMetrics } from "../../src/text-layout.js";
import { encodeCoverage, type GlyphEncoding, type GlyphRasterizer, type RasterizedGlyph } from "../../src/text-font.js";
import { DEFAULT_SDF_RANGE } from "../../src/text-sdf.js";

/** Advance and ink box of every synthetic glyph, as fractions of the font size. */
export const ADVANCE_RATIO = 0.6;
export const INK_WIDTH_RATIO = 0.5;
export const INK_HEIGHT_RATIO = 0.5;
export const ASCENT_RATIO = 0.935;
export const DESCENT_RATIO = 0.265;

export class SyntheticFont implements GlyphRasterizer, TextMeasurer {
  readonly encoding: GlyphEncoding;
  readonly rasterScale: number;
  readonly distanceRange = DEFAULT_SDF_RANGE;

  constructor(encoding: GlyphEncoding = "bitmap", rasterScale = 1) {
    this.encoding = encoding;
    this.rasterScale = rasterScale;
  }

  verticalMetrics(_fontFamily: string, fontSize: number): VerticalMetrics {
    return { ascent: fontSize * ASCENT_RATIO, descent: fontSize * DESCENT_RATIO };
  }

  glyphMetrics(character: string, _fontFamily: string, fontSize: number): GlyphMetrics {
    if (character === " " || character === "\t") {
      return { advance: fontSize * ADVANCE_RATIO, width: 0, height: 0, bearingLeft: 0, bearingTop: 0 };
    }
    return {
      advance: fontSize * ADVANCE_RATIO,
      width: fontSize * INK_WIDTH_RATIO,
      height: fontSize * INK_HEIGHT_RATIO,
      bearingLeft: 0,
      // Ink hangs above the baseline by exactly its own height.
      bearingTop: -fontSize * INK_HEIGHT_RATIO,
    };
  }

  rasterize(character: string, fontFamily: string, fontSize: number): RasterizedGlyph | undefined {
    const metrics = this.glyphMetrics(character, fontFamily, fontSize);
    if (!(metrics.width > 0) || !(metrics.height > 0)) return undefined;
    const width = Math.max(1, Math.round(metrics.width));
    const height = Math.max(1, Math.round(metrics.height));
    // A rounded blob with a one-texel anti-aliased rim. A solid box would make the bitmap and
    // distance-field paths indistinguishable, because a hard edge has nothing to interpolate;
    // a rim is exactly what coverage smears across texels and a distance field reconstructs.
    const mask = new Uint8Array(width * height);
    const centreX = (width - 1) / 2;
    const centreY = (height - 1) / 2;
    const radius = Math.min(width, height) / 2 - 0.5;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const edgeDistance = Math.hypot(x - centreX, y - centreY) - radius;
        const coverage = Math.max(0, Math.min(1, 0.5 - edgeDistance));
        mask[y * width + x] = Math.round(coverage * 255);
      }
    }
    // A blob has no edges to colour, so the synthetic MSDF is the single-channel field replicated
    // into RGB. That is enough to exercise the median lookup and the same reconstruction maths.
    const source: "bitmap" | "sdf" = this.encoding === "bitmap" ? "bitmap" : "sdf";
    const texels = encodeCoverage(mask, width, height, source, this.distanceRange);
    if (this.encoding === "msdf") {
      for (let index = 0; index < texels.length; index += 4) {
        texels[index + 1] = texels[index]!;
        texels[index + 2] = texels[index]!;
      }
    }
    return {
      width,
      height,
      texels,
      inkWidth: metrics.width,
      inkHeight: metrics.height,
      bearingLeft: metrics.bearingLeft,
      bearingTop: metrics.bearingTop,
      advance: metrics.advance,
    };
  }
}

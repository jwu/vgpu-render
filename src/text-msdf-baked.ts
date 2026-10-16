/**
 * Prebaked multi-channel distance field glyph source.
 *
 * The counterpart to `OutlineGlyphRasterizer`: instead of parsing a face and running the encoder on
 * the first frame a glyph appears, this reads the atlas that `bun scripts/bake-msdf-atlas.ts`
 * produced and slices each glyph out of it. Nothing here links `opentype.js`, and no encoding ever
 * runs — at the cost of a fixed character set and a payload that ships whether or not it is used.
 *
 * The page travels gzipped, so `load()` has to resolve before any glyph is asked for. Decompression
 * uses the platform `DecompressionStream`, which is why the payload is not a PNG: it keeps the whole
 * path free of image decoding and usable in Node, where the tests run.
 *
 * Because the page stores every glyph at one fixed raster, the metrics it carries are scaled by
 * `fontSize / bakeSize` rather than re-rasterised. That is exactly what makes a distance field worth
 * baking: one set of texels serves every size.
 */

import {
  BAKED_MSDF_ASCENT,
  BAKED_MSDF_BAKE_SIZE,
  BAKED_MSDF_DESCENT,
  BAKED_MSDF_DISTANCE_RANGE,
  BAKED_MSDF_GLYPHS,
  BAKED_MSDF_PAGE_GZIP_BASE64,
  BAKED_MSDF_PAGE_SIZE,
} from "./assets/fira-mono-msdf-atlas.js";
import { decodeBase64Bytes, type GlyphRasterizer, type RasterizedGlyph } from "./text-font.js";
import type { GlyphMetrics, TextMeasurer, VerticalMetrics } from "./text-layout.js";

/** `[u0, v0, u1, v1, bearingLeft, bearingTop, width, height, advance]` at the bake size. */
type BakedGlyph = readonly [number, number, number, number, number, number, number, number, number];

function bakedGlyph(character: string): BakedGlyph | undefined {
  return BAKED_MSDF_GLYPHS[character] as BakedGlyph | undefined;
}

export class BakedMsdfRasterizer implements GlyphRasterizer, TextMeasurer {
  readonly encoding = "msdf" as const;
  readonly distanceRange = BAKED_MSDF_DISTANCE_RANGE;
  readonly bakeSize = BAKED_MSDF_BAKE_SIZE;
  readonly #metrics = new Map<string, GlyphMetrics>();
  #page: Uint8Array | undefined;

  /** True once the page is decompressed and glyphs can be sliced out of it. */
  get ready(): boolean {
    return this.#page !== undefined;
  }

  /** Decompresses the inlined page. Idempotent, so calling it per frame is harmless. */
  async load(): Promise<void> {
    if (this.#page !== undefined) return;
    const compressed = decodeBase64Bytes(BAKED_MSDF_PAGE_GZIP_BASE64);
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
    const buffer = await new Response(stream).arrayBuffer();
    const page = new Uint8Array(buffer);
    const expected = BAKED_MSDF_PAGE_SIZE * BAKED_MSDF_PAGE_SIZE * 4;
    if (page.byteLength !== expected) {
      throw new Error(`the prebaked atlas decompressed to ${page.byteLength} bytes, expected ${expected}`);
    }
    this.#page = page;
  }

  verticalMetrics(_fontFamily: string, fontSize: number): VerticalMetrics {
    const scale = fontSize / BAKED_MSDF_BAKE_SIZE;
    return { ascent: BAKED_MSDF_ASCENT * scale, descent: BAKED_MSDF_DESCENT * scale };
  }

  glyphMetrics(character: string, _fontFamily: string, fontSize: number): GlyphMetrics {
    const key = `${fontSize}|${character}`;
    const cached = this.#metrics.get(key);
    if (cached !== undefined) return cached;
    const baked = bakedGlyph(character);
    const scale = fontSize / BAKED_MSDF_BAKE_SIZE;
    const value: GlyphMetrics = baked === undefined
      ? { advance: 0, width: 0, height: 0, bearingLeft: 0, bearingTop: 0 }
      : {
          advance: baked[8] * scale,
          width: baked[6] * scale,
          height: baked[7] * scale,
          bearingLeft: baked[4] * scale,
          bearingTop: baked[5] * scale,
        };
    this.#metrics.set(key, value);
    return value;
  }

  rasterize(character: string, fontFamily: string, fontSize: number): RasterizedGlyph | undefined {
    const page = this.#page;
    if (page === undefined) throw new Error("BakedMsdfRasterizer.load() must resolve before glyphs are requested");
    const baked = bakedGlyph(character);
    if (baked === undefined) return undefined;

    const pageSize = BAKED_MSDF_PAGE_SIZE;
    const left = Math.round(baked[0] * pageSize);
    const top = Math.round(baked[1] * pageSize);
    const width = Math.round((baked[2] - baked[0]) * pageSize);
    const height = Math.round((baked[3] - baked[1]) * pageSize);
    // Whitespace is in the table for its advance, but there is no ink box to slice out of the page.
    if (width <= 0 || height <= 0) return undefined;

    const texels = new Uint8Array(width * height * 4);
    for (let row = 0; row < height; row++) {
      const from = ((top + row) * pageSize + left) * 4;
      texels.set(page.subarray(from, from + width * 4), row * width * 4);
    }

    // The texels stay at their baked size; only the placement scales with the requested font size.
    const scale = fontSize / BAKED_MSDF_BAKE_SIZE;
    const metrics = this.glyphMetrics(character, fontFamily, fontSize);
    return {
      width,
      height,
      texels,
      // The bake carries the ink box at the bake size, which is what the atlas has to map.
      inkWidth: baked[6],
      inkHeight: baked[7],
      bearingLeft: metrics.bearingLeft,
      bearingTop: metrics.bearingTop,
      advance: metrics.advance,
    };
  }
}

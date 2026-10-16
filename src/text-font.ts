/**
 * Browser-side font loading and glyph rasterisation for the text renderer.
 *
 * bevy rasterises glyphs with swash into a `FontAtlas`
 * (`crates/bevy_text/src/font_atlas.rs`); the equivalent rasteriser in a browser is
 * Canvas2D, so `fillText` plays the role of `swash::scale::Render` and the browser's font
 * stack stands in for font discovery. The bundled font is inlined exactly the way bevy
 * inlines `FiraMono-subset.ttf` with `include_bytes!`, so nothing is fetched at runtime.
 *
 * The subset deliberately has no CJK coverage; pass a different family through the text
 * options when those are needed.
 *
 * Everything here is browser-only. Layout depends on the `TextMeasurer` interface alone, so
 * unit tests keep running in plain Node, and the GPU tests inject their own rasteriser.
 */

import { FIRA_MONO_MEDIUM_SUBSET_BASE64, FIRA_MONO_MEDIUM_SUBSET_TTF_BASE64 } from "./assets/fira-mono-medium-subset.js";
import { coverageToSdf, DEFAULT_SDF_RANGE } from "./text-sdf.js";
import type { GlyphMetrics, TextMeasurer, VerticalMetrics } from "./text-layout.js";

/**
 * How a glyph is stored in the atlas, and therefore how the shader has to decode it.
 *
 * - `bitmap` keeps the anti-aliased coverage bevy's `FontAtlas` uses: RGB 255, coverage in alpha.
 *   What was rasterised is what is drawn, and no amount of scaling can recover more edge detail.
 * - `sdf` stores a signed distance in red. One channel means sharp corners round off, but the
 *   fragment stage rebuilds the edge from the distance, so it stays sharp at any magnification.
 * - `msdf` stores a per-edge signed distance in RGB. The extra channels preserve corners, at the
 *   cost of three times the atlas area and a median — rather than a single — channel lookup.
 *
 * Both distance encodings put the *true* distance to the shape in alpha (msdfgen's `mtsdf` layout),
 * which is what a block's outline reads: the median that preserves a corner cannot also place a
 * ring around it. `bitmap` has no distance to give, so its outline is sampled instead.
 */
export type GlyphEncoding = "bitmap" | "sdf" | "msdf";

/**
 * Family name the bundled font is registered under. It is deliberately not `"Fira Mono"` so
 * a locally installed face can never shadow the inlined one.
 */
export const DEFAULT_FONT_FAMILY = "vgpu-render-fira-mono";

/**
 * Fira Mono's hhea metrics are 935 / -265 per 1000 upem, i.e. exactly the 1.2 em line box
 * bevy's default `LineHeight` assumes. They are the fallback when a browser reports no font
 * bounding box.
 */
const FALLBACK_ASCENT_RATIO = 0.935;
const FALLBACK_DESCENT_RATIO = 0.265;

const INITIAL_SURFACE_SIZE = 256;

/** Decodes a base64 payload into bytes. Shared by the inlined font and the prebaked atlas. */
export function decodeBase64Bytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Decodes the inlined WOFF2 bytes of the bundled font, which is what `FontFace` takes. */
export function decodeEmbeddedFont(): Uint8Array<ArrayBuffer> {
  return decodeBase64Bytes(FIRA_MONO_MEDIUM_SUBSET_BASE64);
}

/**
 * Decodes the inlined TrueType bytes of the same subset. The outline-based encoders need this one:
 * `opentype.js` reads glyph outlines, and it cannot decompress the WOFF2 container.
 */
export function decodeEmbeddedTrueTypeFont(): Uint8Array<ArrayBuffer> {
  return decodeBase64Bytes(FIRA_MONO_MEDIUM_SUBSET_TTF_BASE64);
}

let defaultFont: Promise<void> | undefined;

/**
 * Registers the bundled font with the document, once per page. Measuring or drawing with
 * `DEFAULT_FONT_FAMILY` before this resolves falls back to another face, so await it before
 * the first frame that draws text.
 */
export function loadDefaultFont(): Promise<void> {
  defaultFont ??= registerDefaultFont();
  return defaultFont;
}

async function registerDefaultFont(): Promise<void> {
  const fonts = typeof document === "undefined" ? undefined : document.fonts;
  if (fonts === undefined || typeof FontFace === "undefined") {
    throw new Error("loading the bundled text font requires a browser environment");
  }
  const face = new FontFace(DEFAULT_FONT_FAMILY, decodeEmbeddedFont());
  await face.load();
  fonts.add(face);
}

/** One rasterised character: the texels to pack plus the placement swash would have reported. */
export type RasterizedGlyph = {
  readonly width: number;
  readonly height: number;
  /**
   * Tightly packed RGBA8 texels, `width * height * 4` bytes.
   *
   * The layout is the encoding's business rather than the atlas': the bitmap path writes a
   * tintable alpha mask, and the distance-field paths write distances into the channels a shader
   * knows how to decode. Keeping the encoding here means the atlas only packs and copies texels,
   * which is what lets prebaked and on-demand glyph sources share one atlas.
   */
  readonly texels: Uint8Array;
  /**
   * The ink box inside those texels, which is up to a texel smaller than the image: the box is
   * rounded up so no edge coverage is lost, and the atlas has to map only the ink part. Mapping the
   * whole image would rescale the glyph by that fraction — invisible for interpolated coverage, but
   * a visible slimming of every stem once a distance field reconstructs the edge.
   */
  readonly inkWidth: number;
  readonly inkHeight: number;
  readonly bearingLeft: number;
  readonly bearingTop: number;
  readonly advance: number;
};

/** Rasterises characters for the glyph atlas. */
export interface GlyphRasterizer {
  /** The encoding every glyph this source returns is written in. */
  readonly encoding: GlyphEncoding;
  /**
   * Distance in atlas texels that a distance-field encoding covers either side of the edge, which
   * the shader needs in order to decode it. Unused by `bitmap`.
   */
  readonly distanceRange?: number;
  /**
   * Default rasterisation scale for this source: a request that names no scale of its own is
   * rasterised at `fontSize × rasterScale` texels while layout and quads stay in font pixels.
   * Larger costs atlas area quadratically and keeps a magnified block from showing the texel grid
   * its distance field was reconstructed from.
   *
   * It belongs to the source rather than to the renderer because two sources of the same encoding
   * can coexist in one frame — which is exactly what a side-by-side quality comparison needs. The
   * renderer overrides it per block with the size the block occupies on screen; see `text-raster`.
   */
  readonly rasterScale?: number;
  /**
   * Whether the source can rasterise at whatever size the renderer asks for.
   *
   * A source that reads outlines or a Canvas2D face can, so the renderer hands it the size the block
   * covers on screen and the glyph stays sharp at every font size. A prebaked page cannot: its glyphs
   * were rasterised once at a fixed size, so the renderer leaves it on `rasterScale` instead.
   */
  readonly dynamicRaster?: boolean;
  /**
   * Returns `undefined` for characters with no ink, such as whitespace.
   *
   * `rasterSize` is the size in texels the glyph is rasterised at, which is *not* the layout font
   * size: the atlas asks for the size the glyph will cover on screen, so the same character stays
   * sharp at any font size while still being rasterised once per size rung.
   */
  rasterize(character: string, fontFamily: string, rasterSize: number): RasterizedGlyph | undefined;
  /** Vertical metrics for a `fontSize`-sized face of `fontFamily`. */
  verticalMetrics(fontFamily: string, fontSize: number): VerticalMetrics;
}

/** Encodings Canvas2D coverage can produce directly. `msdf` needs outlines, not a mask. */
export type CoverageEncoding = Exclude<GlyphEncoding, "msdf">;

type Surface = {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
};

/**
 * Canvas2D glyph source, doubling as the layout `TextMeasurer` so the canvas is only set up
 * once per canvas-configured face and every `measureText` result is cached.
 *
 * Metrics follow Canvas2D's convention: the pen sits at the origin and the baseline is y = 0
 * with y growing downwards. `actualBoundingBoxLeft` is a *leftward* distance, so a glyph that
 * starts right of the pen reports a negative value — negating it yields the ink's left edge
 * in pen space, which is what the atlas stores.
 */
export class CanvasGlyphRasterizer implements GlyphRasterizer, TextMeasurer {
  readonly encoding: CoverageEncoding;
  readonly distanceRange: number;
  readonly rasterScale: number;
  /**
   * Whether the renderer drives this source's raster size from the size a block covers on screen.
   * A Canvas2D face can be asked for any size, so it defaults to `true`; a source that needs a fixed
   * raster — a pixel-accurate comparison against another renderer, say — turns it off.
   */
  readonly dynamicRaster: boolean;
  #surface: Surface | undefined;
  readonly #metrics = new Map<string, GlyphMetrics>();
  readonly #vertical = new Map<string, VerticalMetrics>();

  constructor(options: { encoding?: CoverageEncoding; distanceRange?: number; rasterScale?: number; dynamicRaster?: boolean } = {}) {
    this.encoding = options.encoding ?? "bitmap";
    this.distanceRange = options.distanceRange ?? DEFAULT_SDF_RANGE;
    this.rasterScale = options.rasterScale ?? 1;
    this.dynamicRaster = options.dynamicRaster ?? true;
  }

  #ensureSurface(): Surface {
    if (this.#surface === undefined) {
      if (typeof document === "undefined") {
        throw new Error("glyph rasterisation requires a browser environment");
      }
      const canvas = document.createElement("canvas");
      canvas.width = INITIAL_SURFACE_SIZE;
      canvas.height = INITIAL_SURFACE_SIZE;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context === null) throw new Error("a 2D canvas context is required to rasterise glyphs");
      this.#surface = { canvas, context };
    }
    return this.#surface;
  }

  #font(fontFamily: string, fontSize: number): string {
    return `${fontSize}px "${fontFamily}"`;
  }

  verticalMetrics(fontFamily: string, fontSize: number): VerticalMetrics {
    const key = `${fontFamily}|${fontSize}`;
    const cached = this.#vertical.get(key);
    if (cached !== undefined) return cached;
    const context = this.#ensureSurface().context;
    context.font = this.#font(fontFamily, fontSize);
    const metrics = context.measureText("M");
    const ascent = metrics.fontBoundingBoxAscent > 0 ? metrics.fontBoundingBoxAscent : fontSize * FALLBACK_ASCENT_RATIO;
    const descent = metrics.fontBoundingBoxDescent > 0 ? metrics.fontBoundingBoxDescent : fontSize * FALLBACK_DESCENT_RATIO;
    const value = { ascent, descent };
    this.#vertical.set(key, value);
    return value;
  }

  glyphMetrics(character: string, fontFamily: string, fontSize: number): GlyphMetrics {
    const key = `${fontFamily}|${fontSize}|${character}`;
    const cached = this.#metrics.get(key);
    if (cached !== undefined) return cached;
    const context = this.#ensureSurface().context;
    context.font = this.#font(fontFamily, fontSize);
    const metrics = context.measureText(character);
    const bearingLeft = -metrics.actualBoundingBoxLeft;
    const value: GlyphMetrics = {
      advance: metrics.width,
      width: metrics.actualBoundingBoxRight - bearingLeft,
      height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent,
      bearingLeft,
      bearingTop: -metrics.actualBoundingBoxAscent,
    };
    this.#metrics.set(key, value);
    return value;
  }

  rasterize(character: string, fontFamily: string, rasterSize: number): RasterizedGlyph | undefined {
    // The raster size *is* the face size here: `measureText` and the fill both work in the texels the
    // atlas will store, and the layout's own measurements never pass through this path.
    const glyph = this.glyphMetrics(character, fontFamily, rasterSize);
    if (!(glyph.width > 0) || !(glyph.height > 0)) return undefined;
    // The ink box is fractional; the mask rounds up so no edge pixel is lost.
    const width = Math.max(1, Math.ceil(glyph.width));
    const height = Math.max(1, Math.ceil(glyph.height));
    const { canvas, context } = this.#ensureSurface();
    if (canvas.width < width || canvas.height < height) {
      canvas.width = Math.max(canvas.width, width);
      canvas.height = Math.max(canvas.height, height);
    }
    context.clearRect(0, 0, width, height);
    context.font = this.#font(fontFamily, rasterSize);
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    context.fillStyle = "#fff";
    // Place the pen so the ink box starts at (0, 0): the baseline sits `-bearingTop` down.
    context.fillText(character, -glyph.bearingLeft, -glyph.bearingTop);
    const pixels = context.getImageData(0, 0, width, height).data;
    const coverage = new Uint8Array(width * height);
    for (let index = 0; index < coverage.length; index++) coverage[index] = pixels[index * 4 + 3]!;
    return {
      width,
      height,
      texels: encodeCoverage(coverage, width, height, this.encoding, this.distanceRange),
      inkWidth: glyph.width,
      inkHeight: glyph.height,
      bearingLeft: glyph.bearingLeft,
      bearingTop: glyph.bearingTop,
      advance: glyph.advance,
    };
  }
}

/** Packs Canvas2D coverage into the RGBA layout the chosen encoding expects. */
export function encodeCoverage(coverage: Uint8Array, width: number, height: number, encoding: CoverageEncoding, range: number): Uint8Array {
  const texels = new Uint8Array(coverage.length * 4);
  if (encoding === "bitmap") {
    // A tintable alpha mask: RGB stays 255 so the shader can colour it.
    for (let index = 0; index < coverage.length; index++) {
      const target = index * 4;
      texels[target] = 255;
      texels[target + 1] = 255;
      texels[target + 2] = 255;
      texels[target + 3] = coverage[index]!;
    }
    return texels;
  }
  // A signed distance in red, and the same distance in alpha so the shader can outline the glyph.
  // It comes from the mask's coverage rather than from the outline, which makes it a little coarser
  // than the msdf encoder's — fine for a ring, not what the edge itself is rebuilt from.
  const field = coverageToSdf(coverage, width, height, range);
  for (let index = 0; index < field.length; index++) {
    const target = index * 4;
    texels[target] = field[index]!;
    texels[target + 3] = field[index]!;
  }
  return texels;
}

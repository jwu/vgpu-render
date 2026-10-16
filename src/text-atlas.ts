/**
 * Glyph atlas for the text renderer.
 *
 * The equivalent of bevy's `FontAtlas` / `FontAtlasSet`
 * (`crates/bevy_text/src/font_atlas.rs`, `font_atlas_set.rs`): rasterised glyphs are packed
 * into one or more pages and remembered by their atlas rectangle plus the ink offset that
 * places them relative to the pen. bevy stores every glyph as a tintable alpha mask
 * (RGB = 255, A = coverage) so the shader can colour it, and uses a minimum 512 px page with
 * 2 px of padding; both choices are kept here, since the padding is what keeps linear
 * sampling from bleeding between neighbours.
 *
 * Unlike bevy the atlas is not keyed per font size: the cache key carries the family and size
 * instead, so one page set serves every size a frame happens to use. Glyphs are rasterised at
 * `rasterScale` times their font size, which decouples the atlas' detail from the logical layout
 * size — the same separation as resampling a font at a higher point size before scaling it down.
 * Pages grow on demand until `maxPages` is reached — the GPU renderer pins that at one page so a
 * single draw call covers the whole atlas — and a `revision` counter tells the renderer which of
 * them changed since the last upload.
 */

import type { GlyphEncoding, GlyphRasterizer } from "./text-font.js";

/** Page size and inter-glyph padding, matching bevy's minimum atlas and `GLYPH_ATLAS_PADDING`. */
export const DEFAULT_ATLAS_SIZE = 512;
export const DEFAULT_ATLAS_PADDING = 2;

/** Re-exported so a caller can name an encoding without reaching into the font module. */
export type { GlyphEncoding };

/** Where one glyph lives in the atlas, plus the metrics needed to place its quad. */
export type AtlasGlyph = {
  readonly page: number;
  /** Normalized ink rectangle `[u0, v0, u1, v1]`, v measured downwards from the page's first row. */
  readonly uv: readonly [number, number, number, number];
  /** Ink box left edge relative to the pen, y down. */
  readonly bearingLeft: number;
  /** Ink box top edge relative to the baseline, y down. */
  readonly bearingTop: number;
  /** Ink box size in the units the glyph was measured in. */
  readonly width: number;
  readonly height: number;
  readonly advance: number;
};

/** One RGBA8 page. `revision` is bumped on every write so the renderer can upload lazily. */
export type AtlasPage = {
  readonly index: number;
  readonly size: number;
  /** Tightly packed RGBA8 rows, `size * size * 4` bytes. */
  readonly data: Uint8Array;
  revision: number;
};

type Shelf = {
  readonly y: number;
  readonly height: number;
  used: number;
};

type PagePacking = {
  nextY: number;
  readonly shelves: Shelf[];
};

export class GlyphAtlas {
  readonly #rasterizer: GlyphRasterizer;
  readonly #size: number;
  readonly #padding: number;
  readonly #maxPages: number;
  readonly #pages: AtlasPage[] = [];
  readonly #packing: PagePacking[] = [];
  readonly #glyphs = new Map<string, AtlasGlyph>();
  readonly #missing = new Set<string>();

  constructor(rasterizer: GlyphRasterizer, options: { size?: number; padding?: number; maxPages?: number } = {}) {
    this.#rasterizer = rasterizer;
    this.#size = options.size ?? DEFAULT_ATLAS_SIZE;
    this.#padding = options.padding ?? DEFAULT_ATLAS_PADDING;
    this.#maxPages = options.maxPages ?? Number.POSITIVE_INFINITY;
    if (!Number.isInteger(this.#size) || this.#size <= 0) throw new RangeError("atlas size must be a positive integer");
    if (!Number.isInteger(this.#padding) || this.#padding < 0) throw new RangeError("atlas padding must be a non-negative integer");
    if (this.#maxPages < 1) throw new RangeError("atlas maxPages must be at least one");
    if (!(this.rasterScale > 0)) throw new RangeError("the glyph source's rasterScale must be greater than zero");
  }

  /** The encoding the glyph source writes, which is also how the shader will decode the page. */
  get encoding(): GlyphEncoding {
    return this.#rasterizer.encoding;
  }

  /** The distance range the source encodes with, if it uses a distance field at all. */
  get distanceRange(): number | undefined {
    return this.#rasterizer.distanceRange;
  }

  /** How much larger the source's texels are than layout units. See `GlyphRasterizer.rasterScale`. */
  get rasterScale(): number {
    return this.#rasterizer.rasterScale ?? 1;
  }

  get pages(): readonly AtlasPage[] {
    return this.#pages;
  }

  /**
   * Returns the atlas entry for a character, rasterising and packing it on first use.
   * `undefined` means the character has no ink (whitespace) or the rasteriser has nothing for
   * it; the layout layer has already dropped those glyphs, so callers treat it as a skip.
   */
  glyph(character: string, fontFamily: string, fontSize: number): AtlasGlyph | undefined {
    const key = `${fontFamily}|${fontSize}|${character}`;
    const cached = this.#glyphs.get(key);
    if (cached !== undefined) return cached;
    if (this.#missing.has(key)) return undefined;
    const rasterized = this.#rasterizer.rasterize(character, fontFamily, fontSize * this.rasterScale);
    if (rasterized === undefined) {
      this.#missing.add(key);
      return undefined;
    }
    const placement = this.#pack(rasterized.width, rasterized.height);
    const page = this.#pages[placement.page]!;
    this.#blit(page, placement.x, placement.y, rasterized.width, rasterized.height, rasterized.texels);
    const glyph: AtlasGlyph = {
      page: placement.page,
      // Only the ink box is mapped, not the rounded-up image, so the quad and the texels agree.
      uv: [
        placement.x / this.#size,
        placement.y / this.#size,
        (placement.x + rasterized.inkWidth) / this.#size,
        (placement.y + rasterized.inkHeight) / this.#size,
      ],
      bearingLeft: rasterized.bearingLeft,
      bearingTop: rasterized.bearingTop,
      width: rasterized.inkWidth,
      height: rasterized.inkHeight,
      advance: rasterized.advance,
    };
    this.#glyphs.set(key, glyph);
    return glyph;
  }

  /** Drops every cached glyph. The next frame re-rasterises whatever it still draws. */
  clear(): void {
    this.#glyphs.clear();
    this.#missing.clear();
    for (const page of this.#pages) {
      page.data.fill(0);
      page.revision++;
    }
    for (const packing of this.#packing) {
      packing.nextY = 0;
      packing.shelves.length = 0;
    }
  }

  #createPage(): number {
    const index = this.#pages.length;
    this.#pages.push({ index, size: this.#size, data: new Uint8Array(this.#size * this.#size * 4), revision: 0 });
    this.#packing.push({ nextY: 0, shelves: [] });
    return index;
  }

  /**
   * Shelf packing: glyphs fill a row until it runs out of width, then a new row starts below.
   * bevy uses a rectangle packer, but for the handful of sizes a debug frame draws, shelves
   * waste little and keep placement deterministic.
   */
  #pack(width: number, height: number): { page: number; x: number; y: number } {
    const w = width + this.#padding;
    const h = height + this.#padding;
    if (w > this.#size || h > this.#size) {
      throw new RangeError(`a ${width}×${height} glyph does not fit a ${this.#size}px atlas page`);
    }
    for (let index = 0; index < this.#pages.length; index++) {
      const placement = packInto(this.#packing[index]!, w, h, this.#size);
      if (placement !== undefined) return { page: index, x: placement.x, y: placement.y };
    }
    if (this.#pages.length >= this.#maxPages) {
      throw new RangeError(`the glyph atlas is full: ${this.#pages.length} page(s) of ${this.#size}px no longer fit a new glyph; raise the atlas size`);
    }
    const index = this.#createPage();
    const placement = packInto(this.#packing[index]!, w, h, this.#size);
    // `#createPage` starts from an empty page, and the size check above proved the glyph fits.
    return { page: index, x: placement!.x, y: placement!.y };
  }

  /** Copies one glyph's texels into the page. The encoding is already baked into them. */
  #blit(page: AtlasPage, x: number, y: number, width: number, height: number, texels: Uint8Array): void {
    const rowBytes = page.size * 4;
    const glyphRowBytes = width * 4;
    for (let row = 0; row < height; row++) {
      page.data.set(texels.subarray(row * glyphRowBytes, (row + 1) * glyphRowBytes), (y + row) * rowBytes + x * 4);
    }
    page.revision++;
  }
}

/**
 * Box-downsamples one mip level: every output texel averages its 2×2 source block, clamped at the
 * edge. The page is a tintable mask — RGB is a constant 255 and all the signal sits in the coverage
 * channel — so averaging is exactly the right minification filter here. A distance field would need
 * the usual distance-compression trick instead, which is why an encoder that stores one keeps its
 * own resampling.
 */
export function downsamplePage(data: Uint8Array, size: number): Uint8Array {
  const half = Math.max(1, size >> 1);
  const result = new Uint8Array(half * half * 4);
  for (let y = 0; y < half; y++) {
    for (let x = 0; x < half; x++) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let dy = 0; dy < 2; dy++) {
        const sourceY = Math.min(y * 2 + dy, size - 1);
        for (let dx = 0; dx < 2; dx++) {
          const sourceX = Math.min(x * 2 + dx, size - 1);
          const index = (sourceY * size + sourceX) * 4;
          red += data[index]!;
          green += data[index + 1]!;
          blue += data[index + 2]!;
          alpha += data[index + 3]!;
        }
      }
      const target = (y * half + x) * 4;
      result[target] = Math.round(red / 4);
      result[target + 1] = Math.round(green / 4);
      result[target + 2] = Math.round(blue / 4);
      result[target + 3] = Math.round(alpha / 4);
    }
  }
  return result;
}

/** One level of a page's mip chain, level 0 being the page itself. */
export type MipLevel = {
  readonly size: number;
  readonly data: Uint8Array;
};

/** Builds a square page's mip chain, stopping early at 1×1 or once `levels` are reached. */
export function buildMipChain(data: Uint8Array, size: number, levels: number): readonly MipLevel[] {
  const chain: MipLevel[] = [{ size, data }];
  let current = data;
  let currentSize = size;
  while (chain.length < levels && currentSize > 1) {
    current = downsamplePage(current, currentSize);
    currentSize = Math.max(1, currentSize >> 1);
    chain.push({ size: currentSize, data: current });
  }
  return chain;
}

/**
 * Pads one mip level's rows to WebGPU's 256 byte `bytesPerRow` requirement, which only binds once a
 * level has more than one row (2×2 and up). Levels needing this are a few hundred bytes, so the
 * extra copy is not worth avoiding.
 */
export function padMipRows(data: Uint8Array, size: number): { readonly data: Uint8Array; readonly bytesPerRow: number } {
  const rowBytes = size * 4;
  if (rowBytes % 256 === 0) return { data, bytesPerRow: rowBytes };
  const stride = Math.ceil(rowBytes / 256) * 256;
  const padded = new Uint8Array(stride * size);
  for (let row = 0; row < size; row++) {
    padded.set(data.subarray(row * rowBytes, (row + 1) * rowBytes), row * stride);
  }
  return { data: padded, bytesPerRow: stride };
}

function packInto(packing: PagePacking, w: number, h: number, size: number): { x: number; y: number } | undefined {
  for (const shelf of packing.shelves) {
    if (shelf.height >= h && shelf.used + w <= size) {
      const x = shelf.used;
      shelf.used += w;
      return { x, y: shelf.y };
    }
  }
  if (packing.nextY + h > size) return undefined;
  const y = packing.nextY;
  packing.shelves.push({ y, height: h, used: w });
  packing.nextY += h;
  return { x: 0, y };
}

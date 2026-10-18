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
 * Unlike bevy the atlas is not keyed per font size: the cache key carries the face and size
 * instead, so one page set serves every size a frame happens to use. The face part comes from
 * `GlyphRasterizer.faceKey`, which is how a source states which of the axes it can actually vary.
 * Glyphs are rasterised at `rasterScale` times their font size, which decouples the atlas' detail from the logical layout
 * size — the same separation as resampling a font at a higher point size before scaling it down.
 * Pages grow on demand until `maxPages` is reached — the GPU renderer pins that at one page so a
 * single draw call covers the whole atlas — and a `revision` counter tells the renderer which of
 * them changed since the last upload.
 */

import { fontFaceKey, type FontFace } from "./text-layout.js";
import type { GlyphEncoding, GlyphRasterizer } from "./text-font.js";

/** Page size and inter-glyph padding, matching bevy's minimum atlas and `GLYPH_ATLAS_PADDING`. */
export const DEFAULT_ATLAS_SIZE = 512;
export const DEFAULT_ATLAS_PADDING = 2;

/** Re-exported so a caller can name an encoding without reaching into the font module. */
export type { GlyphEncoding };

/**
 * Which channels hold a distance, per encoding. A mip chain has to resample those through coverage
 * rather than averaging the values; everything else in a texel is signal that averages.
 */
export const DISTANCE_CHANNELS: Record<GlyphEncoding, readonly number[]> = {
  bitmap: [],
  sdf: [0],
  msdf: [0, 1, 2],
};

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
  /**
   * Texels per layout font pixel this entry was rasterised at, `rasterPx / fontSize`. One atlas holds
   * entries from several rungs of the raster ladder, so the shader reads the ratio per glyph rather
   * than from a constant; it is what converts a font-pixel outline width into sampled texels.
   */
  readonly rasterScale: number;
  /** Frame this glyph was last requested in. Glyphs older than the current frame are recyclable. */
  lastFrame: number;
  /** Packed rectangle in page texels, padding included, so eviction can hand the space back. */
  readonly atlasX: number;
  readonly atlasY: number;
  readonly atlasWidth: number;
  readonly atlasHeight: number;
};

/** Texel rectangle of a page that changed since the renderer last copied it to the GPU. */
export type AtlasDirtyRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/** One RGBA8 page. `revision` is bumped on every write so the renderer can upload lazily. */
export type AtlasPage = {
  readonly index: number;
  readonly size: number;
  /** Tightly packed RGBA8 rows, `size * size * 4` bytes. */
  readonly data: Uint8Array;
  revision: number;
  /**
   * Union of every rectangle written since the last upload, or `undefined` when the page is clean
   * on the GPU. One glyph costs a few hundred bytes to upload instead of a whole page.
   */
  dirty: AtlasDirtyRect | undefined;
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
  readonly #onFull: "throw" | "skip";
  #skipped = 0;
  readonly #pages: AtlasPage[] = [];
  readonly #packing: PagePacking[] = [];
  readonly #glyphs = new Map<string, AtlasGlyph>();
  readonly #missing = new Set<string>();
  /** Cache keys per page, so a page can be recycled as a whole when every glyph on it is stale. */
  readonly #pageGlyphs: Set<string>[] = [];
  /** Rectangles handed back by recycling a single stale glyph, reusable for later ones. */
  readonly #free: ({ readonly page: number } & AtlasDirtyRect)[] = [];
  #frame = 0;

  constructor(
    rasterizer: GlyphRasterizer,
    options: { size?: number; padding?: number; maxPages?: number; onFull?: "throw" | "skip" } = {},
  ) {
    this.#rasterizer = rasterizer;
    this.#size = options.size ?? DEFAULT_ATLAS_SIZE;
    this.#padding = options.padding ?? DEFAULT_ATLAS_PADDING;
    this.#maxPages = options.maxPages ?? Number.POSITIVE_INFINITY;
    this.#onFull = options.onFull ?? "throw";
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
   * Glyphs dropped because the atlas was full and no page could be recycled, which only happens when
   * the caller chose `onFull: "skip"`. A renderer reports it so a frame that is quietly missing a
   * character can be told apart from one the font never had.
   */
  get skipped(): number {
    return this.#skipped;
  }

  /**
   * Marks the start of a frame. Glyphs that were not requested in the current frame become
   * recyclable, so a bounded atlas stops being a hard failure once on-screen text changes shape.
   * Call it once per frame, before the frame's glyphs are requested.
   */
  beginFrame(): void {
    this.#frame++;
  }

  /**
   * Returns the atlas entry for a character, rasterising and packing it on first use.
   * `undefined` means the character has no ink (whitespace) or the rasteriser has nothing for
   * it; the layout layer has already dropped those glyphs, so callers treat it as a skip.
   *
   * `rasterScale` defaults to the source's own scale, which keeps a fixed-raster source drawing
   * exactly as it did. The renderer passes the size the block covers on screen instead, so the entry
   * that comes back is rasterised for the rung that face asked for.
   */
  glyph(character: string, face: FontFace, fontSize: number, rasterScale?: number): AtlasGlyph | undefined {
    const scale = rasterScale !== undefined && rasterScale > 0 ? rasterScale : this.rasterScale;
    // The key carries the size the glyph was *rasterised* at rather than the layout font size: two
    // font sizes that land on the same rung share one rasterisation, which is what keeps a block
    // whose size changes every frame from rasterising the same character over and over.
    const rasterPx = Math.max(1, Math.round(fontSize * scale));
    const faceKey = this.#rasterizer.faceKey?.(face) ?? fontFaceKey(face);
    const key = `${faceKey}|${rasterPx}|${character}`;
    const cached = this.#glyphs.get(key);
    if (cached !== undefined) {
      cached.lastFrame = this.#frame;
      return cached;
    }
    if (this.#missing.has(key)) return undefined;
    const rasterized = this.#rasterizer.rasterize(character, face, rasterPx);
    if (rasterized === undefined) {
      this.#missing.add(key);
      return undefined;
    }
    const placement = this.#pack(rasterized.width, rasterized.height);
    if (placement === undefined) {
      if (this.#onFull === "throw") {
        throw new RangeError(`the glyph atlas is full: ${this.#pages.length} page(s) of ${this.#size}px no longer fit a new glyph; raise the atlas size or the page count`);
      }
      // Capacity, not the font: the next frame may have room again, so this is not cached as missing.
      this.#skipped++;
      return undefined;
    }
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
      rasterScale: rasterPx / fontSize,
      lastFrame: this.#frame,
      atlasX: placement.x,
      atlasY: placement.y,
      atlasWidth: rasterized.width,
      atlasHeight: rasterized.height,
    };
    this.#glyphs.set(key, glyph);
    this.#pageGlyphs[placement.page]!.add(key);
    return glyph;
  }

  /** Drops every cached glyph. The next frame re-rasterises whatever it still draws. */
  clear(): void {
    this.#glyphs.clear();
    this.#missing.clear();
    this.#free.length = 0;
    for (const keys of this.#pageGlyphs) keys.clear();
    for (const page of this.#pages) {
      page.data.fill(0);
      page.revision++;
      // Blanking the whole page is a full-page upload, not a few dirty rectangles.
      page.dirty = { x: 0, y: 0, width: page.size, height: page.size };
    }
    for (const packing of this.#packing) {
      packing.nextY = 0;
      packing.shelves.length = 0;
    }
  }

  #createPage(): number {
    const index = this.#pages.length;
    this.#pages.push({ index, size: this.#size, data: new Uint8Array(this.#size * this.#size * 4), revision: 0, dirty: undefined });
    this.#packing.push({ nextY: 0, shelves: [] });
    this.#pageGlyphs.push(new Set());
    return index;
  }

  /**
   * Blanks a page whose glyphs were all requested in an earlier frame and returns its index, or
   * `undefined` when no page is entirely stale. Recycling a whole page resets its shelf packing,
   * which is what makes it the preferred path over handing single rectangles back.
   */
  #recyclePage(): number | undefined {
    let victim = -1;
    let oldest = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this.#pages.length; index++) {
      let newest = -1;
      for (const key of this.#pageGlyphs[index]!) {
        const entry = this.#glyphs.get(key);
        if (entry !== undefined && entry.lastFrame > newest) newest = entry.lastFrame;
      }
      if (newest >= this.#frame) continue;
      if (newest < oldest) {
        oldest = newest;
        victim = index;
      }
    }
    if (victim === -1) return undefined;
    const page = this.#pages[victim]!;
    page.data.fill(0);
    page.revision++;
    page.dirty = { x: 0, y: 0, width: page.size, height: page.size };
    const packing = this.#packing[victim]!;
    packing.nextY = 0;
    packing.shelves.length = 0;
    for (const key of this.#pageGlyphs[victim]!) this.#glyphs.delete(key);
    this.#pageGlyphs[victim]!.clear();
    return victim;
  }

  /**
   * Falls back to recycling single stale glyphs, oldest first, until one of their rectangles can
   * hold the new glyph. This is what covers a page that mixes glyphs from the current frame with
   * ones from earlier frames: the whole page cannot be blanked, but the stale part can be reused.
   */
  #recycleGlyphs(w: number, h: number): { page: number; x: number; y: number } | undefined {
    const stale: { key: string; glyph: AtlasGlyph }[] = [];
    for (const [key, glyph] of this.#glyphs) {
      if (glyph.lastFrame < this.#frame) stale.push({ key, glyph });
    }
    if (stale.length === 0) return undefined;
    stale.sort((a, b) => a.glyph.lastFrame - b.glyph.lastFrame);
    for (const { key, glyph } of stale) {
      this.#release(key, glyph);
      const placement = this.#takeFree(w, h);
      if (placement !== undefined) return placement;
    }
    return undefined;
  }

  /** Hands one glyph's packed rectangle back, sized to include the packing padding. */
  #release(key: string, glyph: AtlasGlyph): void {
    this.#glyphs.delete(key);
    this.#pageGlyphs[glyph.page]!.delete(key);
    this.#free.push({
      page: glyph.page,
      x: glyph.atlasX,
      y: glyph.atlasY,
      width: glyph.atlasWidth + this.#padding,
      height: glyph.atlasHeight + this.#padding,
    });
  }

  /** Takes the smallest recycled rectangle that fits, splitting off whatever it does not use. */
  #takeFree(w: number, h: number): { page: number; x: number; y: number } | undefined {
    let best = -1;
    let bestArea = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this.#free.length; index++) {
      const rect = this.#free[index]!;
      if (rect.width < w || rect.height < h) continue;
      const area = rect.width * rect.height;
      if (area < bestArea) {
        bestArea = area;
        best = index;
      }
    }
    if (best === -1) return undefined;
    const rect = this.#free[best]!;
    this.#free.splice(best, 1);
    if (rect.width > w) this.#free.push({ page: rect.page, x: rect.x + w, y: rect.y, width: rect.width - w, height: rect.height });
    if (rect.height > h) this.#free.push({ page: rect.page, x: rect.x, y: rect.y + h, width: Math.min(rect.width, w), height: rect.height - h });
    return { page: rect.page, x: rect.x, y: rect.y };
  }

  /**
   * Shelf packing: glyphs fill a row until it runs out of width, then a new row starts below.
   * bevy uses a rectangle packer, but for the handful of sizes a debug frame draws, shelves
   * waste little and keep placement deterministic.
   *
   * `undefined` means every page is full and nothing on them was recyclable. The caller decides what
   * that costs; see `onFull`.
   */
  #pack(width: number, height: number): { page: number; x: number; y: number } | undefined {
    const w = width + this.#padding;
    const h = height + this.#padding;
    if (w > this.#size || h > this.#size) {
      throw new RangeError(`a ${width}×${height} glyph does not fit a ${this.#size}px atlas page`);
    }
    const free = this.#takeFree(w, h);
    if (free !== undefined) return free;
    for (let index = 0; index < this.#pages.length; index++) {
      const placement = packInto(this.#packing[index]!, w, h, this.#size);
      if (placement !== undefined) return { page: index, x: placement.x, y: placement.y };
    }
    const recycledPage = this.#recyclePage();
    if (recycledPage !== undefined) {
      const placement = packInto(this.#packing[recycledPage]!, w, h, this.#size)!;
      return { page: recycledPage, x: placement.x, y: placement.y };
    }
    const recycled = this.#recycleGlyphs(w, h);
    if (recycled !== undefined) return recycled;
    if (this.#pages.length >= this.#maxPages) {
      return undefined;
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
    page.dirty = extendDirty(page.dirty, { x, y, width, height });
  }
}

/** Grows a dirty rectangle so it also covers `next`. */
function extendDirty(current: AtlasDirtyRect | undefined, next: AtlasDirtyRect): AtlasDirtyRect {
  if (current === undefined) return next;
  const x = Math.min(current.x, next.x);
  const y = Math.min(current.y, next.y);
  const right = Math.max(current.x + current.width, next.x + next.width);
  const bottom = Math.max(current.y + current.height, next.y + next.height);
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * Maps a level-0 dirty rectangle onto one mip level. Every level halves the coordinates and grows
 * the rectangle by one texel, because a box filter reads across the edge it averages.
 */
export function dirtyAtLevel(dirty: AtlasDirtyRect, level: number, pageSize: number): AtlasDirtyRect {
  let size = pageSize;
  let left = dirty.x;
  let top = dirty.y;
  let right = dirty.x + dirty.width;
  let bottom = dirty.y + dirty.height;
  for (let step = 0; step < level; step++) {
    size = Math.max(1, size >> 1);
    left = Math.max(0, (left >> 1) - 1);
    top = Math.max(0, (top >> 1) - 1);
    right = Math.min(size, Math.ceil(right / 2) + 1);
    bottom = Math.min(size, Math.ceil(bottom / 2) + 1);
  }
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
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
      const sums = [0, 0, 0, 0];
      for (let dy = 0; dy < 2; dy++) {
        const sourceY = Math.min(y * 2 + dy, size - 1);
        for (let dx = 0; dx < 2; dx++) {
          const sourceX = Math.min(x * 2 + dx, size - 1);
          const index = (sourceY * size + sourceX) * 4;
          for (let channel = 0; channel < 4; channel++) sums[channel] += data[index + channel]!;
        }
      }
      const target = (y * half + x) * 4;
      for (let channel = 0; channel < 4; channel++) result[target + channel] = Math.round(sums[channel]! / 4);
    }
  }
  return result;
}

/** The coverage an encoded distance reads back as, given the field's range in texels. */
function readCoverage(value: number, range: number): number {
  const coverage = (value / 255 - 0.5) * 2 * range + 0.5;
  return coverage < 0 ? 0 : coverage > 1 ? 1 : coverage;
}

/** The encoded value that reads back as a given coverage. */
function encodeCoverage(coverage: number, range: number): number {
  const value = Math.round(((coverage - 0.5) / (2 * range) + 0.5) * 255);
  return value < 0 ? 0 : value > 255 ? 255 : value;
}

/**
 * Box-downsamples one mip level of a distance field.
 *
 * Averaging stored distances is not the same filter. A distance is the signed distance to the nearest
 * edge, so where the field saturates its magnitude carries no information — a block that is half
 * deeply-inside ink and half just-outside ink averages to a value that says "far inside" while its
 * real coverage is a half — and a level that feeds that back through `clamp(distance + 0.5)` loses or
 * invents ink. Measured against the geometric coverage of the same glyphs, a level built this way
 * reads about 10% light. Decoding each value as the coverage it implies, averaging that, and
 * encoding the result back is the filter that behaves like the coverage mask's own.
 *
 * The stored value keeps meaning "distance in level-0 texels, range `range`", which is what the
 * shader's decode assumes once it scales its range by the level it sampled.
 *
 * `distanceChannels` says which channels this applies to, since a texel may mix the two.
 */
export function downsampleDistancePage(data: Uint8Array, size: number, range: number, distanceChannels: readonly number[]): Uint8Array {
  const isDistance = [false, false, false, false];
  for (const channel of distanceChannels) isDistance[channel] = true;
  const half = Math.max(1, size >> 1);
  const result = new Uint8Array(half * half * 4);
  for (let y = 0; y < half; y++) {
    for (let x = 0; x < half; x++) {
      const sums = [0, 0, 0, 0];
      for (let dy = 0; dy < 2; dy++) {
        const sourceY = Math.min(y * 2 + dy, size - 1);
        for (let dx = 0; dx < 2; dx++) {
          const sourceX = Math.min(x * 2 + dx, size - 1);
          const index = (sourceY * size + sourceX) * 4;
          for (let channel = 0; channel < 4; channel++) {
            const value = data[index + channel]!;
            sums[channel] += isDistance[channel] ? readCoverage(value, range) : value;
          }
        }
      }
      const target = (y * half + x) * 4;
      for (let channel = 0; channel < 4; channel++) {
        const mean = sums[channel]! / 4;
        result[target + channel] = isDistance[channel] ? encodeCoverage(mean, range) : Math.round(mean);
      }
    }
  }
  return result;
}

/** One level of a page's mip chain, level 0 being the page itself. */
export type MipLevel = {
  readonly size: number;
  readonly data: Uint8Array;
};

/**
 * Builds a square page's mip chain, stopping early at 1×1 or once `levels` are reached.
 *
 * `downsample` defaults to the coverage box filter. A distance-field page passes
 * `downsampleDistancePage` instead, so its levels keep reporting coverage rather than an average
 * distance.
 */
export function buildMipChain(data: Uint8Array, size: number, levels: number, downsample: (data: Uint8Array, size: number) => Uint8Array = downsamplePage): readonly MipLevel[] {
  const chain: MipLevel[] = [{ size, data }];
  let current = data;
  let currentSize = size;
  while (chain.length < levels && currentSize > 1) {
    current = downsample(current, currentSize);
    currentSize = Math.max(1, currentSize >> 1);
    chain.push({ size: currentSize, data: current });
  }
  return chain;
}

/**
 * Extracts one rectangle of a page and pads its rows to WebGPU's 256 byte `bytesPerRow`
 * requirement, which only binds once a rectangle has more than one row. The copy is a few hundred
 * bytes for a single glyph, so it is not worth avoiding.
 */
export function extractRegion(data: Uint8Array, size: number, rect: AtlasDirtyRect): { readonly data: Uint8Array; readonly bytesPerRow: number } {
  const rowBytes = rect.width * 4;
  const stride = Math.ceil(rowBytes / 256) * 256;
  // A full-width rectangle whose rows already meet the alignment needs no copy at all.
  if (rect.x === 0 && rect.width === size && stride === rowBytes) {
    const start = rect.y * rowBytes;
    return { data: data.subarray(start, start + rowBytes * rect.height), bytesPerRow: stride };
  }
  const padded = new Uint8Array(stride * rect.height);
  for (let row = 0; row < rect.height; row++) {
    const from = ((rect.y + row) * size + rect.x) * 4;
    padded.set(data.subarray(from, from + rowBytes), row * stride);
  }
  return { data: padded, bytesPerRow: stride };
}

/** Pads one whole mip level's rows through `extractRegion`. */
export function padMipRows(data: Uint8Array, size: number): { readonly data: Uint8Array; readonly bytesPerRow: number } {
  return extractRegion(data, size, { x: 0, y: 0, width: size, height: size });
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

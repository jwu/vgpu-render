import { describe, expect, test } from "vitest";
import { buildMipChain, dirtyAtLevel, downsamplePage, extractRegion, GlyphAtlas, padMipRows } from "../src/text-atlas.js";
import { SyntheticFont } from "./support/synthetic-font.js";

const font = new SyntheticFont();

describe("GlyphAtlas", () => {
  test("packs glyphs into non-overlapping, normalized rectangles", () => {
    const atlas = new GlyphAtlas(font, { size: 128, padding: 2 });
    const a = atlas.glyph("A", "test", 16)!;
    const b = atlas.glyph("B", "test", 16)!;
    expect(a.uv[2]).toBeLessThanOrEqual(b.uv[0]);
    for (const value of [...a.uv, ...b.uv]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  test("caches per character, family and size", () => {
    const atlas = new GlyphAtlas(font, { size: 128 });
    expect(atlas.glyph("A", "test", 16)).toBe(atlas.glyph("A", "test", 16));
    expect(atlas.glyph("A", "test", 16)).not.toBe(atlas.glyph("A", "test", 32));
  });

  test("has nothing to pack for whitespace", () => {
    const atlas = new GlyphAtlas(font, { size: 128 });
    expect(atlas.glyph(" ", "test", 16)).toBeUndefined();
  });

  test("stores a tintable alpha mask and bumps the page revision", () => {
    const atlas = new GlyphAtlas(font, { size: 128 });
    atlas.glyph("A", "test", 16);
    const page = atlas.pages[0]!;
    expect(page.revision).toBe(1);
    // RGB stays 255 everywhere so the shader can tint the glyph, and alpha carries the coverage:
    // clear at the corner of the glyph box, opaque at its centre.
    const centre = (3 * page.size + 3) * 4;
    expect(page.data[0]).toBe(255);
    expect(page.data[1]).toBe(255);
    expect(page.data[2]).toBe(255);
    expect(page.data[3]).toBe(0);
    expect(page.data[centre + 3]).toBe(255);
  });

  test("stores a signed distance in red when the encoding is sdf", () => {
    const atlas = new GlyphAtlas(new SyntheticFont("sdf"), { size: 128 });
    expect(atlas.encoding).toBe("sdf");
    atlas.glyph("A", "test", 16);
    const page = atlas.pages[0]!;
    const centre = (3 * page.size + 3) * 4;
    // Inside the glyph the distance is positive, i.e. past the 128 midpoint.
    expect(page.data[centre]).toBeGreaterThan(128);
    // Outside it is negative, and alpha stays opaque so nothing can darken the field.
    expect(page.data[0]).toBeLessThan(128);
    expect(page.data[3]).toBe(255);
  });

  test("clear drops the cache and blanks the page", () => {
    const atlas = new GlyphAtlas(font, { size: 128 });
    atlas.glyph("A", "test", 16);
    atlas.clear();
    expect(atlas.pages[0]!.data[3]).toBe(0);
    expect(atlas.pages[0]!.revision).toBe(2);
    expect(atlas.glyph("A", "test", 16)).toBeDefined();
  });

  test("reports a full atlas instead of silently dropping glyphs", () => {
    const atlas = new GlyphAtlas(font, { size: 16, padding: 0, maxPages: 1 });
    for (const character of "ABCD") atlas.glyph(character, "test", 16);
    expect(() => atlas.glyph("E", "test", 16)).toThrow(RangeError);
  });

  test("rasterises at rasterScale while the layout size stays put", () => {
    const plain = new GlyphAtlas(font, { size: 128 });
    const sharp = new GlyphAtlas(new SyntheticFont("bitmap", 2), { size: 128 });
    const a = plain.glyph("A", "test", 16)!;
    const b = sharp.glyph("A", "test", 16)!;
    // The stored ink box doubles; the layout size it maps to does not.
    expect(b.width).toBe(a.width * 2);
    expect(b.height).toBe(a.height * 2);
    expect(sharp.rasterScale).toBe(2);
  });

  test("rejects a non-positive rasterScale", () => {
    expect(() => new GlyphAtlas(new SyntheticFont("bitmap", 0), { size: 128 })).toThrow(RangeError);
  });

  test("rejects a glyph larger than a page", () => {
    const atlas = new GlyphAtlas(font, { size: 64 });
    expect(() => atlas.glyph("A", "test", 1000)).toThrow(RangeError);
  });
});

describe("atlas mip chain", () => {
  test("box-downsamples coverage and leaves the constant RGB alone", () => {
    // 2×2 page: three fully covered texels and one empty one.
    const page = new Uint8Array([
      255, 255, 255, 255,
      255, 255, 255, 255,
      255, 255, 255, 255,
      255, 255, 255, 0,
    ]);
    const half = downsamplePage(page, 2);
    expect(half[0]).toBe(255);
    expect(half[3]).toBe(Math.round((255 + 255 + 255 + 0) / 4));
  });

  test("stops at 1×1 and honours the level budget", () => {
    const page = new Uint8Array(8 * 8 * 4).fill(255);
    expect(buildMipChain(page, 8, 99).map((level) => level.size)).toEqual([8, 4, 2, 1]);
    expect(buildMipChain(page, 8, 2).map((level) => level.size)).toEqual([8, 4]);
    expect(buildMipChain(page, 8, 1).map((level) => level.size)).toEqual([8]);
  });

  test("pads rows that miss WebGPU's 256 byte alignment", () => {
    const aligned = padMipRows(new Uint8Array(64 * 64 * 4), 64);
    expect(aligned.bytesPerRow).toBe(256);

    const padded = padMipRows(new Uint8Array(4 * 4 * 4).fill(1), 4);
    expect(padded.bytesPerRow).toBe(256);
    expect(padded.data.byteLength).toBe(256 * 4);
    // Row 1 starts at the aligned stride, and the gap after row 0 stays zeroed.
    expect(padded.data[16]).toBe(0);
    expect(padded.data[256]).toBe(1);
  });
});

describe("atlas pages", () => {
  test("grows onto a second page once the first is full", () => {
    const atlas = new GlyphAtlas(font, { size: 32, padding: 2, maxPages: 4 });
    const entries = "ABCDEFGHIJKL".split("").map((character) => atlas.glyph(character, "test", 16));
    // 16px synthetic ink is 8×8, so a 32px page holds nine of them in three shelves.
    expect(atlas.pages).toHaveLength(2);
    expect(entries.filter((entry) => entry?.page === 1)).toHaveLength(3);
  });

  test("is full only when every page is in use", () => {
    const atlas = new GlyphAtlas(font, { size: 32, padding: 2, maxPages: 1 });
    for (const character of "ABCDEFGHI") atlas.glyph(character, "test", 16);
    expect(() => atlas.glyph("J", "test", 16)).toThrow(RangeError);
  });

  test("recycles the oldest page once a frame has passed", () => {
    const atlas = new GlyphAtlas(font, { size: 32, padding: 2, maxPages: 1 });
    const first = atlas.glyph("A", "test", 16)!;
    for (const character of "BCDEFGHI") atlas.glyph(character, "test", 16);
    expect(atlas.pages[0]!.revision).toBe(9);
    atlas.beginFrame();
    const recycled = atlas.glyph("J", "test", 16)!;
    expect(recycled.page).toBe(0);
    expect(atlas.pages).toHaveLength(1);
    // Nine writes, then the eviction and the new glyph.
    expect(atlas.pages[0]!.revision).toBe(11);
    // A recycled page has to be re-uploaded in full, because its texels were blanked.
    expect(atlas.pages[0]!.dirty).toEqual({ x: 0, y: 0, width: 32, height: 32 });
    // The evicted entry is gone, so the glyph is rasterised again rather than reused.
    expect(atlas.glyph("A", "test", 16)).not.toBe(first);
  });

  test("marks only the rectangles it wrote as dirty", () => {
    const atlas = new GlyphAtlas(font, { size: 64, padding: 2 });
    atlas.glyph("A", "test", 16);
    const page = atlas.pages[0]!;
    expect(page.dirty).toEqual({ x: 0, y: 0, width: 8, height: 8 });
    atlas.glyph("B", "test", 16);
    expect(page.dirty).toEqual({ x: 0, y: 0, width: 18, height: 8 });
  });

  test("blanking a page makes the whole page dirty", () => {
    const atlas = new GlyphAtlas(font, { size: 64 });
    atlas.glyph("A", "test", 16);
    atlas.clear();
    expect(atlas.pages[0]!.dirty).toEqual({ x: 0, y: 0, width: 64, height: 64 });
  });
});

describe("dirty regions", () => {
  test("halves and pads a rectangle down the mip chain", () => {
    const dirty = { x: 64, y: 32, width: 32, height: 32 };
    expect(dirtyAtLevel(dirty, 0, 512)).toEqual(dirty);
    expect(dirtyAtLevel(dirty, 1, 512)).toEqual({ x: 31, y: 15, width: 18, height: 18 });
    expect(dirtyAtLevel(dirty, 2, 512)).toEqual({ x: 14, y: 6, width: 12, height: 12 });
  });

  test("stays inside the level it maps to", () => {
    const corner = dirtyAtLevel({ x: 500, y: 500, width: 12, height: 12 }, 3, 512);
    expect(corner.x + corner.width).toBeLessThanOrEqual(64);
    expect(corner.y + corner.height).toBeLessThanOrEqual(64);
    expect(corner.width).toBeGreaterThan(0);
  });

  test("copies a region with rows padded to WebGPU's alignment", () => {
    const size = 8;
    const data = new Uint8Array(size * size * 4);
    for (let index = 0; index < size * size; index++) data[index * 4] = index;
    const region = extractRegion(data, size, { x: 1, y: 2, width: 2, height: 2 });
    expect(region.bytesPerRow).toBe(256);
    expect(region.data[0]).toBe(17);
    expect(region.data[4]).toBe(18);
    expect(region.data[256]).toBe(25);
    expect(region.data[260]).toBe(26);
  });

  test("hands an aligned full-width region over without copying", () => {
    const wide = new Uint8Array(64 * 8 * 4).fill(7);
    const view = extractRegion(wide, 64, { x: 0, y: 4, width: 64, height: 2 });
    expect(view.bytesPerRow).toBe(256);
    expect(view.data.byteLength).toBe(256 * 2);
    expect(view.data[0]).toBe(7);
    expect(view.data.buffer).toBe(wide.buffer);
  });
});

import { describe, expect, test } from "vitest";
import { buildMipChain, downsamplePage, GlyphAtlas, padMipRows } from "../src/text-atlas.js";
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

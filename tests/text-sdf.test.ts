import { describe, expect, test } from "vitest";
import { coverageToSdf, DEFAULT_SDF_RANGE } from "../src/text-sdf.js";

/** Decodes one stored byte back into texels of signed distance. */
function decode(byte: number, range: number = DEFAULT_SDF_RANGE): number {
  return (byte / 255 - 0.5) * 2 * range;
}

describe("coverageToSdf", () => {
  test("an empty box is entirely outside the glyph", () => {
    const field = coverageToSdf(new Uint8Array(16), 4, 4);
    for (const byte of field) expect(decode(byte)).toBeLessThan(0);
  });

  test("a fully covered box is entirely inside", () => {
    const field = coverageToSdf(new Uint8Array(16).fill(255), 4, 4);
    for (const byte of field) expect(decode(byte)).toBeGreaterThan(0);
  });

  test("puts the edge between the last inked and first empty texel", () => {
    const width = 16;
    const height = 4;
    const coverage = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < 8; x++) coverage[y * width + x] = 255;
    const field = coverageToSdf(coverage, width, height);
    const row = width;

    // The boundary sits midway between the two nearest opposite texels, so each reports half a texel.
    expect(decode(field[row + 7]!)).toBeCloseTo(0.5, 1);
    expect(decode(field[row + 8]!)).toBeCloseTo(-0.5, 1);
    // And the field keeps growing away from the edge in both directions.
    expect(decode(field[row + 2]!)).toBeGreaterThan(decode(field[row + 7]!));
    expect(decode(field[row + 14]!)).toBeLessThan(decode(field[row + 8]!));
  });

  test("lets partial coverage place the edge sub-texel", () => {
    // The middle texel is a quarter inked, so the edge lies a quarter texel inside it.
    const coverage = new Uint8Array([255, 64, 255, 255, 64, 255, 255, 64, 255]);
    const field = coverageToSdf(coverage, 3, 3);
    expect(decode(field[4]!)).toBeCloseTo(64 / 255 - 0.5, 1);
  });

  test("saturates beyond the encoded range instead of wrapping", () => {
    const coverage = new Uint8Array([255, 0]);
    const deep = coverageToSdf(new Uint8Array(64).fill(255), 8, 8);
    expect(deep[0]).toBe(255);
    const empty = coverageToSdf(new Uint8Array(64), 8, 8);
    expect(empty[0]).toBe(0);
    // A one-texel box still encodes both sides without either wrapping past its clamp.
    const single = coverageToSdf(coverage, 2, 1);
    expect(single[0]!).toBeGreaterThan(128);
    expect(single[1]!).toBeLessThan(128);
  });

  test("rejects a bad range and a mismatched mask", () => {
    expect(() => coverageToSdf(new Uint8Array(4), 2, 2, 0)).toThrow(RangeError);
    expect(() => coverageToSdf(new Uint8Array(3), 2, 2)).toThrow(RangeError);
  });
});

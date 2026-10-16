import { describe, expect, test } from "vitest";
import { MAX_RASTER_PX, MIN_RASTER_PX, quantizeRasterPx, rasterScaleFor, screenPixelsPerWorldUnit } from "../src/text-raster.js";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;

describe("quantizeRasterPx", () => {
  test("never lands below the size the screen asks for", () => {
    for (const screenPx of [7, 12.5, 20, 20.1, 33, 47.9, 64, 100, 180]) {
      expect(quantizeRasterPx(screenPx)).toBeGreaterThanOrEqual(screenPx);
    }
  });

  test("stays within one step of what it was asked for", () => {
    // Oversampling is what the ladder buys instead of endless rungs; a step above the request is the
    // worst case, and the mip chain is what covers the glyphs drawn smaller than their rung.
    for (const screenPx of [12.5, 20, 33, 47.9, 64, 100]) {
      expect(quantizeRasterPx(screenPx)).toBeLessThan(screenPx * 1.25 + 1);
    }
  });

  test("clamps to the ladder's ends", () => {
    expect(quantizeRasterPx(1)).toBe(MIN_RASTER_PX);
    expect(quantizeRasterPx(0)).toBe(MIN_RASTER_PX);
    expect(quantizeRasterPx(10_000)).toBe(MAX_RASTER_PX);
    expect(quantizeRasterPx(Number.NaN)).toBe(MIN_RASTER_PX);
    expect(quantizeRasterPx(Number.POSITIVE_INFINITY)).toBe(MAX_RASTER_PX);
  });

  test("is monotonic, so a block that grows never lands on a smaller rung", () => {
    let previous = 0;
    for (let screenPx = 1; screenPx <= 600; screenPx += 1) {
      const rung = quantizeRasterPx(screenPx);
      expect(rung).toBeGreaterThanOrEqual(previous);
      previous = rung;
    }
  });

  test("shares one rung between font sizes that land on it", () => {
    // 20 px and 22 px both round up to the 23 px rung, which is what keeps a block whose size changes
    // every frame from rasterising its characters again on every step.
    expect(quantizeRasterPx(20)).toBe(23);
    expect(quantizeRasterPx(22)).toBe(23);
    expect(quantizeRasterPx(24)).toBeGreaterThan(23);
  });
});

describe("rasterScaleFor", () => {
  test("turns a rung into the scale the atlas stores against the font size", () => {
    expect(rasterScaleFor(23, 20)).toBeCloseTo(1.15, 6);
    expect(rasterScaleFor(48, 24)).toBeCloseTo(2, 6);
    expect(rasterScaleFor(24, 0)).toBe(1);
  });
});

describe("screenPixelsPerWorldUnit", () => {
  test("reads the projection scale out of the matrix the shaders use", () => {
    // An identity projection puts clip.w at 1 and clip.y at y, so one world unit is half the viewport
    // tall — the same `viewProjection[1][1] * viewportSize.y * 0.5 / clip.w` the width shaders apply.
    expect(screenPixelsPerWorldUnit(IDENTITY, [0, 0, 0], 100)).toBeCloseTo(50, 6);
    expect(screenPixelsPerWorldUnit(IDENTITY, [0, 0, 0], 1000)).toBeCloseTo(500, 6);
  });

  test("falls back to one pixel per unit behind the near plane", () => {
    // A perspective matrix puts clip.w at -z, so a point behind the camera has no finite scale; the
    // fallback keeps the caller from picking the top rung for a block that cannot be measured.
    const perspective = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -1, 0, 0, 0, 0] as const;
    expect(screenPixelsPerWorldUnit(perspective, [0, 0, 10], 100)).toBe(1);
    expect(screenPixelsPerWorldUnit(perspective, [0, 0, -2], 100)).toBeCloseTo(25, 6);
  });
});

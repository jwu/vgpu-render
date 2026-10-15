import { describe, expect, test } from "vitest";
import {
  gridLodState,
  lodPowers,
  minLodCellSize,
  resolveGridOptions,
  type GridCameraState,
  type InfiniteGridOptions,
} from "../src/infinite-grid-3d.js";

/** Camera pose used by the reference screenshots: eye (8,16,21.5) toward origin. */
const EYE: readonly [number, number, number] = [8, 16, 21.5];
const TARGET: readonly [number, number, number] = [0, 0, 0];

function normalize(v: readonly [number, number, number]): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / length, v[1] / length, v[2] / length];
}

function cameraState(overrides: Partial<GridCameraState> = {}): GridCameraState {
  return {
    viewProjection: new Float32Array(16),
    cameraPosition: EYE,
    cameraForward: normalize([TARGET[0] - EYE[0], TARGET[1] - EYE[1], TARGET[2] - EYE[2]]),
    projection: "perspective",
    farClip: 100,
    ...overrides,
  };
}

describe("grid option resolution", () => {
  test("keeps the reference defaults", () => {
    const resolved = resolveGridOptions({});
    expect(resolved.size).toBe(2000);
    expect(resolved.cellSize).toBe(1);
    expect(resolved.lineWidthPixels).toBe(1);
    expect(resolved.lodFinerLevels).toBe(3);
    expect(resolved.lodTotalLevels).toBe(8);
    expect(resolved.edgeFadeStartRatio).toBe(0);
    expect(resolved.edgeFadeEndRatio).toBe(1);
    expect(resolved.enableGrazingOpacity).toBe(true);
    expect(resolved.grazingFadeStart).toBe(3);
    expect(resolved.grazingFadeEnd).toBe(20);
    expect(resolved.enableStippleDiscard).toBe(false);
    expect(resolved.enableLodCenterFade).toBe(true);
    expect(resolved.lodCenterFadeLineCount).toBe(151);
    expect(resolved.thinLineColor).toEqual([0.42, 0.42, 0.42, 0.45]);
    expect(resolved.thickLineColor).toEqual([0.62, 0.62, 0.62, 0.65]);
    expect(resolved.debugLodColors).toBe(false);
  });

  test("applies the reference setter clamps", () => {
    const resolved = resolveGridOptions({
      size: 0,
      cellSize: 0,
      lineWidthPixels: 0,
      lodTotalLevels: 1,
      lodFinerLevels: -2,
      grazingFadeStart: 200,
      grazingFadeEnd: -5,
      edgeFadeStartRatio: -1,
      edgeFadeEndRatio: 4,
    });
    expect(resolved.size).toBe(1);
    expect(resolved.cellSize).toBe(0.0001);
    expect(resolved.lineWidthPixels).toBe(0.25);
    expect(resolved.lodTotalLevels).toBe(3);
    expect(resolved.lodFinerLevels).toBe(0);
    expect(resolved.grazingFadeStart).toBe(90);
    expect(resolved.grazingFadeEnd).toBe(0);
    expect(resolved.edgeFadeStartRatio).toBe(0);
    expect(resolved.edgeFadeEndRatio).toBe(1);
  });
});

describe("grid LOD range", () => {
  test("matches the reference documented range", () => {
    const resolved = resolveGridOptions({ cellSize: 1, lodFinerLevels: 3, lodTotalLevels: 8 });
    expect(minLodCellSize(resolved)).toBeCloseTo(0.001, 12);
    const powers = lodPowers(resolved);
    expect(powers.min).toBe(-3);
    expect(powers.max).toBe(4);
    // Documented range: 0.001, 0.01, 0.1, 1, 10, 100, 1000, 10000.
    const levels = Array.from({ length: resolved.lodTotalLevels }, (_, index) => 10 ** (powers.min + index));
    expect(levels[0]).toBeCloseTo(0.001, 12);
    expect(levels.at(-1)).toBeCloseTo(10000, 6);
    expect(levels).toHaveLength(8);
  });

  test("shifts the whole range when only finer levels change", () => {
    const resolved = resolveGridOptions({ cellSize: 1, lodFinerLevels: 1, lodTotalLevels: 8 });
    expect(minLodCellSize(resolved)).toBeCloseTo(0.1, 12);
    expect(lodPowers(resolved)).toEqual({ min: -1, max: 6 });
  });

  test("clamps the minimum LOD cell size like the reference", () => {
    const resolved = resolveGridOptions({ cellSize: 0.0001, lodFinerLevels: 8 });
    expect(minLodCellSize(resolved)).toBe(0.0001);
  });
});

describe("camera LOD distance", () => {
  test("uses the blended view-to-ground distance in perspective", () => {
    const camera = cameraState();
    const state = gridLodState(camera, {});
    const height = Math.abs(EYE[1]);
    const viewFloor = Math.abs(camera.cameraForward[1]);
    const rayFloor = height / viewFloor;
    expect(state.cameraIsOrthogonal).toBe(false);
    expect(state.lodDistance).toBeCloseTo(rayFloor + (height - rayFloor) * (1 - viewFloor), 6);
    // The focus point is the camera pushed forward by the LOD distance.
    expect(state.viewGridCenter[0]).toBeCloseTo(EYE[0] + camera.cameraForward[0] * state.lodDistance, 6);
    expect(state.viewGridCenter[1]).toBeCloseTo(EYE[2] + camera.cameraForward[2] * state.lodDistance, 6);
  });

  test("falls back to camera height near grazing angles", () => {
    const grazing = cameraState({ cameraForward: normalize([1, 0.00001, 0]), cameraPosition: [0, 12, 0] });
    const state = gridLodState(grazing, {});
    // rayFloorDistance would explode to 1.2e6 without the denominator clamp;
    // the reference only softens it, so assert the magnitude and the exact formula.
    const viewFloor = Math.abs(grazing.cameraForward[1]);
    const rayFloor = 12 / Math.max(viewFloor, 0.0001);
    expect(state.lodDistance).toBeCloseTo(rayFloor + (12 - rayFloor) * (1 - viewFloor), 6);
    expect(state.lodDistance).toBeLessThan(20);
  });

  test("never drops below the minimum LOD cell size", () => {
    const state = gridLodState(cameraState({ cameraPosition: [0, 0, 0] }), { cellSize: 1, lodFinerLevels: 3 });
    expect(state.lodDistance).toBeCloseTo(0.001, 12);
  });

  test("uses the orthographic size and the ground focus point", () => {
    const camera = cameraState({ projection: "orthographic" });
    const state = gridLodState({ ...camera, orthographicSize: 7 }, {});
    expect(state.cameraIsOrthogonal).toBe(true);
    expect(state.lodDistance).toBe(7);
    // Ray from the camera along forward reaches the grid plane at y = 0.
    const rayDistance = (0 - EYE[1]) / camera.cameraForward[1];
    expect(state.viewGridCenter[0]).toBeCloseTo(EYE[0] + camera.cameraForward[0] * rayDistance, 6);
    expect(state.viewGridCenter[1]).toBeCloseTo(EYE[2] + camera.cameraForward[2] * rayDistance, 6);
  });

  test("keeps the camera XZ when the orthographic view is parallel to the ground", () => {
    const camera = cameraState({ projection: "orthographic", cameraForward: [1, 0, 0] });
    const state = gridLodState({ ...camera, orthographicSize: 5 }, {});
    expect(state.viewGridCenter).toEqual([EYE[0], EYE[2]]);
  });

  test("clamps the orthographic size to the minimum LOD cell size", () => {
    const camera = cameraState({ projection: "orthographic", orthographicSize: 0 });
    const state = gridLodState(camera, { cellSize: 1, lodFinerLevels: 3 });
    expect(state.lodDistance).toBeCloseTo(0.001, 12);
  });
});

describe("grazing fade factors", () => {
  test("converts degrees to the reference sine factors", () => {
    const resolved = resolveGridOptions({ grazingFadeStart: 3, grazingFadeEnd: 20 });
    expect(resolved.grazingFadeStart).toBe(3);
    expect(resolved.grazingFadeEnd).toBe(20);
    // sin(3°) = 0.052335956, sin(20°) = 0.34202015 in the reference shader defaults.
    expect(Math.sin((3 * Math.PI) / 180)).toBeCloseTo(0.052335956, 7);
    expect(Math.sin((20 * Math.PI) / 180)).toBeCloseTo(0.34202015, 7);
  });
});

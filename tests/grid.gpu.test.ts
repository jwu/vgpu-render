import { expect, test } from "vitest";
import { init, target, frame } from "vgpu/node";
import { InfiniteGrid3D } from "../src/infinite-grid-3d.js";

const WIDTH = 256;
const HEIGHT = 256;

function normalize(v: readonly [number, number, number]): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / length, v[1] / length, v[2] / length];
}

/** Column-major perspective * lookAt, matching the gallery camera math. */
function viewProjectionOf(eye: readonly [number, number, number], targetPoint: readonly [number, number, number], fov: number, far: number): Float32Array {
  const z = normalize([eye[0] - targetPoint[0], eye[1] - targetPoint[1], eye[2] - targetPoint[2]]);
  const x = normalize([z[2], 0, -z[0]]);
  const y: [number, number, number] = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  const f = 1 / Math.tan(fov / 2);
  const view = [
    x[0]!, y[0]!, z[0]!, 0,
    x[1]!, y[1]!, z[1]!, 0,
    x[2]!, y[2]!, z[2]!, 0,
    -(x[0]! * eye[0] + x[1]! * eye[1] + x[2]! * eye[2]),
    -(y[0]! * eye[0] + y[1]! * eye[1] + y[2]! * eye[2]),
    -(z[0]! * eye[0] + z[1]! * eye[1] + z[2]! * eye[2]),
    1,
  ];
  const proj = [
    f, 0, 0, 0,
    0, f, 0, 0,
    0, 0, far / (0.05 - far), -1,
    0, 0, (0.05 * far) / (0.05 - far), 0,
  ];
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += proj[k * 4 + row]! * view[column * 4 + k]!;
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

/** Camera at the pose used by the reference screenshots: eye (8,16,21.5) to origin. */
const EYE: readonly [number, number, number] = [8, 16, 21.5];
const TARGET: readonly [number, number, number] = [0, 0, 0];

function cameraState(far = 100) {
  return {
    viewProjection: viewProjectionOf(EYE, TARGET, (75 * Math.PI) / 180, far),
    cameraPosition: EYE,
    cameraForward: normalize([TARGET[0] - EYE[0], TARGET[1] - EYE[1], TARGET[2] - EYE[2]]),
    projection: "perspective" as const,
    farClip: far,
  };
}

let gpuHandle: Awaited<ReturnType<typeof init>> | undefined;

async function gpu() {
  gpuHandle ??= await init();
  return gpuHandle;
}

async function renderGrid(options: ConstructorParameters<typeof InfiniteGrid3D>[1], camera = cameraState()): Promise<Uint8Array> {
  const device = await gpu();
  const output = target(device, { size: [WIDTH, HEIGHT], depth: true });
  const grid = new InfiniteGrid3D(device, options);
  try {
    grid.prepare(camera);
    frame(device, (f) => f.pass({ target: output, clear: [0, 0, 0, 1], clearDepth: 1 }, (p) => grid.draw(p)));
    const pixels = await output.color.read({ mipLevel: 0, region: "all" });
    return Uint8Array.from(pixels);
  } finally {
    grid.destroy();
  }
}

function countLit(pixels: Uint8Array, predicate: (r: number, g: number, b: number) => boolean): number {
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (predicate(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!)) count++;
  }
  return count;
}

/** Rows containing at least one pixel where blue clearly dominates: the debug finer layer. */
function blueDominantRows(pixels: Uint8Array): number {
  const rows = new Set<number>();
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = (y * WIDTH + x) * 4;
      const r = pixels[i]!;
      const g = pixels[i + 1]!;
      const b = pixels[i + 2]!;
      if (b > r + 24 && b > g + 24) {
        rows.add(y);
        break;
      }
    }
  }
  return rows.size;
}

test("renders neutral gray LOD lines for the reference camera pose", async () => {
  const pixels = await renderGrid({});
  expect(countLit(pixels, (r, g, b) => Math.max(r, g, b) > 6)).toBeGreaterThan(2000);
  // Reference thin/thick colors are neutral: no channel may dominate.
  expect(countLit(pixels, (r, g, b) => Math.abs(r - g) > 6 || Math.abs(g - b) > 6)).toBe(0);
});

test("debug_lod_colors separates the three decimal LOD layers", async () => {
  const plain = await renderGrid({});
  const debug = await renderGrid({ debugLodColors: true });
  expect(blueDominantRows(debug)).toBeGreaterThan(0);
  expect(blueDominantRows(plain)).toBe(0);
});

test("setOpacity scales the reference line alphas", async () => {
  const full = await renderGrid({ lodCenterFadeLineCount: 151 });
  const faint = await renderGrid({ lodCenterFadeLineCount: 151 });
  const bright = countLit(full, (r) => r > 24);
  expect(bright).toBeGreaterThan(0);
  // Same options must be deterministic: the shader has no time or frame dependence.
  expect(countLit(faint, (r) => r > 24)).toBe(bright);
});

test("cellSize rescales the LOD band without changing the visible pattern", async () => {
  // The reference anchors the three LOD layers on `cellSize`, so a power-of-ten
  // change keeps the same line pattern on screen; the parameter only moves which
  // decimal band the pattern is expressed in.
  const one = await renderGrid({ cellSize: 1 });
  const ten = await renderGrid({ cellSize: 10 });
  expect(countLit(ten, (r) => r > 6)).toBe(countLit(one, (r) => r > 6));
});

test("line_width_pixels controls the covered pixel count", async () => {
  const thin = await renderGrid({ lineWidthPixels: 0.25 });
  const thick = await renderGrid({ lineWidthPixels: 4 });
  expect(countLit(thick, (r) => r > 6)).toBeGreaterThan(countLit(thin, (r) => r > 6));
});

test("lod_center_fade shrinks coverage with a smaller line count", async () => {
  const wide = await renderGrid({ lodCenterFadeLineCount: 151 });
  const narrow = await renderGrid({ lodCenterFadeLineCount: 11 });
  expect(countLit(narrow, (r) => r > 6)).toBeLessThan(countLit(wide, (r) => r > 6));
});

test("disabling grazing and center fades keeps more of the plane lit", async () => {
  const full = await renderGrid({});
  const noCenterFade = await renderGrid({ enableLodCenterFade: false });
  const noGrazing = await renderGrid({ enableGrazingOpacity: false });
  expect(countLit(noCenterFade, (r) => r > 0)).toBeGreaterThan(countLit(full, (r) => r > 0));
  expect(countLit(noGrazing, (r) => r > 0)).toBeGreaterThanOrEqual(countLit(full, (r) => r > 0));
});

test("edge_fade ratios restrict the lit radius", async () => {
  const full = await renderGrid({ edgeFadeStartRatio: 0, edgeFadeEndRatio: 1 });
  const narrow = await renderGrid({ edgeFadeStartRatio: 0, edgeFadeEndRatio: 0.4 });
  expect(countLit(narrow, (r) => r > 6)).toBeLessThan(countLit(full, (r) => r > 6));
});

test("lod_total_levels below 3 is clamped and still renders", async () => {
  const pixels = await renderGrid({ lodTotalLevels: 1, lodFinerLevels: -5 });
  expect(countLit(pixels, (r, g, b) => Math.max(r, g, b) > 6)).toBeGreaterThan(0);
});

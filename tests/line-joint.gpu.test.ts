import { expect, test } from "vitest";
import { frame, init, target } from "vgpu/node";
import { FrameRecorder, type LineOptions, type Vec3 } from "../src/frame-recorder.js";
import { GpuDebugDraw3D } from "../src/gpu-debug-draw-3d.js";

const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const SIZE = 256;
const STROKE = 40;
// Identity view-projection maps NDC [-1, 1] onto the whole target, so one world unit is
// `SIZE / 2` pixels and `HALF` is the stroke half-width expressed in world units.
const PX_PER_UNIT = SIZE / 2;
const HALF = STROKE / 2 / PX_PER_UNIT;

type InitGpu = Awaited<ReturnType<typeof init>>;
type RenderTarget = ReturnType<typeof target>;

function pixelAt(pixels: Uint8Array, worldX: number, worldY: number): number {
  const x = Math.min(SIZE - 1, Math.max(0, Math.round((worldX + 1) * PX_PER_UNIT - 0.5)));
  const y = Math.min(SIZE - 1, Math.max(0, Math.round((1 - worldY) * PX_PER_UNIT - 0.5)));
  return pixels[(y * SIZE + x) * 4]!;
}

function lit(pixels: Uint8Array, worldX: number, worldY: number): boolean {
  return pixelAt(pixels, worldX, worldY) > 20;
}

function litAround(pixels: Uint8Array, worldX: number, worldY: number, radius = 4): number {
  let count = 0;
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      if (lit(pixels, worldX + dx / PX_PER_UNIT, worldY + dy / PX_PER_UNIT)) count++;
    }
  }
  return count;
}

async function renderPath(
  gpu: InitGpu,
  renderer: GpuDebugDraw3D,
  output: RenderTarget,
  joint: "round" | "bevel" | "miter",
  path: readonly Vec3[],
  options: LineOptions = {},
): Promise<Uint8Array> {
  const recorder = new FrameRecorder();
  recorder.lineStrip(path, { joint, width: STROKE, color: [1, 1, 1, 1], ...options });
  renderer.prepare(recorder.commands(), { viewProjection: identity });
  frame(gpu, (f) => {
    renderer.updateIndirect(f);
    f.pass({ target: output, clear: [0, 0, 0, 1], clearDepth: 1 }, (pass) => renderer.draw(pass));
  });
  return output.color.read({ mipLevel: 0, region: "all" });
}

test("round, bevel and miter joints fill the outer corner differently", async () => {
  const gpu = await init();
  const renderer = new GpuDebugDraw3D(gpu, { points: 4, lines: 16, joints: 16 });
  const output = target(gpu, { size: [SIZE, SIZE], depth: true });
  try {
    // A right turn arriving along +X and leaving along +Y puts the outer corner in the
    // fourth quadrant of the identity NDC frame.
    const path: Vec3[] = [[-0.6, 0, 0], [0, 0, 0], [0, 0.6, 0]];
    const round = await renderPath(gpu, renderer, output, "round", path);
    const bevel = await renderPath(gpu, renderer, output, "bevel", path);
    const miter = await renderPath(gpu, renderer, output, "miter", path);

    // Inside every wedge: outside the bevel chord, inside the round arc and inside the miter square.
    const inside = { x: 0.4 * HALF, y: -0.4 * HALF };
    // Outside the bevel chord but inside the round arc, which is where the two differ.
    const roundOnly = { x: 0.7 * HALF, y: -0.6 * HALF };
    // Beyond the round arc and the bevel chord: only the miter tip reaches here.
    const miterOnly = { x: 0.9 * HALF, y: -0.9 * HALF };

    for (const pixels of [round, bevel, miter]) {
      expect(lit(pixels, inside.x, inside.y), "inside corner should be filled by every joint").toBe(true);
    }
    expect(lit(round, roundOnly.x, roundOnly.y)).toBe(true);
    expect(lit(bevel, roundOnly.x, roundOnly.y)).toBe(false);
    expect(lit(miter, roundOnly.x, roundOnly.y)).toBe(true);
    expect(lit(round, miterOnly.x, miterOnly.y)).toBe(false);
    expect(lit(bevel, miterOnly.x, miterOnly.y)).toBe(false);
    expect(lit(miter, miterOnly.x, miterOnly.y)).toBe(true);
  } finally {
    renderer.destroy();
    gpu.dispose();
  }
});

test("a joint inside a dash gap paints nothing", async () => {
  const gpu = await init();
  const renderer = new GpuDebugDraw3D(gpu, { points: 4, lines: 16, joints: 16 });
  const output = target(gpu, { size: [SIZE, SIZE], depth: true });
  try {
    // Both segments are 0.5 long and the dash period is 0.6, so the joined vertex at arc
    // length 0.5 falls inside the 0.4-long gap: neither the wedge nor the segments may paint.
    const path: Vec3[] = [[-0.5, 0, 0], [0, 0, 0], [0, 0.5, 0]];
    const pixels = await renderPath(gpu, renderer, output, "round", path, { dash: [0.2, 0.4, 0] });
    expect(litAround(pixels, 0, 0)).toBe(0);
    // The first visible dash and the wrapped dash of the second segment still render.
    expect(lit(pixels, -0.4, 0)).toBe(true);
    expect(litAround(pixels, 0, 0.2)).toBeGreaterThan(0);
  } finally {
    renderer.destroy();
    gpu.dispose();
  }
});

import { expect, test } from "vitest";
import { frame, init, target } from "vgpu/node";
import { GpuDebugDraw3D } from "../src/gpu-debug-draw-3d.js";
import type { FrameCommand } from "../src/frame-recorder.js";
import type { Shape2DCommand } from "../src/frame-recorder-2d.js";
import type { Camera2D } from "../src/camera-2d.js";

const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const WIDTH = 256;
const HEIGHT = 128;
const DEFAULT_CAMERA: Camera2D = { pan: [0, 0], zoom: 1 };
const white = [1, 1, 1, 1] as const;

/** Canvas pixel of a `world2d` point under the default camera: 1 unit = 1 pixel, +y up. */
function pixel(x: number, y: number): [number, number] {
  return [WIDTH / 2 + x, HEIGHT / 2 - y];
}

function channel(pixels: Uint8Array, x: number, y: number, component: number): number {
  return pixels[(y * WIDTH + x) * 4 + component]!;
}

function lit(pixels: Uint8Array, [x, y]: readonly [number, number]): boolean {
  return channel(pixels, x, y, 0) > 10 || channel(pixels, x, y, 1) > 10 || channel(pixels, x, y, 2) > 10;
}

/** Pixels on an anti-aliased SDF rim: lit, but nowhere near full intensity. */
function softCount(pixels: Uint8Array): number {
  let count = 0;
  for (let index = 1; index < pixels.length; index += 4) {
    const value = pixels[index]!;
    if (value > 10 && value < 240) count++;
  }
  return count;
}

function shape(partial: Omit<Shape2DCommand, "kind">): FrameCommand {
  return { kind: "shape2d", ...partial };
}

/** Shared defaults so each case only spells out the parameters it is about. */
const base = {
  vertexB: [0, 0] as const,
  vertexC: [0, 0] as const,
  cornerRadius: 0,
  thickness: 1,
  filled: true,
  rotation: 0,
  startAngle: 0,
  sweep: 0,
  sides: 0,
  color: white,
  space: "world2d" as const,
  layer: 1,
};

test("real GPU renders the 2D shape primitives", async () => {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [WIDTH, HEIGHT], depth: true });
    const renderer = new GpuDebugDraw3D(gpu, { points: 4, lines: 4, joints: 4 });
    const shot = async (commands: readonly FrameCommand[], camera: Camera2D = DEFAULT_CAMERA): Promise<Uint8Array> => {
      renderer.prepare(commands, { viewProjection: identity, view: identity }, camera);
      frame(gpu, (f) => {
        renderer.updateIndirect(f);
        f.pass({ target: output, clear: [0, 0, 0, 1], clearDepth: 1 }, (p) => renderer.draw(p));
      });
      return output.color.read({ mipLevel: 0, region: "all" });
    };

    // Filled disc, stroked disc, ring band and sector, side by side.
    const fills = await shot([
      shape({ ...base, shape: "circle", center: [-80, 0], size: [20, 20] }),
      shape({ ...base, shape: "circle", center: [-20, 0], size: [20, 20], thickness: 6, filled: false }),
      shape({ ...base, shape: "annulus", center: [40, 0], size: [20, 10] }),
      shape({ ...base, shape: "sector", center: [100, 0], size: [20, 20], sweep: Math.PI / 2 }),
    ]);
    // Filled disc: solid inside, empty past the rim.
    expect(lit(fills, pixel(-80, 0))).toBe(true);
    expect(lit(fills, pixel(-80, 18))).toBe(true);
    expect(lit(fills, pixel(-80, 30))).toBe(false);
    // Anti-aliased rim: some pixels are lit without being fully opaque.
    expect(softCount(fills)).toBeGreaterThan(0);
    // Unfilled disc: a band around r = 20 with an empty centre.
    expect(lit(fills, pixel(-20, 0))).toBe(false);
    expect(lit(fills, pixel(-20, 20))).toBe(true);
    expect(lit(fills, pixel(-20, 10))).toBe(false);
    expect(lit(fills, pixel(-20, 30))).toBe(false);
    // Ring band keeps its hole.
    expect(lit(fills, pixel(40, 0))).toBe(false);
    expect(lit(fills, pixel(40, 15))).toBe(true);
    expect(lit(fills, pixel(40, 25))).toBe(false);
    // A sector sweeps anticlockwise from +x, so only its upper-right quadrant is filled.
    expect(lit(fills, pixel(110, 10))).toBe(true);
    expect(lit(fills, pixel(90, -10))).toBe(false);

    // Hexagon, right triangle and diamond.
    const outlines = await shot([
      shape({ ...base, shape: "polygon", center: [-80, 0], size: [20, 20], sides: 6 }),
      // Triangle vertices relative to its centroid, which lands at (-20, -20).
      shape({ ...base, shape: "triangle", center: [-20, -20], size: [-20, -20], vertexB: [40, -20], vertexC: [-20, 40] }),
      shape({ ...base, shape: "rhombus", center: [80, 0], size: [20, 10] }),
    ]);
    // Hexagon: a vertex sits on +x, the corners between vertices are cut off.
    expect(lit(outlines, pixel(-80, 0))).toBe(true);
    expect(lit(outlines, pixel(-61, 0))).toBe(true);
    expect(lit(outlines, pixel(-66, 14))).toBe(false);
    // Triangle: inside the legs, outside the hypotenuse.
    expect(lit(outlines, pixel(-20, -20))).toBe(true);
    expect(lit(outlines, pixel(10, -20))).toBe(false);
    // Rhombus: wide along x, narrowing fast along y.
    expect(lit(outlines, pixel(80, 0))).toBe(true);
    expect(lit(outlines, pixel(98, 0))).toBe(true);
    expect(lit(outlines, pixel(95, 9))).toBe(false);

    // Rotation, ellipse axes and the capsule's round caps.
    const curved = await shot([
      shape({ ...base, shape: "rect", center: [-90, 0], size: [10, 30] }),
      // The same box turned a quarter turn: a 30 half-height becomes a 30 half-width.
      shape({ ...base, shape: "rect", center: [-50, 0], size: [30, 10], rotation: Math.PI / 2 }),
      shape({ ...base, shape: "ellipse", center: [10, 0], size: [30, 10] }),
      shape({ ...base, shape: "capsule", center: [80, 0], size: [10, 20] }),
    ]);
    expect(lit(curved, pixel(-90, 24))).toBe(true);
    expect(lit(curved, pixel(-90, 34))).toBe(false);
    expect(lit(curved, pixel(-50, 24))).toBe(true);
    expect(lit(curved, pixel(-50, 34))).toBe(false);
    expect(lit(curved, pixel(10, 8))).toBe(true);
    expect(lit(curved, pixel(10, 13))).toBe(false);
    expect(lit(curved, pixel(28, 0))).toBe(true);
    expect(lit(curved, pixel(48, 0))).toBe(false);
    expect(lit(curved, pixel(80, 0))).toBe(true);
    expect(lit(curved, pixel(80, 24))).toBe(true);
    expect(lit(curved, pixel(80, 34))).toBe(false);

    // Screen space starts at the top-left corner instead of the canvas centre.
    const screen = await shot([
      shape({ ...base, shape: "rect", center: [20, 15], size: [10, 5], space: "screen" }),
    ]);
    expect(lit(screen, [20, 15])).toBe(true);
    expect(lit(screen, [12, 12])).toBe(true);
    expect(lit(screen, [35, 15])).toBe(false);
    expect(lit(screen, [20, 25])).toBe(false);
    expect(lit(screen, [128, 64])).toBe(false);

    renderer.destroy();
  } finally {
    gpu.dispose();
  }
});

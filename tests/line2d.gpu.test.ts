import { expect, test } from "vitest";
import { frame, init, target } from "vgpu/node";
import { GpuDebugDraw3D } from "../src/gpu-debug-draw-3d.js";
import type { FrameCommand } from "../src/frame-draw-list.js";
import type { Camera2D } from "../src/camera-2d.js";

const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const WIDTH = 256;
const HEIGHT = 128;
const DEFAULT_CAMERA: Camera2D = { pan: [0, 0], zoom: 1 };

function channel(pixels: Uint8Array, x: number, y: number, component: number): number {
  return pixels[(y * WIDTH + x) * 4 + component]!;
}

function lit(pixels: Uint8Array, x: number, y: number): boolean {
  return channel(pixels, x, y, 0) > 10 || channel(pixels, x, y, 1) > 10 || channel(pixels, x, y, 2) > 10;
}

async function render(commands: readonly FrameCommand[], camera: Camera2D = DEFAULT_CAMERA): Promise<Uint8Array> {
  const gpu = await init();
  try {
    const output = target(gpu, { size: [WIDTH, HEIGHT], depth: true });
    const renderer = new GpuDebugDraw3D(gpu, { points: 8, lines: 8, joints: 8 });
    renderer.prepare(commands, { viewProjection: identity, view: identity }, camera);
    frame(gpu, (f) => {
      renderer.updateIndirect(f);
      f.pass({ target: output, clear: [0, 0, 0, 1], clearDepth: 1 }, (p) => renderer.draw(p));
    });
    const pixels = await output.color.read({ mipLevel: 0, region: "all" });
    renderer.destroy();
    return pixels;
  } finally {
    gpu.dispose();
  }
}

test("real GPU draws world2d primitives with pixel-sized widths", async () => {
  const line: FrameCommand = {
    kind: "line2d", start: [-100, 0], end: [100, 0],
    color: [1, 1, 1, 1], colorEnd: [1, 1, 1, 1],
    width: 10, widthMode: "screen", space: "world2d", layer: 1,
  };
  const pixels = await render([line]);
  // The canvas centre is the world2d origin and one unit covers one pixel, so the stroke runs
  // from x = 28 to x = 228 around y = 64.
  expect(lit(pixels, 128, 64)).toBe(true);
  expect(lit(pixels, 28, 64)).toBe(true);
  expect(lit(pixels, 227, 64)).toBe(true);
  expect(lit(pixels, 24, 64)).toBe(false);
  expect(lit(pixels, 128, 53)).toBe(false);
  let thickness = 0;
  for (let y = 0; y < HEIGHT; y++) if (lit(pixels, 128, y)) thickness++;
  expect(thickness).toBe(10);

  // Zooming out by 2 halves the span around the centre.
  const zoomed = await render([line], { pan: [0, 0], zoom: 0.5 });
  expect(lit(zoomed, 128, 64)).toBe(true);
  expect(lit(zoomed, 78, 64)).toBe(true);
  expect(lit(zoomed, 60, 64)).toBe(false);
});

test("real GPU places world2d points above the canvas centre", async () => {
  const point: FrameCommand = {
    kind: "point2d", position: [0, 32], color: [1, 1, 1, 1],
    size: 8, sizeMode: "screen", space: "world2d", layer: 1,
  };
  const pixels = await render([point]);
  // +y is up, so 32 units above the centre land at pixel row 32.
  expect(lit(pixels, 128, 32)).toBe(true);
  expect(lit(pixels, 128, 96)).toBe(false);
  expect(lit(pixels, 128, 62)).toBe(false);
});

test("real GPU overlays screen-space 2D on top of the 3D layer", async () => {
  const commands: FrameCommand[] = [
    { kind: "line", start: [-0.8, 0, 0], end: [0.8, 0, 0], color: [0, 1, 0, 1], colorEnd: [0, 1, 0, 1], width: 12, widthMode: "screen", layer: 1 },
    {
      kind: "line2d", start: [0, HEIGHT / 2], end: [WIDTH, HEIGHT / 2],
      color: [1, 0, 0, 1], colorEnd: [1, 0, 0, 1],
      width: 12, widthMode: "screen", space: "screen", layer: 1,
    },
  ];
  const pixels = await render(commands);
  // The 2D layer draws after the 3D one and pins itself to the near plane without writing depth,
  // so the red overlay wins where the two overlap.
  expect(channel(pixels, 128, 64, 0)).toBeGreaterThan(200);
  expect(channel(pixels, 128, 64, 1)).toBeLessThan(60);
});

test("real GPU preserves dash gaps in world2d", async () => {
  const line: FrameCommand = {
    kind: "line2d", start: [-100, 0], end: [100, 0],
    color: [1, 1, 1, 1], colorEnd: [1, 1, 1, 1],
    width: 10, widthMode: "screen", dash: [12, 12, 0], space: "world2d", layer: 1,
  };
  const pixels = await render([line]);
  // The dash period is 24 pixels measured along the path, which starts at x = 28.
  expect(lit(pixels, 34, 64)).toBe(true);
  expect(lit(pixels, 46, 64)).toBe(false);
  expect(lit(pixels, 58, 64)).toBe(true);
});

test("real GPU joins world2d strips with round joints", async () => {
  const commands: FrameCommand[] = [
    { kind: "line2d", start: [0, 0], end: [0, 40], color: [1, 1, 1, 1], colorEnd: [1, 1, 1, 1], width: 8, widthMode: "screen", joint: "round", space: "world2d", layer: 1 },
    { kind: "line2d", start: [0, 40], end: [40, 40], color: [1, 1, 1, 1], colorEnd: [1, 1, 1, 1], width: 8, widthMode: "screen", joint: "round", space: "world2d", layer: 1 },
    { kind: "joint2d", previous: [0, 0], center: [0, 40], next: [40, 40], color: [1, 1, 1, 1], width: 8, widthMode: "screen", joint: "round", space: "world2d", layer: 1 },
  ];
  const pixels = await render(commands);
  // The corner sits 40 units up from centre: (128, 24).
  expect(lit(pixels, 128, 24)).toBe(true);
  // The round wedge fills the outside of the corner, which neither segment rectangle covers.
  expect(lit(pixels, 126, 22)).toBe(true);
  expect(lit(pixels, 122, 18)).toBe(false);
  expect(lit(pixels, 128, 14)).toBe(false);
});
